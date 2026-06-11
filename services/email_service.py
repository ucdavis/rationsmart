"""
Email Service for PIN Reset Functionality
Handles sending PIN reset emails with professional templates
"""

import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        """Initialize email service with SMTP configuration"""
        # Email configuration from environment variables
        self.smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_username = os.getenv('SMTP_USERNAME', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.from_email = os.getenv('FROM_EMAIL', self.smtp_username)
        self.from_name = os.getenv('FROM_NAME', 'Feed Formulation System')
        
        # Validate configuration
        if not self.smtp_username or not self.smtp_password:
            logger.warning("SMTP credentials not configured. Email sending will be simulated.")
            self.is_configured = False
        else:
            self.is_configured = True

    def create_pin_reset_email_html(self, user_name: str, new_pin: str) -> str:
        """Create professional HTML email template for PIN reset"""
        html_template = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PIN Reset - Feed Formulation System</title>
            <style>
                body {{
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f4f4f4;
                }}
                .email-container {{
                    background-color: white;
                    border-radius: 10px;
                    padding: 30px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }}
                .header {{
                    text-align: center;
                    border-bottom: 3px solid #2c5aa0;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }}
                .logo {{
                    font-size: 28px;
                    font-weight: bold;
                    color: #2c5aa0;
                    margin-bottom: 10px;
                }}
                .subtitle {{
                    color: #666;
                    font-size: 16px;
                }}
                .pin-section {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 25px;
                    border-radius: 10px;
                    text-align: center;
                    margin: 25px 0;
                }}
                .pin-label {{
                    font-size: 18px;
                    margin-bottom: 15px;
                    opacity: 0.9;
                }}
                .pin-code {{
                    font-size: 36px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    background-color: rgba(255, 255, 255, 0.2);
                    padding: 15px 25px;
                    border-radius: 8px;
                    display: inline-block;
                    margin: 10px 0;
                }}
                .info-section {{
                    background-color: #f8f9fa;
                    padding: 20px;
                    border-radius: 8px;
                    margin: 20px 0;
                    border-left: 4px solid #28a745;
                }}
                .warning-section {{
                    background-color: #fff3cd;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                    border-left: 4px solid #ffc107;
                    color: #856404;
                }}
                .footer {{
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                    color: #666;
                    font-size: 14px;
                }}
                .contact-info {{
                    margin-top: 15px;
                    font-size: 13px;
                }}
                ul {{
                    text-align: left;
                    padding-left: 20px;
                }}
                li {{
                    margin-bottom: 8px;
                }}
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <div class="logo">🐄 Feed Formulation System</div>
                    <div class="subtitle">Dairy Cattle Nutrition Optimization</div>
                </div>
                
                <h2 style="color: #2c5aa0;">Hello {user_name},</h2>
                
                <p>We received a request to reset your PIN for your Feed Formulation System account. Your new PIN has been generated and is ready to use.</p>
                
                <div class="pin-section">
                    <div class="pin-label">Your New PIN</div>
                    <div class="pin-code">{new_pin}</div>
                    <div style="font-size: 14px; margin-top: 15px; opacity: 0.9;">
                        Use this PIN to log into your account
                    </div>
                </div>
                
                <div class="info-section">
                    <h4 style="margin-top: 0; color: #28a745;">📋 What to do next:</h4>
                    <ul>
                        <li><strong>Log in immediately</strong> using your email and this new PIN</li>
                        <li><strong>Change your PIN</strong> to something memorable (optional but recommended)</li>
                        <li><strong>Keep your PIN secure</strong> and don't share it with anyone</li>
                        <li><strong>Contact support</strong> if you didn't request this reset</li>
                    </ul>
                </div>
                
                <div class="warning-section">
                    <strong>⚠️ Security Notice:</strong> If you didn't request this PIN reset, please contact our support team immediately. Your account security is important to us.
                </div>
                
                <p>This PIN reset was requested on <strong>{datetime.now().strftime('%B %d, %Y at %I:%M %p UTC')}</strong>.</p>
                
                <div class="footer">
                    <p><strong>Feed Formulation System</strong><br>
                    Optimizing Dairy Cattle Nutrition Worldwide</p>
                    
                    <div class="contact-info">
                        <p>Need help? Contact our support team<br>
                        This is an automated message, please do not reply to this email.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        return html_template

    def create_pin_reset_email_text(self, user_name: str, new_pin: str) -> str:
        """Create plain text version of PIN reset email"""
        text_template = f"""
Feed Formulation System - PIN Reset

Hello {user_name},

We received a request to reset your PIN for your Feed Formulation System account.

Your New PIN: {new_pin}

What to do next:
- Log in immediately using your email and this new PIN
- Change your PIN to something memorable (optional but recommended)  
- Keep your PIN secure and don't share it with anyone
- Contact support if you didn't request this reset

SECURITY NOTICE: If you didn't request this PIN reset, please contact our support team immediately.

This PIN reset was requested on {datetime.now().strftime('%B %d, %Y at %I:%M %p UTC')}.

---
Feed Formulation System
Optimizing Dairy Cattle Nutrition Worldwide

Need help? Contact our support team
This is an automated message, please do not reply to this email.
        """
        return text_template.strip()

    async def send_pin_reset_email(self, to_email: str, user_name: str, new_pin: str) -> tuple[bool, Optional[str]]:
        """
        Send PIN reset email to user
        
        Args:
            to_email: Recipient email address
            user_name: User's name for personalization
            new_pin: New 4-digit PIN
            
        Returns:
            tuple: (success (bool), error_message (str or None))
        """
        try:
            # Create email message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"🔐 Your New PIN - Feed Formulation System"
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email

            # Create both plain text and HTML versions
            text_content = self.create_pin_reset_email_text(user_name, new_pin)
            html_content = self.create_pin_reset_email_html(user_name, new_pin)

            # Attach parts
            part1 = MIMEText(text_content, 'plain')
            part2 = MIMEText(html_content, 'html')
            
            msg.attach(part1)
            msg.attach(part2)

            # Send email if SMTP is configured
            if self.is_configured:
                with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                    server.starttls()
                    server.login(self.smtp_username, self.smtp_password)
                    server.send_message(msg)
                    
                logger.info(f"PIN reset email sent successfully to {to_email}")
                return True, None
            else:
                # Simulate email sending for development/testing
                logger.info(f"[SIMULATED] PIN reset email would be sent to {to_email}")
                logger.info(f"[SIMULATED] Subject: {msg['Subject']}")
                logger.info(f"[SIMULATED] New PIN: {new_pin}")
                return True, None
                
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Failed to send PIN reset email to {to_email}: {error_msg}")
            return False, error_msg

    def test_email_configuration(self) -> dict:
        """Test email configuration and return status"""
        try:
            if not self.is_configured:
                return {
                    "status": "not_configured",
                    "message": "SMTP credentials not configured",
                    "smtp_server": self.smtp_server,
                    "smtp_port": self.smtp_port,
                    "from_email": self.from_email
                }
            
            # Test SMTP connection
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                
            return {
                "status": "configured",
                "message": "Email service is properly configured and ready",
                "smtp_server": self.smtp_server,
                "smtp_port": self.smtp_port,
                "from_email": self.from_email
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"Email configuration test failed: {str(e)}",
                "smtp_server": self.smtp_server,
                "smtp_port": self.smtp_port,
                "from_email": self.from_email
            }

# Global email service instance
email_service = EmailService() 