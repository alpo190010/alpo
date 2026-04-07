"""
HTML email templates for auth flows: email verification and password reset.

Both templates use inline CSS and a centered card layout consistent with
the existing email templates in ``email_templates.py``.
"""

import html

from app.services.email_palette import email_palette

p = email_palette  # short alias used only inside this module


def _wrap_body(inner_html: str) -> str:
    """Wrap *inner_html* in the standard email shell (doctype, body bg, centered table)."""
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{p["background"]};font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:48px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="text-align:center;padding-bottom:32px;">
    <span style="font-size:20px;font-weight:700;color:{p["textHeading"]};">alpo.ai</span>
  </td></tr>
  <tr><td style="background:{p["cardBg"]};border:1.5px solid {p["cardBorder"]};border-radius:12px;padding:40px 36px;">
    {inner_html}
  </td></tr>
  <tr><td style="text-align:center;padding-top:24px;">
    <p style="margin:0;font-size:12px;color:{p["textTertiary"]};">alpo.ai · alpo.ai</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def build_verification_email(verify_url: str, user_name: str | None) -> str:
    """Build an HTML email asking the user to verify their email address.

    Parameters
    ----------
    verify_url:
        Full URL the user should click (includes the token as a query param).
    user_name:
        The user's display name, or ``None`` for a generic greeting.

    Returns
    -------
    str
        Complete HTML document suitable for sending via an email provider.
    """
    greeting = html.escape(user_name) if user_name else "there"

    inner = f"""
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:{p["textHeading"]};">Verify your email</h1>
    <p style="margin:0 0 24px;font-size:15px;color:{p["textBody"]};line-height:1.6;">
      Hi {greeting}, thanks for signing up! Please verify your email address to activate your account.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="{verify_url}"
         style="display:inline-block;padding:14px 32px;background:{p["brand"]};color:{p["cardBg"]};font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
        Verify your email
      </a>
    </div>
    <p style="margin:0 0 16px;font-size:13px;color:{p["textMuted"]};line-height:1.5;">
      This link expires in <strong>24 hours</strong>. If you didn&rsquo;t create an account, you can safely ignore this email.
    </p>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid {p["divider"]};">
      <p style="margin:0;font-size:12px;color:{p["textMuted"]};line-height:1.5;word-break:break-all;">
        If the button doesn&rsquo;t work, copy and paste this link into your browser:<br/>
        <a href="{verify_url}" style="color:{p["brand"]};text-decoration:underline;">{verify_url}</a>
      </p>
    </div>"""

    return _wrap_body(inner)


def build_reset_password_email(reset_url: str, user_name: str | None) -> str:
    """Build an HTML email with a password-reset link.

    Parameters
    ----------
    reset_url:
        Full URL for the password reset page (includes token).
    user_name:
        The user's display name, or ``None`` for a generic greeting.

    Returns
    -------
    str
        Complete HTML document suitable for sending via an email provider.
    """
    greeting = html.escape(user_name) if user_name else "there"

    inner = f"""
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:{p["textHeading"]};">Reset your password</h1>
    <p style="margin:0 0 24px;font-size:15px;color:{p["textBody"]};line-height:1.6;">
      Hi {greeting}, we received a request to reset your password. Click the button below to choose a new one.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="{reset_url}"
         style="display:inline-block;padding:14px 32px;background:{p["brand"]};color:{p["cardBg"]};font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
        Reset your password
      </a>
    </div>
    <p style="margin:0 0 16px;font-size:13px;color:{p["textMuted"]};line-height:1.5;">
      This link expires in <strong>1 hour</strong>. If you didn&rsquo;t request a password reset, you can safely ignore this email &mdash; your password will remain unchanged.
    </p>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid {p["divider"]};">
      <p style="margin:0;font-size:12px;color:{p["textMuted"]};line-height:1.5;word-break:break-all;">
        If the button doesn&rsquo;t work, copy and paste this link into your browser:<br/>
        <a href="{reset_url}" style="color:{p["brand"]};text-decoration:underline;">{reset_url}</a>
      </p>
    </div>"""

    return _wrap_body(inner)
