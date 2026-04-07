"""Tests for Cloudflare-aware IP detection in get_client_ip.

Covers the full header priority chain:
  CF-Connecting-IP → X-Forwarded-For → request.client.host → fallback
"""

from unittest.mock import MagicMock

import pytest
from starlette.requests import Request
from starlette.datastructures import Headers

from app.rate_limit import get_client_ip


def _make_request(
    headers: dict[str, str] | None = None,
    client_host: str | None = "127.0.0.1",
) -> Request:
    """Build a minimal mock Request with the given headers and client host."""
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [
            (k.lower().encode(), v.encode())
            for k, v in (headers or {}).items()
        ],
    }
    if client_host is not None:
        scope["client"] = (client_host, 12345)
    else:
        scope["client"] = None

    return Request(scope)


# ---------------------------------------------------------------------------
# CF-Connecting-IP (highest priority)
# ---------------------------------------------------------------------------


class TestCFConnectingIP:
    """CF-Connecting-IP takes priority over all other sources."""

    def test_cf_ip_returned(self):
        req = _make_request(headers={"CF-Connecting-IP": "203.0.113.50"})
        assert get_client_ip(req) == "203.0.113.50"

    def test_cf_ip_preferred_over_xff(self):
        req = _make_request(headers={
            "CF-Connecting-IP": "203.0.113.50",
            "X-Forwarded-For": "198.51.100.1, 10.0.0.1",
        })
        assert get_client_ip(req) == "203.0.113.50"

    def test_cf_ip_preferred_over_client_host(self):
        req = _make_request(
            headers={"CF-Connecting-IP": "203.0.113.50"},
            client_host="10.0.0.99",
        )
        assert get_client_ip(req) == "203.0.113.50"

    def test_cf_ip_stripped(self):
        req = _make_request(headers={"CF-Connecting-IP": "  203.0.113.50  "})
        assert get_client_ip(req) == "203.0.113.50"

    def test_empty_cf_ip_falls_through(self):
        req = _make_request(
            headers={"CF-Connecting-IP": "   "},
            client_host="10.0.0.1",
        )
        assert get_client_ip(req) == "10.0.0.1"


# ---------------------------------------------------------------------------
# X-Forwarded-For (second priority)
# ---------------------------------------------------------------------------


class TestXForwardedFor:
    """X-Forwarded-For is used when CF-Connecting-IP is absent."""

    def test_single_xff_ip(self):
        req = _make_request(headers={"X-Forwarded-For": "198.51.100.1"})
        assert get_client_ip(req) == "198.51.100.1"

    def test_multiple_xff_ips_returns_first(self):
        req = _make_request(headers={
            "X-Forwarded-For": "198.51.100.1, 10.0.0.1, 172.16.0.1",
        })
        assert get_client_ip(req) == "198.51.100.1"

    def test_xff_with_spaces(self):
        req = _make_request(headers={
            "X-Forwarded-For": "  198.51.100.1 , 10.0.0.1  ",
        })
        assert get_client_ip(req) == "198.51.100.1"

    def test_xff_preferred_over_client_host(self):
        req = _make_request(
            headers={"X-Forwarded-For": "198.51.100.1"},
            client_host="10.0.0.99",
        )
        assert get_client_ip(req) == "198.51.100.1"

    def test_empty_xff_falls_through(self):
        req = _make_request(
            headers={"X-Forwarded-For": ""},
            client_host="10.0.0.1",
        )
        assert get_client_ip(req) == "10.0.0.1"

    def test_xff_only_commas_falls_through(self):
        """XFF with only commas/spaces should fall through to client host."""
        req = _make_request(
            headers={"X-Forwarded-For": " , , "},
            client_host="10.0.0.1",
        )
        assert get_client_ip(req) == "10.0.0.1"


# ---------------------------------------------------------------------------
# Direct connection — request.client.host (lowest priority)
# ---------------------------------------------------------------------------


class TestDirectConnection:
    """request.client.host is the final fallback when no proxy headers exist."""

    def test_client_host_used_when_no_headers(self):
        req = _make_request(headers={}, client_host="192.168.1.100")
        assert get_client_ip(req) == "192.168.1.100"

    def test_none_client_returns_fallback(self):
        req = _make_request(headers={}, client_host=None)
        assert get_client_ip(req) == "127.0.0.1"

    def test_testclient_host_passthrough(self):
        """TestClient sets client.host to 'testclient' — verify it passes through."""
        req = _make_request(headers={}, client_host="testclient")
        assert get_client_ip(req) == "testclient"
