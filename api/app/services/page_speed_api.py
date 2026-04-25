"""Google PageSpeed Insights API client for Shopify product page analysis.

Fetches Lighthouse lab metrics (LCP, CLS, TBT, FCP, Speed Index) and
Chrome UX Report field data for a given URL via the PSI v5 REST API.
Returns a flat dict of parsed metrics or None on any failure.
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

PSI_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


async def fetch_pagespeed_insights(
    url: str,
    api_key: str,
    timeout: float = 30.0,
    strategy: str = "MOBILE",
) -> dict | None:
    """Fetch PageSpeed Insights metrics for a URL.

    Makes a single GET request to the PSI v5 API. PSI calls typically
    take 10–25 s per strategy, so the default timeout is 30 s. Caller
    is responsible for fanning out (e.g. one call per strategy in
    parallel via asyncio.gather).

    Args:
        url: The page URL to analyse.
        api_key: Google API key with PageSpeed Insights API enabled.
        timeout: HTTP request timeout in seconds.
        strategy: ``"MOBILE"`` (default) or ``"DESKTOP"`` — controls
            which Lighthouse profile PSI runs.

    Returns:
        A flat dict of parsed metrics, or ``None`` on any failure
        (timeout, HTTP error, malformed response, missing fields).
    """
    if not api_key:
        logger.warning("PageSpeed Insights API key is empty — skipping request")
        return None

    params = {
        "url": url,
        "strategy": strategy,
        "category": "performance",
        "key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(PSI_API_URL, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        logger.warning(
            "PageSpeed Insights request timed out for %s (%s)", url, strategy
        )
        return None
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "PageSpeed Insights HTTP %d for %s (%s): %s",
            exc.response.status_code,
            url,
            strategy,
            exc.response.text[:200],
        )
        return None
    except Exception:
        logger.warning(
            "PageSpeed Insights request failed for %s (%s)",
            url,
            strategy,
            exc_info=True,
        )
        return None

    return _parse_response(data, url)


def _parse_response(data: dict, url: str) -> dict | None:
    """Extract lab and field metrics from a raw PSI response."""
    try:
        lighthouse = data["lighthouseResult"]
        audits = lighthouse["audits"]
        perf_category = lighthouse["categories"]["performance"]

        result: dict = {
            "performance_score": int(perf_category["score"] * 100),
            "lcp_ms": float(audits["largest-contentful-paint"]["numericValue"]),
            "cls_value": float(audits["cumulative-layout-shift"]["numericValue"]),
            "tbt_ms": float(audits["total-blocking-time"]["numericValue"]),
            "fcp_ms": float(audits["first-contentful-paint"]["numericValue"]),
            "speed_index_ms": float(audits["speed-index"]["numericValue"]),
        }
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning(
            "PageSpeed Insights response missing expected fields for %s: %s",
            url,
            exc,
        )
        return None

    # --- Chrome UX Report (CrUX) field data (optional) -------------------
    field_metrics = (
        data.get("loadingExperience", {}).get("metrics") or None
    )
    result["has_field_data"] = field_metrics is not None

    if field_metrics is not None:
        lcp_entry = field_metrics.get("LARGEST_CONTENTFUL_PAINT_MS")
        result["field_lcp_ms"] = (
            float(lcp_entry["percentile"]) if lcp_entry else None
        )

        cls_entry = field_metrics.get("CUMULATIVE_LAYOUT_SHIFT_SCORE")
        # CrUX reports CLS multiplied by 100; divide back to real value.
        result["field_cls_value"] = (
            float(cls_entry["percentile"]) / 100 if cls_entry else None
        )
    else:
        result["field_lcp_ms"] = None
        result["field_cls_value"] = None

    return result
