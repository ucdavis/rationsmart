import time
import json
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from middleware.logging_config import get_logger, log_api_request, log_api_response

logger = get_logger("api.middleware")

class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all API requests and responses"""
    
    async def dispatch(self, request: Request, call_next):
        # Start timing
        start_time = time.time()
        
        # Get request details
        method = request.method
        url = str(request.url)
        path = request.url.path
        query_params = dict(request.query_params)
        
        # Get client IP
        client_ip = request.client.host if request.client else "unknown"
        
        # Get user agent
        user_agent = request.headers.get("user-agent", "unknown")
        
        # Log request
        log_api_request(
            logger, 
            method, 
            path, 
            user_id=None,  # Will be extracted from auth if available
            client_ip=client_ip,
            user_agent=user_agent,
            query_params=query_params
        )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Calculate response time
            process_time = (time.time() - start_time) * 1000  # Convert to milliseconds
            
            # Log response
            log_api_response(
                logger,
                method,
                path,
                response.status_code,
                response_time=process_time,
                client_ip=client_ip
            )
            
            return response
            
        except Exception as e:
            # Calculate response time
            process_time = (time.time() - start_time) * 1000
            
            # Log error
            logger.error(
                f"API Error: {method} {path} | Time: {process_time:.2f}ms | Error: {str(e)}",
                exc_info=True
            )
            
            # Re-raise the exception
            raise

def extract_user_id_from_request(request: Request) -> str:
    """Extract user ID from request headers or query params"""
    # Check for authorization header
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        # Extract token and decode if needed
        token = auth_header.split(" ")[1]
        # You can decode JWT token here if you're using JWT
        return f"token:{token[:10]}..."  # Truncate for security
    
    # Check for user ID in query params
    user_id = request.query_params.get("user_id")
    if user_id:
        return user_id
    
    return "anonymous" 