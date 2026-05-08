"""Tests for app.services.sitemap_discovery.discover_pages.

The function powers the "Pages" tab on /scan/{domain} when the site
isn't ecommerce. It needs to be permissive on input (real-world
sitemaps are messy) but strict on output (all entries must have a
sane slug + a same-host URL).
"""
from __future__ import annotations

import re
from unittest.mock import AsyncMock

import pytest

from app.services.sitemap_discovery import (
    _filter_and_canonicalize,
    _sort_and_cap,
    _to_page_entry,
    discover_pages,
)


_NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'


def _flat_sitemap(urls: list[str]) -> str:
    locs = "\n".join(f"  <url><loc>{u}</loc></url>" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset {_NS}>\n{locs}\n</urlset>'


def _index_sitemap(child_urls: list[str]) -> str:
    locs = "\n".join(f"  <sitemap><loc>{u}</loc></sitemap>" for u in child_urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex {_NS}>\n{locs}\n</sitemapindex>'


class _FakeResponse:
    def __init__(self, status_code: int, text: str = "") -> None:
        self.status_code = status_code
        self.text = text


def _client_with(routes: dict[str, _FakeResponse]) -> AsyncMock:
    """Build an httpx.AsyncClient stand-in that returns canned responses by URL.

    Default for unmapped URLs is 404 — so a test that only declares
    ``/sitemap.xml`` will see 404 for the index/robots fallbacks.
    """
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.__aexit__.return_value = None

    async def _get(url, headers=None, **_kwargs):
        return routes.get(url, _FakeResponse(404, ""))

    client.get = AsyncMock(side_effect=_get)
    return client


@pytest.mark.asyncio
async def test_flat_sitemap_returns_pages(monkeypatch):
    routes = {
        "https://example.com/sitemap.xml": _FakeResponse(
            200,
            _flat_sitemap(
                [
                    "https://example.com/",
                    "https://example.com/about",
                    "https://example.com/pricing",
                    "https://example.com/contact",
                    "https://example.com/blog/hello-world",
                ]
            ),
        )
    }
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with(routes),
    )
    pages = await discover_pages("https://example.com", "example.com")
    assert len(pages) == 5
    slugs = [p["slug"] for p in pages]
    # Homepage pinned first, blog post last (depth 2).
    assert slugs[0] == "home"
    assert slugs[-1] == "hello-world"
    assert all(p["image"] == "" for p in pages)
    assert all(p["url"].startswith("https://example.com") for p in pages)


@pytest.mark.asyncio
async def test_sitemap_index_merges_child_sitemaps(monkeypatch):
    routes = {
        "https://example.com/sitemap.xml": _FakeResponse(
            200,
            _index_sitemap(
                [
                    "https://example.com/sitemap-1.xml",
                    "https://example.com/sitemap-2.xml",
                ]
            ),
        ),
        "https://example.com/sitemap-1.xml": _FakeResponse(
            200, _flat_sitemap(["https://example.com/about"])
        ),
        "https://example.com/sitemap-2.xml": _FakeResponse(
            200, _flat_sitemap(["https://example.com/pricing"])
        ),
    }
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with(routes),
    )
    pages = await discover_pages("https://example.com", "example.com")
    slugs = sorted(p["slug"] for p in pages)
    assert slugs == ["about", "pricing"]


@pytest.mark.asyncio
async def test_limit_caps_with_homepage_first(monkeypatch):
    urls = ["https://example.com/"] + [
        f"https://example.com/page-{i:02d}" for i in range(50)
    ]
    routes = {
        "https://example.com/sitemap.xml": _FakeResponse(200, _flat_sitemap(urls))
    }
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with(routes),
    )
    pages = await discover_pages("https://example.com", "example.com", limit=20)
    assert len(pages) == 20
    assert pages[0]["slug"] == "home"
    # Remaining 19 are top-level (depth 1) and alphabetical.
    rest = [p["slug"] for p in pages[1:]]
    assert rest == sorted(rest)


@pytest.mark.asyncio
async def test_external_hosts_are_filtered_out(monkeypatch):
    routes = {
        "https://example.com/sitemap.xml": _FakeResponse(
            200,
            _flat_sitemap(
                [
                    "https://example.com/about",
                    "https://other-site.com/intruder",
                    "https://www.example.com/contact",  # www. variant of same host
                ]
            ),
        )
    }
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with(routes),
    )
    pages = await discover_pages("https://example.com", "example.com")
    slugs = sorted(p["slug"] for p in pages)
    assert slugs == ["about", "contact"]


@pytest.mark.asyncio
async def test_assets_and_admin_paths_filtered_out(monkeypatch):
    routes = {
        "https://example.com/sitemap.xml": _FakeResponse(
            200,
            _flat_sitemap(
                [
                    "https://example.com/about",
                    "https://example.com/logo.png",
                    "https://example.com/whitepaper.pdf",
                    "https://example.com/wp-admin/options.php",
                    "https://example.com/cart",
                    "https://example.com/feed",
                ]
            ),
        )
    }
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with(routes),
    )
    pages = await discover_pages("https://example.com", "example.com")
    assert [p["slug"] for p in pages] == ["about"]


@pytest.mark.asyncio
async def test_all_404_returns_empty(monkeypatch):
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with({}),  # all 404
    )
    pages = await discover_pages("https://example.com", "example.com")
    assert pages == []


@pytest.mark.asyncio
async def test_malformed_xml_returns_empty(monkeypatch):
    routes = {
        "https://example.com/sitemap.xml": _FakeResponse(200, "<not valid xml>>"),
        "https://example.com/sitemap_index.xml": _FakeResponse(404, ""),
        "https://example.com/robots.txt": _FakeResponse(404, ""),
    }
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with(routes),
    )
    pages = await discover_pages("https://example.com", "example.com")
    assert pages == []


@pytest.mark.asyncio
async def test_robots_txt_sitemap_directive_is_followed(monkeypatch):
    routes = {
        "https://example.com/sitemap.xml": _FakeResponse(404, ""),
        "https://example.com/sitemap_index.xml": _FakeResponse(404, ""),
        "https://example.com/robots.txt": _FakeResponse(
            200,
            "User-agent: *\nDisallow:\nSitemap: https://example.com/custom-map.xml\n",
        ),
        "https://example.com/custom-map.xml": _FakeResponse(
            200, _flat_sitemap(["https://example.com/about"])
        ),
    }
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with(routes),
    )
    pages = await discover_pages("https://example.com", "example.com")
    assert [p["slug"] for p in pages] == ["about"]


# --- Pure-function unit tests for the helpers --------------------------

def test_filter_drops_query_and_fragment():
    out = _filter_and_canonicalize(
        ["https://example.com/about?utm=x#top"], "example.com"
    )
    assert out == ["https://example.com/about"]


def test_filter_dedupes_trailing_slash_variants():
    out = _filter_and_canonicalize(
        [
            "https://example.com/about",
            "https://example.com/about/",
        ],
        "example.com",
    )
    assert out == ["https://example.com/about"]


def test_to_page_entry_homepage():
    assert _to_page_entry("https://example.com/") == {
        "url": "https://example.com/",
        "slug": "home",
        "image": "",
    }


def test_to_page_entry_deep_path():
    assert _to_page_entry("https://example.com/blog/post-x")["slug"] == "post-x"


def test_sort_pins_homepage_then_depth_then_alpha():
    entries = [
        {"url": "https://example.com/zeta", "slug": "zeta", "image": ""},
        {"url": "https://example.com/blog/x", "slug": "x", "image": ""},
        {"url": "https://example.com/", "slug": "home", "image": ""},
        {"url": "https://example.com/alpha", "slug": "alpha", "image": ""},
    ]
    out = _sort_and_cap(entries, "https://example.com", limit=10)
    assert [e["slug"] for e in out] == ["home", "alpha", "zeta", "x"]


# --- Homepage-anchor fallback (when sitemap is missing) ----------------

_HOMEPAGE_HTML = """\
<html><body>
  <nav>
    <a href="/about">About</a>
    <a href='/services'>Services</a>
    <a href="https://example.com/projects">Projects</a>
    <a href="/contact">Contact</a>
    <a href="https://example.com/blog/hello-world">Blog post</a>
  </nav>
</body></html>"""


@pytest.mark.asyncio
async def test_no_sitemap_falls_back_to_homepage_anchor_scrape(monkeypatch):
    """No sitemap.xml / sitemap_index.xml / robots.txt → anchor scrape."""
    routes = {
        "https://example.com": _FakeResponse(200, _HOMEPAGE_HTML),
    }
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with(routes),
    )
    pages = await discover_pages("https://example.com", "example.com")
    slugs = [p["slug"] for p in pages]
    assert "about" in slugs
    assert "services" in slugs
    assert "projects" in slugs
    assert "contact" in slugs
    assert "hello-world" in slugs
    assert len(pages) == 5


@pytest.mark.asyncio
async def test_anchor_scrape_filters_mailto_tel_fragment_and_external(monkeypatch):
    html = """\
    <a href="mailto:hi@example.com">Mail</a>
    <a href="tel:+12345">Call</a>
    <a href="#section">Anchor</a>
    <a href="javascript:void(0)">JS</a>
    <a href="https://twitter.com/x">Twitter</a>
    """
    routes = {"https://example.com": _FakeResponse(200, html)}
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with(routes),
    )
    pages = await discover_pages("https://example.com", "example.com")
    assert pages == []


@pytest.mark.asyncio
async def test_anchor_scrape_resolves_relative_paths(monkeypatch):
    """`href="about"` (no leading slash) should resolve to the origin."""
    html = '<a href="about">About</a><a href="services/">Services</a>'
    routes = {"https://example.com": _FakeResponse(200, html)}
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: _client_with(routes),
    )
    pages = await discover_pages("https://example.com", "example.com")
    slugs = sorted(p["slug"] for p in pages)
    assert slugs == ["about", "services"]


@pytest.mark.asyncio
async def test_sitemap_present_skips_anchor_scrape(monkeypatch):
    """When sitemap returns URLs, the homepage isn't fetched at all."""
    routes = {
        "https://example.com/sitemap.xml": _FakeResponse(
            200, _flat_sitemap(["https://example.com/about"])
        ),
    }
    client = _client_with(routes)
    monkeypatch.setattr(
        "app.services.sitemap_discovery.httpx.AsyncClient",
        lambda *args, **kwargs: client,
    )
    pages = await discover_pages("https://example.com", "example.com")
    assert [p["slug"] for p in pages] == ["about"]
    fetched_urls = [c.kwargs.get("url") or c.args[0] for c in client.get.await_args_list]
    assert "https://example.com" not in fetched_urls
    assert "https://example.com/" not in fetched_urls
