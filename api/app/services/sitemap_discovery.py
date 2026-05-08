"""Generic page-discovery via XML sitemaps.

Used by ``/discover-products`` when neither Shopify-JSON nor HTML
product-link scraping found anything — a strong signal the site is not
ecommerce. We then look for a sitemap.xml so the user can pick from the
real pages of the site (about, pricing, contact, blog posts, etc.)
instead of staring at a single synthetic "home" entry.

Lookup order:

1. ``{origin}/sitemap.xml``
2. ``{origin}/sitemap_index.xml``
3. ``Sitemap:`` directives in ``{origin}/robots.txt``

A sitemap that turns out to be a sitemap-index is followed up to
``_MAX_CHILD_SITEMAPS`` deep — enough to surface real top-level pages
on big sites without unbounded fanout.

Every failure mode degrades to ``[]``. The caller falls back to its
existing synthetic-home entry, so this module is allowed to be
permissive and best-effort.
"""

from __future__ import annotations

import logging
import re
import urllib.parse
import xml.etree.ElementTree as ET

import httpx

logger = logging.getLogger(__name__)

_SM_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# Cap on child sitemaps fetched when the index has many shards. Two is
# enough to cover the highest-priority shards on most sites without
# blowing the timeout budget on huge catalogs.
_MAX_CHILD_SITEMAPS = 2

# File extensions that aren't pages — assets, archives, feeds.
_ASSET_EXT_RE = re.compile(
    r"\.(?:pdf|jpe?g|png|gif|svg|webp|ico|css|js|xml|json|zip|gz|tar|"
    r"mp4|mp3|wav|mov|avi|woff2?|ttf|otf|eot|map)(?:\?|$)",
    re.IGNORECASE,
)

# Path fragments that are never useful as analyzable "pages".
_NOISE_PATH_RE = re.compile(
    r"^/(?:wp-admin|wp-json|wp-includes|wp-content/uploads|feed|rss|atom|"
    r"cart|checkout|login|signin|sign-in|signup|sign-up|register|logout|"
    r"my-account|account|api|admin|sitemap|robots\.txt)(?:/|$)",
    re.IGNORECASE,
)

# Robots.txt Sitemap directive — case-insensitive per the spec.
_ROBOTS_SITEMAP_RE = re.compile(r"^\s*sitemap\s*:\s*(\S+)\s*$", re.IGNORECASE | re.MULTILINE)

# Anchor href extraction. Captures the href value through to the next
# quote, whitespace, or angle-bracket. Permissive: `<a href='...'>`,
# `<a href="...">`, and bare `<a href=...>` all match. Skips empty
# values and pure-fragment hrefs (`href="#section"`) at the regex level.
_ANCHOR_HREF_RE = re.compile(
    r"""<a\s[^>]*?href\s*=\s*(?:["']([^"'#\s][^"'\s]*)|([^\s"'>#][^\s"'>]*))""",
    re.IGNORECASE,
)


async def discover_pages(
    origin: str,
    hostname: str,
    *,
    limit: int = 20,
    timeout: float = 5.0,
) -> list[dict]:
    """Return up to *limit* page entries discovered via sitemap.xml.

    Each entry has the same shape as the existing product entries
    in ``discover_products`` (``url``, ``slug``, ``image``) so the
    caller can hand them straight to ``_persist_store_and_products``
    and the frontend renders them through the unchanged
    ``<ProductGrid>``.

    Returns ``[]`` on any failure — bad XML, all 404s, malformed
    URLs. The caller's synthetic-home fallback then takes over.
    """
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            urls = await _fetch_sitemap_urls(client, origin)
            if not urls:
                # Sitemapless site (common on small portfolios / SaaS landings):
                # scrape the homepage's own anchor links so the user still gets
                # a real Pages list instead of the synthetic single-"home" entry.
                urls = await _scrape_homepage_anchors(client, origin)
    except Exception:
        logger.warning("page discovery failed origin=%s", origin, exc_info=True)
        return []

    if not urls:
        return []

    filtered = _filter_and_canonicalize(urls, hostname)
    entries = [_to_page_entry(u) for u in filtered]
    return _sort_and_cap(entries, origin, limit)


async def _fetch_sitemap_urls(client: httpx.AsyncClient, origin: str) -> list[str]:
    """Try /sitemap.xml, then /sitemap_index.xml, then robots.txt sitemap directive(s)."""
    for path in ("/sitemap.xml", "/sitemap_index.xml"):
        text = await _get_text(client, f"{origin.rstrip('/')}{path}")
        if text:
            urls = await _parse_sitemap_xml(client, text)
            if urls:
                return urls

    robots = await _get_text(client, f"{origin.rstrip('/')}/robots.txt")
    if not robots:
        return []
    for sm_url in _ROBOTS_SITEMAP_RE.findall(robots):
        text = await _get_text(client, sm_url)
        if not text:
            continue
        urls = await _parse_sitemap_xml(client, text)
        if urls:
            return urls
    return []


async def _get_text(client: httpx.AsyncClient, url: str) -> str | None:
    try:
        resp = await client.get(
            url, headers={"User-Agent": _USER_AGENT, "Accept": "application/xml,text/xml,*/*"}
        )
    except Exception:
        return None
    if resp.status_code != 200 or not resp.text:
        return None
    return resp.text


async def _parse_sitemap_xml(client: httpx.AsyncClient, xml_text: str) -> list[str]:
    """Return URL list from a flat sitemap or merged from a sitemap-index.

    Handles both shapes per sitemaps.org spec. Sitemap-index entries
    pointing at gzipped shards are skipped — we'd need extra deps to
    decompress and the loss of recall is acceptable.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    tag = root.tag.lower()
    if tag.endswith("sitemapindex"):
        child_urls: list[str] = []
        for child in root.findall("sm:sitemap", _SM_NS)[:_MAX_CHILD_SITEMAPS]:
            loc_el = child.find("sm:loc", _SM_NS)
            if loc_el is None or not loc_el.text:
                continue
            loc = loc_el.text.strip()
            if loc.endswith(".gz"):
                continue
            text = await _get_text(client, loc)
            if not text:
                continue
            try:
                child_root = ET.fromstring(text)
            except ET.ParseError:
                continue
            child_urls.extend(_extract_locs(child_root))
        return child_urls

    if tag.endswith("urlset"):
        return _extract_locs(root)

    return []


def _extract_locs(root: ET.Element) -> list[str]:
    locs: list[str] = []
    for url_el in root.findall("sm:url", _SM_NS):
        loc_el = url_el.find("sm:loc", _SM_NS)
        if loc_el is None or not loc_el.text:
            continue
        locs.append(loc_el.text.strip())
    return locs


def _filter_and_canonicalize(urls: list[str], hostname: str) -> list[str]:
    """Drop external/asset/noise URLs, strip query+fragment, dedupe."""
    target_host = (hostname or "").lower().removeprefix("www.")
    seen: set[str] = set()
    out: list[str] = []
    for raw in urls:
        try:
            parsed = urllib.parse.urlparse(raw)
        except ValueError:
            continue
        if parsed.scheme not in ("http", "https"):
            continue
        host = (parsed.hostname or "").lower().removeprefix("www.")
        if host != target_host:
            continue
        path = parsed.path or "/"
        if _ASSET_EXT_RE.search(path):
            continue
        if _NOISE_PATH_RE.match(path):
            continue
        canonical = urllib.parse.urlunparse(
            (parsed.scheme, parsed.netloc, path.rstrip("/") or "/", "", "", "")
        )
        if canonical in seen:
            continue
        seen.add(canonical)
        out.append(canonical)
    return out


def _to_page_entry(url: str) -> dict:
    parsed = urllib.parse.urlparse(url)
    segments = [s for s in (parsed.path or "/").split("/") if s]
    slug = segments[-1] if segments else "home"
    return {"url": url, "slug": slug, "image": ""}


async def _scrape_homepage_anchors(client: httpx.AsyncClient, origin: str) -> list[str]:
    """Pull internal page URLs from anchor tags on the homepage HTML.

    Last-resort fallback when the site has no sitemap. Plain `httpx.get`
    only sees server-rendered HTML — JS-hydrated SPA navs are missed by
    design (re-fetching with Playwright would defeat the budget).
    """
    html = await _get_text(client, origin)
    if not html:
        return []
    out: list[str] = []
    for quoted, bare in _ANCHOR_HREF_RE.findall(html):
        href = (quoted or bare or "").strip()
        if not href:
            continue
        lower = href.lower()
        if lower.startswith(("mailto:", "tel:", "javascript:", "data:")):
            continue
        if href.startswith("#"):
            continue
        out.append(urllib.parse.urljoin(origin.rstrip("/") + "/", href))
    return out


def _sort_and_cap(entries: list[dict], origin: str, limit: int) -> list[dict]:
    """Pin homepage first; sort the rest by depth, then alphabetical."""
    origin_root = origin.rstrip("/")
    home: list[dict] = []
    rest: list[dict] = []
    for e in entries:
        if e["url"].rstrip("/") == origin_root:
            # Normalize slug for the explicit homepage entry.
            home.append({**e, "slug": "home"})
        else:
            rest.append(e)
    rest.sort(
        key=lambda e: (
            urllib.parse.urlparse(e["url"]).path.count("/"),
            e["slug"].lower(),
        )
    )
    return (home + rest)[:limit]
