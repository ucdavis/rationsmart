#!/usr/bin/env python3
"""
Error Handlers for Feed Formulation Backend
Provides user-friendly error messages for various APIs
"""

import re
from typing import Dict, Any
from fastapi import HTTPException

def categorize_diet_recommendation_error(error_message: str, simulation_id: str = "unknown") -> Dict[str, Any]:
    """
    Categorize diet recommendation errors and provide user-friendly messages
    
    Args:
        error_message (str): The original error message
        simulation_id (str): Simulation identifier for logging
        
    Returns:
        Dict containing categorized error information
    """
    
    # Convert to lowercase for easier pattern matching
    error_lower = error_message.lower()
    
    # Pattern matching for different error types
    if "too many values to unpack" in error_lower:
        return {
            "error_type": "DATA_FORMAT_ERROR",
            "user_message": "Unable to process feed data format. Please ensure all feeds have complete nutritional information.",
            "technical_message": f"Data unpacking error: {error_message}",
            "suggested_action": "Try selecting different feeds or contact support if the issue persists.",
            "severity": "MEDIUM",
            "category": "DATA_PROCESSING",
            "http_status": 422
        }
    
    elif "optimization failed" in error_lower:
        return {
            "error_type": "OPTIMIZATION_ERROR",
            "user_message": "Unable to find an optimal diet combination with the selected feeds.",
            "technical_message": f"Optimization algorithm failed: {error_message}",
            "suggested_action": "Try adding more diverse feeds or adjusting animal requirements.",
            "severity": "HIGH",
            "category": "ALGORITHM",
            "http_status": 422
        }
    
    elif "feed selection" in error_lower and "empty" in error_lower:
        return {
            "error_type": "VALIDATION_ERROR",
            "user_message": "Please select at least one feed for diet calculation.",
            "technical_message": f"Feed validation error: {error_message}",
            "suggested_action": "Select one or more feeds from the available options.",
            "severity": "LOW",
            "category": "INPUT_VALIDATION",
            "http_status": 422
        }
    
    elif "database" in error_lower or "connection" in error_lower:
        return {
            "error_type": "DATABASE_ERROR",
            "user_message": "Unable to access feed database. Please try again in a few moments.",
            "technical_message": f"Database error: {error_message}",
            "suggested_action": "Refresh the page and try again. If the problem continues, contact support.",
            "severity": "HIGH",
            "category": "SYSTEM",
            "http_status": 503
        }
    
    elif "memory" in error_lower or "out of memory" in error_lower:
        return {
            "error_type": "SYSTEM_ERROR",
            "user_message": "System is temporarily overloaded. Please try with fewer feeds or try again later.",
            "technical_message": f"Memory/system error: {error_message}",
            "suggested_action": "Reduce the number of selected feeds or try again in a few minutes.",
            "severity": "MEDIUM",
            "category": "SYSTEM",
            "http_status": 503
        }
    
    elif "calculation" in error_lower or "mathematical" in error_lower:
        return {
            "error_type": "CALCULATION_ERROR",
            "user_message": "Unable to calculate nutritional requirements. Please check animal information.",
            "technical_message": f"Calculation error: {error_message}",
            "suggested_action": "Verify animal weight, milk production, and other parameters are realistic.",
            "severity": "MEDIUM",
            "category": "CALCULATION",
            "http_status": 422
        }
    
    elif "feed not found" in error_lower or "invalid feed" in error_lower:
        return {
            "error_type": "FEED_ERROR",
            "user_message": "One or more selected feeds are no longer available.",
            "technical_message": f"Feed availability error: {error_message}",
            "suggested_action": "Refresh the feed list and select available feeds.",
            "severity": "LOW",
            "category": "DATA",
            "http_status": 404
        }
    
    elif "timeout" in error_lower or "timed out" in error_lower:
        return {
            "error_type": "TIMEOUT_ERROR",
            "user_message": "Calculation is taking longer than expected. Please try again.",
            "technical_message": f"Timeout error: {error_message}",
            "suggested_action": "Try with fewer feeds or simpler requirements.",
            "severity": "MEDIUM",
            "category": "PERFORMANCE",
            "http_status": 408
        }
    
    else:
        # Generic error for unknown issues
        return {
            "error_type": "UNKNOWN_ERROR",
            "user_message": "An unexpected error occurred during diet calculation.",
            "technical_message": f"Unknown error: {error_message}",
            "suggested_action": "Please try again. If the problem persists, contact support with simulation ID: " + simulation_id,
            "severity": "HIGH",
            "category": "UNKNOWN",
            "http_status": 500
        }

def create_user_friendly_error_response(error_info: Dict[str, Any], simulation_id: str = "unknown") -> Dict[str, Any]:
    """
    Create a user-friendly error response for the API
    
    Args:
        error_info (Dict): Categorized error information
        simulation_id (str): Simulation identifier
        
    Returns:
        Dict containing the error response
    """
    
    return {
        "status": "ERROR",
        "simulation_id": simulation_id,
        "error": {
            "type": error_info["error_type"],
            "message": error_info["user_message"],
            "suggested_action": error_info["suggested_action"],
            "severity": error_info["severity"],
            "category": error_info["category"],
            "support_reference": f"REF-{simulation_id}-{error_info['error_type']}"
        },
        "diet_summary": {
            "total_cost": 0.0,
            "total_dmi": 0.0,
            "optimization_status": "failed"
        },
        "warnings": [error_info["user_message"]],
        "recommendations": [error_info["suggested_action"]]
    }

def log_error_details(error_info: Dict[str, Any], simulation_id: str, original_error: str, logger=None):
    """
    Log detailed error information for debugging
    
    Args:
        error_info (Dict): Categorized error information
        simulation_id (str): Simulation identifier
        original_error (str): Original error message
        logger: Logger instance (optional)
    """
    
    log_message = f"""
🔍 ERROR ANALYSIS for SIM_{simulation_id}:
   Error Type: {error_info['error_type']}
   Category: {error_info['category']}
   Severity: {error_info['severity']}
   Technical Message: {error_info['technical_message']}
   User Message: {error_info['user_message']}
   Suggested Action: {error_info['suggested_action']}
   Original Error: {original_error}
   Support Reference: REF-{simulation_id}-{error_info['error_type']}
"""
    
    if logger:
        logger.error(log_message)
    else:
        print(log_message)

def raise_user_friendly_http_exception(error_message: str, simulation_id: str = "unknown", logger=None):
    """
    Raise a user-friendly HTTP exception with proper error categorization
    
    Args:
        error_message (str): The original error message
        case_id (str): Case identifier
        logger: Logger instance (optional)
        
    Raises:
        HTTPException: User-friendly error response
    """
    
    # Categorize the error
    error_info = categorize_diet_recommendation_error(error_message, simulation_id)
    
    # Log detailed error information
    log_error_details(error_info, simulation_id, error_message, logger)
    
    # Create user-friendly error response
    error_response = create_user_friendly_error_response(error_info, simulation_id)
    
    # Raise HTTP exception with appropriate status code
    raise HTTPException(
        status_code=error_info["http_status"],
        detail=error_response
    )
