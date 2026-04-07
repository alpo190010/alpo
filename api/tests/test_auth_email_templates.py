"""Tests for HTML-escaping in auth email templates."""

from app.services.auth_email_templates import (
    build_reset_password_email,
    build_verification_email,
)

XSS_PAYLOAD = '<script>alert(1)</script>'
ESCAPED_FRAGMENT = "&lt;script&gt;"
RAW_FRAGMENT = "<script>alert"

DUMMY_URL = "https://alpo.ai/verify?token=abc123"
RESET_URL = "https://alpo.ai/reset?token=abc123"


class TestBuildVerificationEmail:
    """build_verification_email must HTML-escape user_name."""

    def test_xss_payload_is_escaped(self):
        html = build_verification_email(DUMMY_URL, XSS_PAYLOAD)
        assert ESCAPED_FRAGMENT in html
        assert RAW_FRAGMENT not in html

    def test_none_user_name_uses_there(self):
        html = build_verification_email(DUMMY_URL, None)
        assert "Hi there" in html

    def test_normal_name_unchanged(self):
        html = build_verification_email(DUMMY_URL, "Alice")
        assert "Hi Alice" in html

    def test_ampersand_in_name_escaped(self):
        html = build_verification_email(DUMMY_URL, "A&B")
        assert "A&amp;B" in html
        # Raw & should NOT appear unescaped adjacent to the name
        assert "Hi A&B," not in html


class TestBuildResetPasswordEmail:
    """build_reset_password_email must HTML-escape user_name."""

    def test_xss_payload_is_escaped(self):
        html = build_reset_password_email(RESET_URL, XSS_PAYLOAD)
        assert ESCAPED_FRAGMENT in html
        assert RAW_FRAGMENT not in html

    def test_none_user_name_uses_there(self):
        html = build_reset_password_email(RESET_URL, None)
        assert "Hi there" in html

    def test_normal_name_unchanged(self):
        html = build_reset_password_email(RESET_URL, "Bob")
        assert "Hi Bob" in html

    def test_quotes_in_name_escaped(self):
        html = build_reset_password_email(RESET_URL, 'O"Malley')
        assert "O&quot;Malley" in html
        assert 'O"Malley' not in html
