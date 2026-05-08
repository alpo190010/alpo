"""Tests for app.services.platform_detector.is_shopify."""

from unittest.mock import patch

import pytest

from app.services.platform_detector import (
    ALL_DIMENSIONS,
    NON_ECOMMERCE_DIMENSIONS,
    SHOPIFY_ONLY_DIMENSIONS,
    _is_shopify_native,
    is_ecommerce,
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


class TestNonEcommerceDimensions:
    """Curated list of dimensions whose rubrics apply to a regular website.

    Anything that assumes a transactional purchase context (price tactics,
    shipping, checkout, social-commerce embeds, Product structured data)
    is intentionally excluded — those rubrics score near zero on a SaaS
    landing / blog / portfolio for reasons the user can't act on.
    """

    def test_count_is_nine(self):
        assert len(NON_ECOMMERCE_DIMENSIONS) == 9

    def test_membership(self):
        assert NON_ECOMMERCE_DIMENSIONS == frozenset(
            {
                "title",
                "description",
                "images",
                "mobileCta",
                "trust",
                "pageSpeed",
                "aiDiscoverability",
                "accessibility",
                "contentFreshness",
            }
        )

    def test_disjoint_with_shopify_only(self):
        assert NON_ECOMMERCE_DIMENSIONS & SHOPIFY_ONLY_DIMENSIONS == frozenset()

    def test_subset_of_all(self):
        assert NON_ECOMMERCE_DIMENSIONS <= ALL_DIMENSIONS

    def test_all_dimensions_count(self):
        assert len(ALL_DIMENSIONS) == 18


class TestIsEcommerce:
    """Lightweight ecommerce-detection signal checks.

    Drives the right-tab framing on /scan/{domain} ("Products" vs.
    "Pages"). Permissive on purpose — false positives are tolerated;
    we just want a high recall on actual ecommerce sites.
    """

    def test_jsonld_product_schema_is_ecommerce(self):
        html = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"X"}</script>'
        assert is_ecommerce(html) is True

    def test_add_to_cart_button_marker_is_ecommerce(self):
        html = '<form><button name="add-to-cart">Add to Cart</button></form>'
        assert is_ecommerce(html) is True

    def test_shopify_payment_button_is_ecommerce(self):
        html = "<shopify-payment-button></shopify-payment-button>"
        assert is_ecommerce(html) is True

    def test_product_form_class_is_ecommerce(self):
        html = '<form class="product-form"><input /></form>'
        assert is_ecommerce(html) is True

    def test_plain_saas_landing_is_not_ecommerce(self):
        html = "<html><body><h1>Sign in to your dashboard</h1><p>Pricing plans below.</p></body></html>"
        assert is_ecommerce(html) is False

    def test_blog_post_is_not_ecommerce(self):
        html = "<article><h1>Five things I learned</h1><p>Lorem ipsum dolor sit amet.</p></article>"
        assert is_ecommerce(html) is False

    def test_empty_html_is_not_ecommerce(self):
        assert is_ecommerce("") is False
        assert is_ecommerce("", url="https://example.com/products/x") is False

    def test_products_path_alone_not_enough(self):
        # A /products/<slug> URL on a non-ecommerce host (e.g. a SaaS
        # landing site that happens to use that path naming) shouldn't
        # flip the verdict without cart text in the HTML.
        html = "<html><body><p>Our newest tool</p></body></html>"
        assert (
            is_ecommerce(html, url="https://example.com/products/x")
            is False
        )

    def test_products_path_plus_cart_text_is_ecommerce(self):
        html = "<html><body><button>Add to cart</button></body></html>"
        assert (
            is_ecommerce(html, url="https://example.com/products/x")
            is True
        )
