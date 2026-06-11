"""
Utility functions for the Feed Formulation Backend
"""

import pandas as pd
import numpy as np
from decimal import Decimal, ROUND_HALF_UP
from typing import Union, Optional


def round_numeric_value(value: Union[str, float, int, None], decimal_places: int = 2) -> Optional[float]:
    """
    Round numeric values to specified decimal places with proper handling of edge cases.
    
    Args:
        value: The value to round (can be string, float, int, or None)
        decimal_places: Number of decimal places to round to (default: 2)
    
    Returns:
        Rounded float value or None if input is invalid
    
    Examples:
        >>> round_numeric_value("1.5660184237461616")
        1.57
        >>> round_numeric_value("inf")
        None
        >>> round_numeric_value("")
        None
        >>> round_numeric_value(1.234)
        1.23
    """
    if value is None:
        return None
    
    # Convert to string for consistent handling
    if isinstance(value, (int, float)):
        value = str(value)
    
    # Handle empty strings and invalid values
    if not value or value.strip() == '':
        return None
    
    # Handle special cases
    value_lower = value.lower().strip()
    if value_lower in ['nan', 'inf', '-inf', 'null', 'none']:
        return None
    
    try:
        # Convert to Decimal for precise rounding
        decimal_value = Decimal(str(value))
        
        # Round to specified decimal places
        rounded_decimal = decimal_value.quantize(
            Decimal('0.' + '0' * decimal_places), 
            rounding=ROUND_HALF_UP
        )
        
        # Convert back to float
        return float(rounded_decimal)
        
    except (ValueError, TypeError, OverflowError):
        # If conversion fails, return None
        return None


def clean_data_for_json(data_dict: dict) -> dict:
    """
    Clean data to ensure JSON serialization compatibility.
    This function handles infinite values, NaN, and other non-serializable data.
    
    Args:
        data_dict: Dictionary containing data to clean
    
    Returns:
        Cleaned dictionary with JSON-serializable values
    """
    cleaned = {}
    for key, value in data_dict.items():
        if pd.isna(value) or value is None:
            cleaned[key] = None
        elif isinstance(value, (int, float)):
            # Handle infinite and NaN values
            if pd.isna(value) or value == float('inf') or value == float('-inf'):
                cleaned[key] = None
            else:
                cleaned[key] = value
        else:
            cleaned[key] = str(value)
    return cleaned


def round_feed_data(data_dict: dict, decimal_places: int = 2) -> dict:
    """
    Round all numeric values in feed data to specified decimal places.
    
    Args:
        data_dict: Dictionary containing feed data
        decimal_places: Number of decimal places to round to (default: 2)
    
    Returns:
        Dictionary with rounded numeric values
    """
    # List of numeric fields that should be rounded
    numeric_fields = [
        'fd_dm', 'fd_ash', 'fd_cp', 'fd_ee', 'fd_cf', 'fd_nfe', 'fd_st', 
        'fd_ndf', 'fd_hemicellulose', 'fd_adf', 'fd_cellulose', 'fd_lg', 
        'fd_ndin', 'fd_adin', 'fd_ca', 'fd_p'
    ]
    
    rounded_data = data_dict.copy()
    
    for field in numeric_fields:
        if field in rounded_data:
            rounded_data[field] = round_numeric_value(rounded_data[field], decimal_places)
    
    return rounded_data

def format_value_with_unit(value, unit):
    """Format value with unit, handling smart decimal precision and null values"""
    if value is None or value == "":
        return None
    if value == 0:
        return 0
    
    # Check if value is a whole number
    if isinstance(value, (int, float)) and value == int(value):
        return f"{int(value)} {unit}"
    else:
        return f"{value:.2f} {unit}"

def safe_float(value):
    """Safely convert value to float, returning 0.0 for invalid values"""
    if value is None or value == '':
        return 0.0
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0

def ensure_json_safe(value):
    """Ensure value is JSON-serializable (no NaN, inf, etc.), handles nested structures recursively"""
    if isinstance(value, dict):
        return {k: ensure_json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [ensure_json_safe(v) for v in value]
    
    if isinstance(value, (int, str, bool)) or value is None:
        return value
    if isinstance(value, float):
        if np.isnan(value) or np.isinf(value):
            return 0.0
        return value
    if hasattr(value, 'item'):  # numpy scalar
        val = value.item()
        if np.isnan(val) or np.isinf(val):
            return 0.0
        return val
    return value
