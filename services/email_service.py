"""
Email service for RationSmart v4.0.
Reads SMTP config from settings (not os.getenv) so it respects the .env file.
"""
import html
import logging
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Tuple

from app.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.smtp_server = settings.smtp_server
        self.smtp_port = settings.smtp_port
        self.smtp_username = settings.smtp_username
        self.smtp_password = settings.smtp_password
        self.from_email = settings.from_email
        self.from_name = settings.from_name
        self.is_configured = bool(self.smtp_username and self.smtp_password)
        if not self.is_configured:
            logger.warning("SMTP credentials not set — email sending will be simulated.")

    # ── HTML templates ────────────────────────────────────────────────────────

    def _pin_reset_html(self, user_name: str, new_pin: str) -> str:
        ts = datetime.now(timezone.utc).strftime("%B %d, %Y at %I:%M %p UTC")
        return f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#fff;border-radius:8px;padding:30px;box-shadow:0 2px 6px rgba(0,0,0,.1)">
  <h2 style="color:#2c5aa0">Hello {user_name},</h2>
  <p>Your RationSmart PIN has been reset. Use the PIN below to log in.</p>
  <div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:25px;border-radius:8px;text-align:center;margin:20px 0">
    <p style="font-size:16px;margin:0 0 10px">Your New PIN</p>
    <p style="font-size:40px;font-weight:bold;letter-spacing:10px;margin:0">{new_pin}</p>
  </div>
  <p style="color:#856404;background:#fff3cd;padding:12px;border-radius:6px">
    <strong>Security notice:</strong> If you did not request this reset, contact support immediately.
  </p>
  <p style="color:#666;font-size:13px">Requested on {ts}.</p>
</div>
</body></html>"""

    def _pin_reset_text(self, user_name: str, new_pin: str) -> str:
        ts = datetime.now(timezone.utc).strftime("%B %d, %Y at %I:%M %p UTC")
        return (
            f"Hello {user_name},\n\n"
            f"Your RationSmart PIN has been reset.\n\n"
            f"New PIN: {new_pin}\n\n"
            f"If you did not request this, contact support immediately.\n\n"
            f"Requested on {ts}.\n\n-- RationSmart"
        )

    def _verification_html(self, user_name: str, token: str) -> str:
        verify_url = f"{settings.api_base_url}/v1/auth/verify-email-link?token={token}"
        return f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#fff;border-radius:8px;padding:30px;box-shadow:0 2px 6px rgba(0,0,0,.1)">
  <h2 style="color:#2c5aa0">Hello {user_name}, welcome to RationSmart!</h2>
  <p>Please click the button below to verify your email address and activate your account.</p>
  <div style="text-align:center;margin:30px 0">
    <a href="{verify_url}" style="background:#2c5aa0;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block">
      Verify Email
    </a>
  </div>
  <p style="color:#888;font-size:13px">This link expires in 24 hours. If you did not create a RationSmart account, you can ignore this email.</p>
</div>
</body></html>"""

    def _admin_granted_html(self, user_name: str, granted_by: str) -> str:
        ts = datetime.now(timezone.utc).strftime("%B %d, %Y at %I:%M %p UTC")
        user_name = html.escape(user_name)
        granted_by = html.escape(granted_by)
        return f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#fff;border-radius:8px;padding:30px;box-shadow:0 2px 6px rgba(0,0,0,.1)">
  <h2 style="color:#2c5aa0">Hello {user_name},</h2>
  <p>You have been granted <strong>Admin</strong> privileges on RationSmart by {granted_by}.</p>
  <p>You can now access the admin dashboard for user, feed, and content management.</p>
  <p style="color:#856404;background:#fff3cd;padding:12px;border-radius:6px">
    <strong>Security notice:</strong> If you did not expect this change, contact another admin or support immediately.
  </p>
  <p style="color:#666;font-size:13px">Granted on {ts}.</p>
</div>
</body></html>"""

    def _admin_granted_text(self, user_name: str, granted_by: str) -> str:
        ts = datetime.now(timezone.utc).strftime("%B %d, %Y at %I:%M %p UTC")
        return (
            f"Hello {user_name},\n\n"
            f"You have been granted Admin privileges on RationSmart by {granted_by}.\n\n"
            f"If you did not expect this change, contact another admin or support immediately.\n\n"
            f"Granted on {ts}.\n\n-- RationSmart"
        )

    def _admin_notification_html(self, admin_name: str, promoted_name: str, promoted_email: str, granted_by: str) -> str:
        ts = datetime.now(timezone.utc).strftime("%B %d, %Y at %I:%M %p UTC")
        admin_name = html.escape(admin_name)
        promoted_name = html.escape(promoted_name)
        promoted_email = html.escape(promoted_email)
        granted_by = html.escape(granted_by)
        return f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#fff;border-radius:8px;padding:30px;box-shadow:0 2px 6px rgba(0,0,0,.1)">
  <h2 style="color:#2c5aa0">Hello {admin_name},</h2>
  <p><strong>{promoted_name}</strong> ({promoted_email}) was just granted <strong>Admin</strong> privileges on RationSmart by {granted_by}.</p>
  <p style="color:#856404;background:#fff3cd;padding:12px;border-radius:6px">
    <strong>Security notice:</strong> If you did not expect this change, please review it and contact support if it looks unauthorized.
  </p>
  <p style="color:#666;font-size:13px">Granted on {ts}.</p>
</div>
</body></html>"""

    def _admin_notification_text(self, admin_name: str, promoted_name: str, promoted_email: str, granted_by: str) -> str:
        ts = datetime.now(timezone.utc).strftime("%B %d, %Y at %I:%M %p UTC")
        return (
            f"Hello {admin_name},\n\n"
            f"{promoted_name} ({promoted_email}) was just granted Admin privileges on RationSmart by {granted_by}.\n\n"
            f"If you did not expect this change, please review it and contact support if it looks unauthorized.\n\n"
            f"Granted on {ts}.\n\n-- RationSmart"
        )

    # ── Send helper ───────────────────────────────────────────────────────────

    def _send(self, to_email: str, subject: str, text: str, html: str) -> Tuple[bool, Optional[str]]:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{self.from_name} <{self.from_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        if not self.is_configured:
            logger.info("[SIMULATED] Email to %s | Subject: %s", to_email, subject)
            return True, None

        try:
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)
            logger.info("Email sent to %s", to_email)
            return True, None
        except Exception as exc:
            logger.error("Failed to send email to %s: %s", to_email, exc)
            return False, str(exc)

    # ── Public API ────────────────────────────────────────────────────────────

    async def send_pin_reset_email(
        self, to_email: str, user_name: str, new_pin: str
    ) -> Tuple[bool, Optional[str]]:
        return self._send(
            to_email,
            subject="Your new RationSmart PIN",
            text=self._pin_reset_text(user_name, new_pin),
            html=self._pin_reset_html(user_name, new_pin),
        )

    async def send_verification_email(
        self, to_email: str, user_name: str, token: str
    ) -> Tuple[bool, Optional[str]]:
        verify_url = f"{settings.api_base_url}/v1/auth/verify-email-link?token={token}"
        text = (
            f"Hello {user_name},\n\n"
            f"Please open the link below to verify your email and activate your RationSmart account:\n\n"
            f"{verify_url}\n\n"
            f"This link expires in 24 hours.\n\n-- RationSmart"
        )
        return self._send(
            to_email,
            subject="Verify your RationSmart email",
            text=text,
            html=self._verification_html(user_name, token),
        )

    async def send_welcome_email(
        self, to_email: str, user_name: str
    ) -> Tuple[bool, Optional[str]]:
        text = f"Hello {user_name},\n\nWelcome to RationSmart! Your account is ready.\n\n-- RationSmart"
        html = f"<p>Hello <strong>{user_name}</strong>,</p><p>Welcome to RationSmart! Your account is ready.</p>"
        return self._send(to_email, subject="Welcome to RationSmart", text=text, html=html)

    async def send_admin_granted_email(
        self, to_email: str, user_name: str, granted_by: str
    ) -> Tuple[bool, Optional[str]]:
        return self._send(
            to_email,
            subject="You've been made a RationSmart Admin",
            text=self._admin_granted_text(user_name, granted_by),
            html=self._admin_granted_html(user_name, granted_by),
        )

    async def send_admin_notification_email(
        self, to_email: str, admin_name: str, promoted_name: str, promoted_email: str, granted_by: str
    ) -> Tuple[bool, Optional[str]]:
        return self._send(
            to_email,
            subject="New RationSmart Admin granted",
            text=self._admin_notification_text(admin_name, promoted_name, promoted_email, granted_by),
            html=self._admin_notification_html(admin_name, promoted_name, promoted_email, granted_by),
        )

    def get_email_config(self) -> dict:
        base = {
            "smtp_server": self.smtp_server,
            "smtp_port": self.smtp_port,
            "from_email": self.from_email,
        }
        if not self.is_configured:
            return {**base, "status": "not_configured", "message": "SMTP credentials not set"}
        try:
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
            return {**base, "status": "configured", "message": "SMTP connection OK"}
        except Exception as exc:
            return {**base, "status": "error", "message": str(exc)}


email_service = EmailService()
