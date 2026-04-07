"""Rate limiter singleton — shared between main.py and router modules.

headers_enabled is False because slowapi's header injection requires a
Response parameter in sync endpoint signatures, which clashes with FastAPI's
dict-return convention.  Retry-After is still sent on 429 responses via the
_rate_limit_exceeded_handler.

The key function uses a Cloudflare-aware IP fallback chain:
  CF-Connecting-IP → first X-Forwarded-For entry → request.client.host
This ensures real client IPs are used for rate limiting behind Cloudflare proxy.
"""

from starlette.requests import Request
from slowapi import Limiter


def get_client_ip(request: Request) -> str:
    """Extract the real client IP from proxy headers with Cloudflare priority.

    Priority chain:
      1. CF-Connecting-IP — always set by Cloudflare on proxied requests
      2. X-Forwarded-For  — first (leftmost) IP, set by other reverse proxies
      3. request.client.host — TCP peer address, direct connection fallback
    """
    # 1. Cloudflare sets this header on every proxied request
    cf_ip = request.headers.get("cf-connecting-ip", "").strip()
    if cf_ip:
        return cf_ip

    # 2. Standard proxy header — take the first (client) IP
    xff = request.headers.get("x-forwarded-for", "").strip()
    if xff:
        first_ip = xff.split(",")[0].strip()
        if first_ip:
            return first_ip

    # 3. Direct connection — no proxy headers present
    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"


limiter = Limiter(key_func=get_client_ip, headers_enabled=False)
