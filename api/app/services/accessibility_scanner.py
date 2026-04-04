"""Playwright-based headless Chromium accessibility scanner.

Runs `axe-core <https://github.com/dequelabs/axe-core>`_ WCAG 2.1 AA
scans via headless Chromium.  The primary path uses the
``axe-playwright-python`` package; if that import fails (e.g. missing
native dependency), a fallback injects ``axe.min.js`` directly from a
CDN and evaluates ``axe.run()`` in the page context.

Usage in the analysis pipeline::

    violations = await run_axe_scan("https://example.com")
    if violations is not None:
        # violations is a list[dict] matching the axe-core violations schema
        ...
"""

from __future__ import annotations

import logging
import time

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Try importing the dedicated axe-playwright-python wrapper.  If it's not
# installed (or has a broken native dep), we fall back to direct axe.min.js
# injection via CDN.
# ---------------------------------------------------------------------------
_AXE_LIB_AVAILABLE = True
try:
    from axe_playwright_python.async_playwright import Axe  # type: ignore[import-untyped]
except Exception:  # pragma: no cover — import errors are env-specific
    _AXE_LIB_AVAILABLE = False
    Axe = None  # type: ignore[assignment,misc]
    logger.info(
        "axe-playwright-python not available — will use CDN fallback for axe-core"
    )

# Shared Chromium launch flags (same as page_renderer.py).
_CHROMIUM_ARGS: list[str] = [
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-gpu",
]

# WCAG tags we care about for the accessibility audit.
_WCAG_RUN_ONLY = {
    "type": "tag",
    "values": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
}

# CDN URL for the axe-core script used in the fallback path.
_AXE_CDN_URL = (
    "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js"
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def run_axe_scan(
    url: str,
    timeout_ms: int = 20_000,
) -> list[dict] | None:
    """Run an axe-core WCAG 2.1 AA accessibility scan on *url*.

    Launches a disposable headless Chromium, navigates to *url* (using
    ``domcontentloaded`` — the page is already rendered earlier in the
    pipeline so axe just needs the DOM + CSS), runs the scan, and
    returns the raw violations list.

    Args:
        url: Fully-qualified URL to scan.
        timeout_ms: Navigation timeout in milliseconds (default 20 000).

    Returns:
        A ``list[dict]`` of axe-core violation objects on success,
        or ``None`` if the scan fails for any reason (timeout, crash,
        missing dependency, …).  **Never raises.**
    """
    browser = None
    start = time.monotonic()

    try:
        pw_ctx = async_playwright()
        pw = await pw_ctx.start()

        try:
            browser = await pw.chromium.launch(
                headless=True,
                args=_CHROMIUM_ARGS,
            )
            page = await browser.new_page()

            await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=timeout_ms,
            )

            violations = await _run_axe(page)

            elapsed_ms = (time.monotonic() - start) * 1_000
            count = len(violations) if violations is not None else "N/A"
            logger.info(
                "axe scan for %s finished in %.0f ms — %s violations",
                url,
                elapsed_ms,
                count,
            )
            return violations

        finally:
            if browser is not None:
                await browser.close()
            await pw_ctx.__aexit__(None, None, None)

    except (PlaywrightError, PlaywrightTimeoutError) as exc:
        elapsed_ms = (time.monotonic() - start) * 1_000
        logger.warning(
            "axe scan failed for %s after %.0f ms (Playwright): %s",
            url,
            elapsed_ms,
            exc,
        )
        return None

    except Exception as exc:  # noqa: BLE001 — intentional catch-all
        elapsed_ms = (time.monotonic() - start) * 1_000
        logger.warning(
            "axe scan failed for %s after %.0f ms (unexpected): %s",
            url,
            elapsed_ms,
            exc,
        )
        return None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _run_axe(page) -> list[dict] | None:  # type: ignore[type-arg]
    """Execute axe-core on *page*, using the library or CDN fallback."""
    if _AXE_LIB_AVAILABLE and Axe is not None:
        return await _run_axe_library(page)
    return await _run_axe_cdn_fallback(page)


async def _run_axe_library(page) -> list[dict] | None:  # type: ignore[type-arg]
    """Primary path — use ``axe-playwright-python``."""
    try:
        axe = Axe()
        results = await axe.run(
            page,
            options={"runOnly": _WCAG_RUN_ONLY},
        )
        return results.response.get("violations", [])
    except Exception as exc:  # noqa: BLE001
        logger.warning("axe library run failed, trying CDN fallback: %s", exc)
        return await _run_axe_cdn_fallback(page)


async def _run_axe_cdn_fallback(page) -> list[dict] | None:  # type: ignore[type-arg]
    """Fallback — inject ``axe.min.js`` from CDN and evaluate directly."""
    try:
        await page.add_script_tag(url=_AXE_CDN_URL)
        # Small wait for the script to initialise.
        await page.wait_for_function("typeof window.axe !== 'undefined'", timeout=10_000)

        results = await page.evaluate(
            """() => axe.run({
                runOnly: {
                    type: 'tag',
                    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
                }
            })"""
        )

        if isinstance(results, dict):
            return results.get("violations", [])

        logger.warning("axe CDN fallback returned unexpected type: %s", type(results))
        return None

    except Exception as exc:  # noqa: BLE001
        logger.warning("axe CDN fallback failed: %s", exc)
        return None
