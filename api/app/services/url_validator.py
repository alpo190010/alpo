"""Shared URL validation with SSRF blocklist.

Returns a tuple instead of raising exceptions (D092).
All URL-accepting endpoints should call ``validate_url`` before fetching.
"""

import re
import urllib.parse

# ---------------------------------------------------------------------------
# SSRF blocklist
# ---------------------------------------------------------------------------

# urlparse strips IPv6 brackets: "[::1]" → hostname "::1"
_BLOCKED_EXACT: set[str] = {"localhost", "0.0.0.0", "::1", "[::1]"}
_BLOCKED_PREFIXES: tuple[str, ...] = ("127.", "10.", "192.168.", "172.")
_BLOCKED_SUFFIX: str = ".local"

_MAX_URL_LENGTH = 2048

# RFC 3986 § 3.1 — scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+\-.]*:")


def _is_blocked_host(hostname: str) -> bool:
    """Return *True* when *hostname* resolves to a private / loopback address."""
    h = hostname.lower()
    if h in _BLOCKED_EXACT:
        return True
    if any(h.startswith(p) for p in _BLOCKED_PREFIXES):
        return True
    if h.endswith(_BLOCKED_SUFFIX):
        return True
    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_url(raw_url: str) -> tuple[str, str | None]:
    """Validate and normalise a user-supplied URL.

    Returns ``(cleaned_url, None)`` on success or ``("", error_message)``
    on failure.  The caller decides what HTTP status to map the error to.

    Normalisation steps:
    * strip surrounding whitespace
    * prepend ``https://`` when no scheme is present
    """
    if not raw_url or not raw_url.strip():
        return ("", "URL is required")

    url = raw_url.strip()

    # Scheme normalisation — only add https:// when the URL has no scheme at all.
    # Detect existing scheme via RFC 3986 pattern (e.g. "http:", "ftp:", "javascript:").
    if not _SCHEME_RE.match(url):
        url = f"https://{url}"

    if len(url) > _MAX_URL_LENGTH:
        return ("", "URL is too long")

    parsed = urllib.parse.urlparse(url)

    if not parsed.scheme or not parsed.hostname:
        return ("", "Invalid URL format")

    if parsed.scheme not in ("http", "https"):
        return ("", "Only HTTP/HTTPS URLs are supported")

    if _is_blocked_host(parsed.hostname):
        return ("", "Internal URLs are not allowed")

    return (url, None)
