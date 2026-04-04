"""Social commerce signal detector for Shopify product pages.

Detects social platform embeds (Instagram, TikTok, Pinterest) and
user-generated content (UGC) gallery apps.  Detection uses standard
BeautifulSoup DOM inspection consistent with
:pymod:`checkout_detector` and :pymod:`social_proof_detector`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Signals dataclass
# ---------------------------------------------------------------------------


@dataclass
class SocialCommerceSignals:
    """Social commerce signals extracted from a product page.

    6 fields total:
      • 3 social platform embed flags
      • 1 UGC gallery flag + 1 app name
      • 1 platform count
    """

    # --- Social platform embeds (3) ----------------------------------
    has_instagram_embed: bool = False
    """``<blockquote class="instagram-media">``, any element with
    ``data-instgrm-permalink``, or ``instagram.com/embed.js`` script
    detected."""

    has_tiktok_embed: bool = False
    """``<blockquote class="tiktok-embed">`` or
    ``analytics.tiktok.com`` script detected."""

    has_pinterest: bool = False
    """Pinterest ``pintrk`` / ``s.pinimg.com/ct`` tracking script or
    Rich Pins meta (Pinterest script + ``<meta property="og:type"
    content="product">``) detected."""

    # --- UGC gallery (2) ---------------------------------------------
    has_ugc_gallery: bool = False
    """A third-party UGC gallery app script detected."""

    ugc_gallery_app: str | None = None
    """Name of the detected UGC gallery app, or ``None``."""

    # --- Aggregate (1) -----------------------------------------------
    platform_count: int = 0
    """Number of social platforms detected (Instagram + TikTok +
    Pinterest, each counted once)."""


# ---------------------------------------------------------------------------
# Detection helpers
# ---------------------------------------------------------------------------


def _detect_instagram(soup: BeautifulSoup) -> bool:
    """Detect Instagram embed via blockquote, data attribute, or embed script."""
    if soup.find("blockquote", class_="instagram-media"):
        return True
    if soup.find(attrs={"data-instgrm-permalink": True}):
        return True
    for script in soup.find_all("script", src=True):
        if "instagram.com/embed.js" in script["src"]:
            return True
    return False


def _detect_tiktok(soup: BeautifulSoup) -> bool:
    """Detect TikTok embed via blockquote or analytics script."""
    if soup.find("blockquote", class_="tiktok-embed"):
        return True
    for script in soup.find_all("script", src=True):
        if "analytics.tiktok.com" in script["src"]:
            return True
    return False


def _detect_pinterest(soup: BeautifulSoup) -> bool:
    """Detect Pinterest tracking script or Rich Pins meta.

    Matches ``pintrk`` or ``s.pinimg.com/ct`` in script sources.
    Also detects Rich Pins: Pinterest script present *and*
    ``<meta property="og:type" content="product">``.
    """
    has_pinterest_script = False
    for script in soup.find_all("script", src=True):
        src = script["src"].lower()
        if "pintrk" in src or "s.pinimg.com/ct" in src:
            return True
        if "pinterest" in src or "pinimg.com" in src:
            has_pinterest_script = True

    # Rich Pins: pinterest script + og:type product meta
    if has_pinterest_script:
        og_type = soup.find("meta", attrs={"property": "og:type"})
        if og_type and og_type.get("content", "").lower() == "product":
            return True

    return False


def _detect_ugc_gallery(soup: BeautifulSoup) -> tuple[bool, str | None]:
    """Detect third-party UGC gallery apps via script sources.

    Supported apps: SnapWidget, EmbedSocial, Flockler, SociableKit,
    LightWidget, Mintt Studio.
    """
    gallery_apps: list[tuple[str, str]] = [
        ("snapwidget.com", "SnapWidget"),
        ("embedsocial.com", "EmbedSocial"),
        ("flockler.com", "Flockler"),
        ("sociablekit.com", "SociableKit"),
        ("lightwidget.com", "LightWidget"),
        ("mintt.co", "Mintt Studio"),
        ("minttstudio", "Mintt Studio"),
    ]

    for script in soup.find_all("script", src=True):
        src = script["src"].lower()
        for pattern, app_name in gallery_apps:
            if pattern in src:
                return True, app_name

    return False, None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_social_commerce(html: str) -> SocialCommerceSignals:
    """Detect social commerce signals from rendered product page HTML.

    Scans for Instagram, TikTok, and Pinterest embeds plus third-party
    UGC gallery apps using BeautifulSoup DOM inspection.
    """
    signals = SocialCommerceSignals()

    if not html or len(html) < 10:
        return signals

    soup = BeautifulSoup(html, "html.parser")

    # --- Social platform embeds ---
    signals.has_instagram_embed = _detect_instagram(soup)
    signals.has_tiktok_embed = _detect_tiktok(soup)
    signals.has_pinterest = _detect_pinterest(soup)

    # --- UGC gallery ---
    signals.has_ugc_gallery, signals.ugc_gallery_app = _detect_ugc_gallery(soup)

    # --- Platform count ---
    signals.platform_count = sum([
        signals.has_instagram_embed,
        signals.has_tiktok_embed,
        signals.has_pinterest,
    ])

    logger.info(
        "Social commerce detected: instagram=%s tiktok=%s pinterest=%s "
        "ugc_gallery=%s ugc_app=%s platform_count=%d",
        signals.has_instagram_embed,
        signals.has_tiktok_embed,
        signals.has_pinterest,
        signals.has_ugc_gallery,
        signals.ugc_gallery_app,
        signals.platform_count,
    )

    return signals
