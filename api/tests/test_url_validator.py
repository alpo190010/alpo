"""Tests for app.services.url_validator — shared SSRF-safe URL validation."""

import pytest

from app.services.url_validator import validate_url


# ---------------------------------------------------------------------------
# Happy-path: valid URLs
# ---------------------------------------------------------------------------


class TestValidUrls:
    """URLs that must pass validation and return (cleaned_url, None)."""

    @pytest.mark.parametrize(
        "raw, expected_url",
        [
            ("https://example.com", "https://example.com"),
            ("http://example.com/path?q=1", "http://example.com/path?q=1"),
            ("https://shop.example.co.uk/products/42", "https://shop.example.co.uk/products/42"),
            # Scheme normalisation — bare hostname gets https://
            ("example.com", "https://example.com"),
            ("example.com/page?x=1", "https://example.com/page?x=1"),
            # Whitespace trimming
            ("  https://example.com  ", "https://example.com"),
        ],
    )
    def test_valid_url(self, raw: str, expected_url: str) -> None:
        cleaned, err = validate_url(raw)
        assert err is None
        assert cleaned == expected_url


# ---------------------------------------------------------------------------
# SSRF blocklist: private / loopback hosts
# ---------------------------------------------------------------------------


class TestSSRFBlocklist:
    """All internal / private hosts must be rejected."""

    @pytest.mark.parametrize(
        "url",
        [
            # Exact matches
            "http://localhost/secret",
            "https://localhost",
            "http://0.0.0.0",
            "http://[::1]",
            "http://[::1]:8080/admin",
            # Prefix-based blocks
            "http://127.0.0.1",
            "http://127.1.2.3",
            "http://10.0.0.1/internal",
            "http://10.255.255.255",
            "http://192.168.0.1",
            "http://192.168.100.50/admin",
            "http://172.16.0.1",
            "http://172.31.255.255",
            # .local suffix
            "http://myhost.local",
            "http://printer.local:631",
        ],
    )
    def test_blocked_host(self, url: str) -> None:
        cleaned, err = validate_url(url)
        assert cleaned == ""
        assert err == "Internal URLs are not allowed"


# ---------------------------------------------------------------------------
# Scheme validation
# ---------------------------------------------------------------------------


class TestSchemeValidation:
    """Only http and https are allowed."""

    @pytest.mark.parametrize(
        "url",
        [
            "ftp://files.example.com",
            "ssh://server.example.com",
        ],
    )
    def test_bad_scheme(self, url: str) -> None:
        cleaned, err = validate_url(url)
        assert cleaned == ""
        assert err == "Only HTTP/HTTPS URLs are supported"

    @pytest.mark.parametrize(
        "url, expected_error",
        [
            # file:/// has no hostname → "Invalid URL format"
            ("file:///etc/passwd", "Invalid URL format"),
            # javascript: has no hostname → "Invalid URL format"
            ("javascript:alert(1)", "Invalid URL format"),
        ],
    )
    def test_bad_scheme_edge_cases(self, url: str, expected_error: str) -> None:
        """Schemes that are rejected but via format-check rather than scheme-check."""
        cleaned, err = validate_url(url)
        assert cleaned == ""
        assert err == expected_error


# ---------------------------------------------------------------------------
# Length & empty / whitespace-only
# ---------------------------------------------------------------------------


class TestLengthAndEmpty:
    """Edge cases around length limits, empty, and whitespace-only input."""

    def test_empty_string(self) -> None:
        cleaned, err = validate_url("")
        assert cleaned == ""
        assert err == "URL is required"

    def test_whitespace_only(self) -> None:
        cleaned, err = validate_url("   ")
        assert cleaned == ""
        assert err == "URL is required"

    def test_none_like_empty(self) -> None:
        """Callers might accidentally pass empty after .strip()."""
        cleaned, err = validate_url("")
        assert err is not None

    def test_too_long(self) -> None:
        url = "https://example.com/" + "a" * 2048
        cleaned, err = validate_url(url)
        assert cleaned == ""
        assert err == "URL is too long"

    def test_exactly_2048_is_ok(self) -> None:
        """A URL of exactly 2048 chars should pass (the limit is >2048)."""
        base = "https://example.com/"
        padding = "a" * (2048 - len(base))
        url = base + padding
        assert len(url) == 2048
        cleaned, err = validate_url(url)
        assert err is None
        assert cleaned == url

    def test_2049_is_too_long(self) -> None:
        base = "https://example.com/"
        padding = "a" * (2049 - len(base))
        url = base + padding
        assert len(url) == 2049
        cleaned, err = validate_url(url)
        assert cleaned == ""
        assert err == "URL is too long"


# ---------------------------------------------------------------------------
# Missing hostname / malformed
# ---------------------------------------------------------------------------


class TestMissingHostname:
    """URLs that parse but have no usable hostname."""

    @pytest.mark.parametrize(
        "url",
        [
            "https://",
            "https:///path",
            "http://",
        ],
    )
    def test_no_hostname(self, url: str) -> None:
        cleaned, err = validate_url(url)
        assert cleaned == ""
        assert err == "Invalid URL format"


# ---------------------------------------------------------------------------
# Return-type contract (D092)
# ---------------------------------------------------------------------------


class TestReturnContract:
    """validate_url always returns a 2-tuple, never raises."""

    def test_success_is_tuple(self) -> None:
        result = validate_url("https://example.com")
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], str)
        assert result[1] is None

    def test_failure_is_tuple(self) -> None:
        result = validate_url("")
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert result[0] == ""
        assert isinstance(result[1], str)
