import logging
import logging.handlers
import os
from datetime import datetime
from pathlib import Path

# Create logs directory if it doesn't exist
LOGS_DIR = Path("logs")
LOGS_DIR.mkdir(exist_ok=True)

# Logging configuration
def setup_logging():
    """Setup comprehensive logging configuration for the feed formulation system"""
    
    # Create formatters
    detailed_formatter = logging.Formatter(
        '%(asctime)s | %(name)s | %(levelname)s | %(filename)s:%(lineno)d | %(funcName)s | %(message)s'
    )
    
    simple_formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(message)s'
    )
    
    # Create handlers
    handlers = {}
    
    # 1. General application log
    app_handler = logging.handlers.RotatingFileHandler(
        LOGS_DIR / "app.log",
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    app_handler.setLevel(logging.INFO)
    app_handler.setFormatter(detailed_formatter)
    handlers['app'] = app_handler
    
    # 2. API request/response log
    api_handler = logging.handlers.RotatingFileHandler(
        LOGS_DIR / "api.log",
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    api_handler.setLevel(logging.INFO)
    api_handler.setFormatter(detailed_formatter)
    handlers['api'] = api_handler
    
    # 3. Authentication log
    auth_handler = logging.handlers.RotatingFileHandler(
        LOGS_DIR / "auth.log",
        maxBytes=5*1024*1024,  # 5MB
        backupCount=3
    )
    auth_handler.setLevel(logging.INFO)
    auth_handler.setFormatter(detailed_formatter)
    handlers['auth'] = auth_handler
    
    # 4. Calculation log (for feed optimization)
    calc_handler = logging.handlers.RotatingFileHandler(
        LOGS_DIR / "calculation.log",
        maxBytes=20*1024*1024,  # 20MB (can be large due to optimization details)
        backupCount=3
    )
    calc_handler.setLevel(logging.DEBUG)
    calc_handler.setFormatter(detailed_formatter)
    handlers['calculation'] = calc_handler
    
    # 5. Database operations log
    db_handler = logging.handlers.RotatingFileHandler(
        LOGS_DIR / "database.log",
        maxBytes=5*1024*1024,  # 5MB
        backupCount=3
    )
    db_handler.setLevel(logging.INFO)
    db_handler.setFormatter(detailed_formatter)
    handlers['database'] = db_handler
    
    # 6. Error log (all errors from all modules)
    error_handler = logging.handlers.RotatingFileHandler(
        LOGS_DIR / "error.log",
        maxBytes=5*1024*1024,  # 5MB
        backupCount=5
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(detailed_formatter)
    handlers['error'] = error_handler
    
    # 7. Console handler for development
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(simple_formatter)
    handlers['console'] = console_handler
    
    return handlers

def get_logger(name, handlers=None):
    """Get a logger with the specified handlers"""
    if handlers is None:
        handlers = setup_logging()
    
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    
    # Clear existing handlers to avoid duplicates
    logger.handlers.clear()
    
    # Add handlers based on logger name
    if 'auth' in name.lower():
        logger.addHandler(handlers['auth'])
        logger.addHandler(handlers['error'])
    elif 'api' in name.lower() or 'router' in name.lower():
        logger.addHandler(handlers['api'])
        logger.addHandler(handlers['error'])
    elif 'calculation' in name.lower() or 'optimization' in name.lower():
        logger.addHandler(handlers['calculation'])
        logger.addHandler(handlers['error'])
    elif 'database' in name.lower() or 'model' in name.lower():
        logger.addHandler(handlers['database'])
        logger.addHandler(handlers['error'])
    else:
        # Default: add all handlers
        logger.addHandler(handlers['app'])
        logger.addHandler(handlers['error'])
    
    # Always add console handler for development
    logger.addHandler(handlers['console'])
    
    return logger

# Convenience functions for common logging patterns
def log_api_request(logger, method, endpoint, user_id=None, **kwargs):
    """Log API request details"""
    extra_info = f" | User: {user_id}" if user_id else ""
    logger.info(f"API Request: {method} {endpoint}{extra_info} | {kwargs}")

def log_api_response(logger, method, endpoint, status_code, response_time=None, **kwargs):
    """Log API response details"""
    timing = f" | Time: {response_time}ms" if response_time else ""
    logger.info(f"API Response: {method} {endpoint} | Status: {status_code}{timing} | {kwargs}")

def log_calculation_start(logger, animal_data, feed_count):
    """Log the start of a feed calculation"""
    logger.info(f"Starting feed calculation | Animal: {animal_data.get('body_weight', 'N/A')}kg | Feeds: {feed_count}")

def log_calculation_step(logger, step_name, details=None):
    """Log a calculation step"""
    details_str = f" | {details}" if details else ""
    logger.debug(f"Calculation Step: {step_name}{details_str}")

def log_calculation_complete(logger, optimization_time, iterations, final_cost):
    """Log completion of feed calculation"""
    logger.info(f"Calculation Complete | Time: {optimization_time:.2f}s | Iterations: {iterations} | Final Cost: {final_cost:.2f}")

def log_database_operation(logger, operation, table, record_count=None, **kwargs):
    """Log database operations"""
    count_str = f" | Records: {record_count}" if record_count else ""
    logger.info(f"Database {operation} | Table: {table}{count_str} | {kwargs}")

def log_error(logger, error, context=None):
    """Log errors with context"""
    context_str = f" | Context: {context}" if context else ""
    logger.error(f"Error: {str(error)}{context_str}", exc_info=True)

# Initialize logging when module is imported
HANDLERS = setup_logging() 