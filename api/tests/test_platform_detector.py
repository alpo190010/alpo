"""Tests for app.services.platform_detector.is_shopify."""

from unittest.mock import patch

import pytest

from app.services.platform_detector import (
    SHOPIFY_ONLY_DIMENSIONS,
    _is_shopify_native,
    is_shopify,
)


class TestIsShopifyNative:
    """Hostname-only checks against the canonical Shopify domain list."""

    def test_myshopify_subdomain(self):
        assert _is_shopify_native("acme.myshopify.com") is True

    def test_cdn_shopify(self):
        assert _is_shopify_native("cdn.shopify.com") is True

    def test_shopifycdn(self):
        assert _is_shopify_native("foo.shopifycdn.net") is True

    def test_custom_domain_not_native(self):
        assert _is_shopify_native("example.com") is False

    def test_capitalization_normalized(self):
        assert _is_shopify_native("ACME.MYSHOPIFY.COM") is True

    def test_partial_match_does_not_count(self):
        # "myshopify.com.attacker.com" must not look like myshopify.com
        assert _is_shopify_native("myshopify.com.attacker.com") is False


class TestIsShopifyDetection:
    """End-to-end detection covering hostname, HTML markers, and the probe path."""

    @pytest.mark.asyncio
    async def test_hostname_match_short_circuits(self):
        # No HTML markers, but the hostname alone is definitive.
        assert (
            await is_shopify("shop.myshopify.com", "<html></html>")
        ) is True

    @pytest.mark.asyncio
    async def test_html_marker_cdn(self):
        html = '<img src="https://cdn.shopify.com/files/foo.png">'
        assert await is_shopify("custom-domain.com", html) is True

    @pytest.mark.asyncio
    async def test_html_marker_shopify_global(self):
        html = '<script>window.Shopify.shop = "x"</script>'
        assert await is_shopify("custom-domain.com", html) is True

    @pytest.mark.asyncio
    async def test_html_marker_meta_tag(self):
        html = '<meta name="shopify-checkout-api-token" content="abc">'
        assert await is_shopify("custom-domain.com", html) is True

    @pytest.mark.asyncio
    async def test_html_marker_custom_element(self):
        html = "<shopify-accelerated-checkout></shopify-accelerated-checkout>"
        assert await is_shopify("custom-domain.com", html) is True

    @pytest.mark.asyncio
    async def test_html_marker_theme_assignment(self):
        html = '<script>Shopify.theme = {"name":"Dawn"}</script>'
        assert await is_shopify("custom-domain.com", html) is True

    @pytest.mark.asyncio
    async def test_no_markers_returns_false(self):
        html = "<html><body><h1>Welcome to my WordPress site</h1></body></html>"
        assert await is_shopify("example.com", html) is False

    @pytest.mark.asyncio
    async def test_empty_html_with_non_shopify_hostname(self):
        assert await is_shopify("example.com", "") is False

    @pytest.mark.asyncio
    async def test_probe_disabled_by_default(self):
        # When probe_products_json=False (default), no HTTP call is made even
        # if the page is suspiciously bare.
        with patch(
            "app.services.platform_detector._probe_products_json"
        ) as mock_probe:
            mock_probe.return_value = True
            result = await is_shopify("example.com", "<html></html>")
            assert result is False
            mock_probe.assert_not_called()

    @pytest.mark.asyncio
    async def test_probe_enabled_catches_custom_domain_shopify(self):
        # When the caller opts in, an inconclusive page can still be detected
        # via the /products.json probe.
        with patch(
            "app.services.platform_detector._probe_products_json",
            return_value=True,
        ) as mock_probe:
            result = await is_shopify(
                "custom-shop.example",
                "<html></html>",
                url="https://custom-shop.example/",
                probe_products_json=True,
            )
            assert result is True
            mock_probe.assert_called_once()

    @pytest.mark.asyncio
    async def test_probe_enabled_returns_false_when_not_shopify(self):
        with patch(
            "app.services.platform_detector._probe_products_json",
            return_value=False,
        ):
            result = await is_shopify(
                "example.com",
                "<html></html>",
                url="https://example.com/",
                probe_products_json=True,
            )
            assert result is False


class TestShopifyOnlyDimensions:
    """The frozen contract used by the orchestrator and frontend filtering."""

    def test_exact_membership(self):
        assert SHOPIFY_ONLY_DIMENSIONS == frozenset(
            {
                "socialProof",
                "checkout",
                "crossSell",
                "sizeGuide",
                "variantUx",
            }
        )

    def test_count(self):
        assert len(SHOPIFY_ONLY_DIMENSIONS) == 5
