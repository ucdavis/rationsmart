"""
Authentication utilities for the Feed Formulation Backend
Handles PIN hashing, verification, and user authentication operations
Fixed: Email lookup to exclude NULL values
"""

import hashlib
import secrets
import random
import uuid
from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import UserInformationModel, CountryModel

def hash_pin(pin: str) -> str:
    """
    Hash a 4-digit PIN using SHA-256 with salt
    Args:
        pin: 4-digit PIN string
    Returns:
        Hashed PIN string
    """
    # Generate a random salt
    salt = secrets.token_hex(16)
    
    # Combine PIN with salt and hash
    pin_with_salt = f"{pin}{salt}"
    hashed = hashlib.sha256(pin_with_salt.encode()).hexdigest()
    
    # Return salt + hash (salt is first 32 chars, hash is the rest)
    return f"{salt}{hashed}"

def verify_pin(pin: str, hashed_pin: str) -> bool:
    """
    Verify a PIN against its hash
    Args:
        pin: Plain text 4-digit PIN
        hashed_pin: Stored hash from database
    Returns:
        True if PIN matches, False otherwise
    """
    if len(hashed_pin) < 32:
        return False
    
    # Extract salt (first 32 characters) and hash (rest)
    salt = hashed_pin[:32]
    stored_hash = hashed_pin[32:]
    
    # Hash the provided PIN with the stored salt
    pin_with_salt = f"{pin}{salt}"
    new_hash = hashlib.sha256(pin_with_salt.encode()).hexdigest()
    
    # Compare hashes using constant-time comparison
    return secrets.compare_digest(new_hash, stored_hash)

def get_user_by_email(db: Session, email_id: str) -> Optional[UserInformationModel]:
    """
    Get user by email address
    Args:
        db: Database session
        email_id: User's email address
    Returns:
        UserInformationModel if found, None otherwise
    """
    return db.query(UserInformationModel).filter(
        UserInformationModel.email_id == email_id.lower().strip(),
        UserInformationModel.email_id.isnot(None)
    ).first()

def get_user_by_id(db: Session, user_id: str) -> Optional[UserInformationModel]:
    """
    Get user by UUID
    Args:
        db: Database session  
        user_id: User's UUID
    Returns:
        UserInformationModel if found, None otherwise
    """
    return db.query(UserInformationModel).filter(
        UserInformationModel.id == user_id
    ).first()

def get_country_by_id(db: Session, country_id: str) -> Optional[CountryModel]:
    """
    Get country by UUID
    Args:
        db: Database session
        country_id: Country's UUID
    Returns:
        CountryModel if found, None otherwise
    """
    return db.query(CountryModel).filter(
        CountryModel.id == country_id
    ).first()

def get_all_countries(db: Session) -> list[CountryModel]:
    """
    Get all active countries for dropdown
    Args:
        db: Database session
    Returns:
        List of active CountryModel objects
    """
    return db.query(CountryModel).filter(CountryModel.is_active == True).order_by(CountryModel.name).all()

def create_user(db: Session, name: str, email_id: str, pin: str, country_id: str) -> UserInformationModel:
    """
    Create a new user with hashed PIN
    Args:
        db: Database session
        name: User's full name
        email_id: User's email address  
        pin: Plain text 4-digit PIN
        country_id: Country UUID
    Returns:
        Created UserInformationModel
    """
    # Hash the PIN
    hashed_pin = hash_pin(pin)
    
    # Create new user
    db_user = UserInformationModel(
        name=name.strip(),
        email_id=email_id.lower().strip(),
        pin_hash=hashed_pin,
        country_id=country_id
    )
    
    db.add(db_user)
    # Don't commit here - let the calling function handle the commit
    db.flush()  # This ensures the user gets an ID but doesn't commit the transaction
    
    return db_user

def authenticate_user(db: Session, email_id: str, pin: str) -> tuple[Optional[UserInformationModel], Optional[str]]:
    """
    Authenticate user with email and PIN
    Args:
        db: Database session
        email_id: User's email address
        pin: Plain text 4-digit PIN
    Returns:
        Tuple of (UserInformationModel if authenticated, error_message if failed)
        If authentication succeeds, error_message will be None
        If authentication fails, UserInformationModel will be None and error_message will contain the specific reason
    """
    user = get_user_by_email(db, email_id)
    
    if not user:
        return None, "User not found.\nPlease check the e-mail Id entered."
    
    if not user.pin_hash:
        return None, "User not found.\nPlease check the e-mail Id entered."
    
    # Check if user account is active
    if not user.is_active:
        return None, "Account is disabled. Please contact administrator."
    
    if not verify_pin(pin, user.pin_hash):
        return None, "PIN is incorrect. Please try again."
    
    return user, None

def generate_random_pin() -> str:
    """
    Generate a random 4-digit PIN
    Returns:
        4-digit PIN as string
    """
    return f"{random.randint(1000, 9999)}"

def forgot_pin_direct(db: Session, email_id: str) -> tuple[bool, str, Optional[str]]:
    """
    Direct forgot PIN implementation - immediately updates user's PIN
    Args:
        db: Database session
        email_id: User's email address
    Returns:
        Tuple of (success, message, new_pin)
    """
    # Check if user exists
    user = get_user_by_email(db, email_id)
    if not user:
        return False, "Email address not found in our system", None
    
    # Generate new random PIN
    new_pin = generate_random_pin()
    
    try:
        # Hash new PIN and update user immediately
        new_pin_hash = hash_pin(new_pin)
        user.pin_hash = new_pin_hash
        user.updated_at = datetime.utcnow()
        
        # Flush to ensure database is updated
        db.flush()
        
        return True, "PIN updated successfully", new_pin
    except Exception as e:
        return False, f"Failed to update PIN: {str(e)}", None

def change_user_pin(db: Session, email_id: str, current_pin: str, new_pin: str) -> tuple[bool, str]:
    """
    Change user's PIN after verifying current PIN
    Args:
        db: Database session
        email_id: User's email address
        current_pin: Current PIN for verification
        new_pin: New PIN to set
    Returns:
        Tuple of (success, message)
    """
    # Authenticate user with current PIN
    user, error_message = authenticate_user(db, email_id, current_pin)
    if not user:
        return False, error_message
    
    # Hash new PIN
    new_pin_hash = hash_pin(new_pin)
    
    try:
        # Update PIN
        user.pin_hash = new_pin_hash
        user.updated_at = datetime.utcnow()
        
        db.flush()
        return True, "PIN changed successfully"
    except Exception as e:
        return False, f"Failed to change PIN: {str(e)}"

def is_admin_user(user_id: str, db: Session) -> bool:
    """
    Check if a user has admin privileges for feedback management
    Args:
        user_id: User UUID string
        db: Database session
    Returns:
        True if user is admin, False otherwise
    """
    try:
        user = db.query(UserInformationModel).filter(
            UserInformationModel.id == uuid.UUID(user_id)
        ).first()
        return user.is_admin if user else False
    except Exception:
        return False

def deactivate_user_account(db: Session, user_id: str) -> tuple[bool, str]:
    """
    Deactivate user account by setting is_active to false
    Args:
        db: Database session
        user_id: User UUID to deactivate
    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        # Get user by ID
        user = get_user_by_id(db, user_id)
        if not user:
            return False, "User not found"
        
        # Check if account is already inactive
        if not user.is_active:
            return True, "Account is already inactive"
        
        # Deactivate account
        user.is_active = False
        user.updated_at = datetime.utcnow()
        
        return True, "Account deactivated successfully"
        
    except Exception as e:
        return False, f"Failed to deactivate account: {str(e)}" 