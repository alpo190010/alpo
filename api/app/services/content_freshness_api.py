"""Async HTTP client for fetching Last-Modified header from a product page."""

import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; AlpoBot/1.0)",
    "Accept": "text/html, */*",
}


async def fetch_content_freshness_data(
    product_url: str,
    timeout: float = 5.0,
) -> dict | None:
    """Issue a HEAD request to the product URL and extract the Last-Modified header.

    Returns a dict with:
      last_modified_header: raw header string
      last_modified_date_iso: ISO 8601 datetime string
    or None on failure.
    """
    if not product_url or "://" not in product_url:
        return None

    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            headers=_HEADERS,
            follow_redirects=True,
        ) as client:
            resp = await client.head(product_url)

        lm_raw = resp.headers.get("Last-Modified")
        if not lm_raw:
            return None

        lm_dt = parsedate_to_datetime(lm_raw)
        if lm_dt.tzinfo is None:
            lm_dt = lm_dt.replace(tzinfo=timezone.utc)

        return {
            "last_modified_header": lm_raw,
            "last_modified_date_iso": lm_dt.isoformat(),
        }

    except httpx.TimeoutException:
        logger.warning("Content freshness HEAD timed out for %s", product_url)
        return None
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Content freshness HTTP error for %s: %s",
            product_url, exc.response.status_code,
        )
        return None
    except Exception:
        logger.exception("Content freshness fetch error for %s", product_url)
        return None
