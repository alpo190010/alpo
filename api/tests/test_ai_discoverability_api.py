"""Tests for AI discoverability API client (robots.txt + llms.txt fetching)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ai_discoverability_api import (
    _parse_robots_txt,
    fetch_ai_discoverability_data,
)


# ── robots.txt parsing ───────────────────────────────────────────


class TestParseRobotsTxt:
    def test_allows_all_search_bots_by_default(self):
        """When robots.txt has no rules for AI bots, they should be allowed."""
        robots = "User-agent: Googlebot\nDisallow: /admin\n"
        result = _parse_robots_txt(robots)
        assert result["robots_txt_exists"] is True
        assert result["ai_search_bots"]["OAI-SearchBot"] is True
        assert result["ai_search_bots"]["PerplexityBot"] is True
        assert result["ai_search_bots"]["Claude-SearchBot"] is True

    def test_blocks_search_bots_explicitly(self):
        """When robots.txt explicitly blocks AI search bots."""
        robots = (
            "User-agent: OAI-SearchBot\nDisallow: /\n\n"
            "User-agent: PerplexityBot\nDisallow: /\n\n"
            "User-agent: Claude-SearchBot\nDisallow: /\n"
        )
        result = _parse_robots_txt(robots)
        assert result["ai_search_bots"]["OAI-SearchBot"] is False
        assert result["ai_search_bots"]["PerplexityBot"] is False
        assert result["ai_search_bots"]["Claude-SearchBot"] is False

    def test_detects_training_bots_blocked(self):
        """When training bots are explicitly blocked."""
        robots = (
            "User-agent: GPTBot\nDisallow: /\n\n"
            "User-agent: Google-Extended\nDisallow: /\n\n"
            "User-agent: ClaudeBot\nDisallow: /\n\n"
            "User-agent: CCBot\nDisallow: /\n"
        )
        result = _parse_robots_txt(robots)
        assert result["ai_training_bots"]["GPTBot"] is True
        assert result["ai_training_bots"]["Google-Extended"] is True
        assert result["ai_training_bots"]["ClaudeBot"] is True
        assert result["ai_training_bots"]["CCBot"] is True

    def test_wildcard_block(self):
        """User-agent: * with Disallow: / blocks everything."""
        robots = "User-agent: *\nDisallow: /\n"
        result = _parse_robots_txt(robots)
        assert result["has_wildcard_block"] is True
        # Search bots fall back to wildcard, so they're blocked
        assert result["ai_search_bots"]["OAI-SearchBot"] is False

    def test_wildcard_block_with_allow_override(self):
        """User-agent: * with Allow: / should not be flagged as wildcard block."""
        robots = "User-agent: *\nDisallow: /\nAllow: /\n"
        result = _parse_robots_txt(robots)
        assert result["has_wildcard_block"] is False

    def test_mixed_rules(self):
        """Allow search bots but block training bots."""
        robots = (
            "User-agent: *\nDisallow: /admin\n\n"
            "User-agent: GPTBot\nDisallow: /\n\n"
            "User-agent: Google-Extended\nDisallow: /\n"
        )
        result = _parse_robots_txt(robots)
        # Search bots should be allowed (no Disallow: / for them)
        assert result["ai_search_bots"]["OAI-SearchBot"] is True
        # Training bots should be blocked
        assert result["ai_training_bots"]["GPTBot"] is True
        assert result["ai_training_bots"]["Google-Extended"] is True
        assert result["has_wildcard_block"] is False

    def test_empty_file(self):
        result = _parse_robots_txt("")
        assert result["robots_txt_exists"] is True
        assert result["has_wildcard_block"] is False
        # All bots allowed by default
        assert all(v is True for v in result["ai_search_bots"].values())

    def test_case_insensitive(self):
        """Bot names should be matched case-insensitively."""
        robots = "User-Agent: gptbot\nDisallow: /\n"
        result = _parse_robots_txt(robots)
        assert result["ai_training_bots"]["GPTBot"] is True

    def test_comments_ignored(self):
        robots = (
            "# Allow all bots\n"
            "User-agent: GPTBot # Block training\n"
            "Disallow: / # Everything\n"
        )
        result = _parse_robots_txt(robots)
        assert result["ai_training_bots"]["GPTBot"] is True


# ── Async fetch ──────────────────────────────────────────────────


class TestFetchAiDiscoverabilityData:
    @pytest.mark.asyncio
    async def test_successful_fetch_both(self):
        mock_robots_resp = MagicMock()
        mock_robots_resp.status_code = 200
        mock_robots_resp.text = "User-agent: GPTBot\nDisallow: /\n"

        mock_llms_resp = MagicMock()
        mock_llms_resp.status_code = 200
        mock_llms_resp.text = "# llms.txt\nStore info here"

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[mock_robots_resp, mock_llms_resp])
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_discoverability_api.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_ai_discoverability_data("https://example.com/products/test")

        assert result is not None
        assert result["robots_txt_exists"] is True
        assert result["llms_txt_exists"] is True
        assert result["ai_training_bots"]["GPTBot"] is True

    @pytest.mark.asyncio
    async def test_robots_404_llms_exists(self):
        mock_robots_resp = MagicMock()
        mock_robots_resp.status_code = 404

        mock_llms_resp = MagicMock()
        mock_llms_resp.status_code = 200
        mock_llms_resp.text = "# llms.txt content"

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[mock_robots_resp, mock_llms_resp])
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_discoverability_api.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_ai_discoverability_data("https://shop.example.com/products/item")

        assert result is not None
        assert result["robots_txt_exists"] is False
        assert result["llms_txt_exists"] is True

    @pytest.mark.asyncio
    async def test_both_404(self):
        mock_robots_resp = MagicMock()
        mock_robots_resp.status_code = 404

        mock_llms_resp = MagicMock()
        mock_llms_resp.status_code = 404
        mock_llms_resp.text = ""

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[mock_robots_resp, mock_llms_resp])
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_discoverability_api.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_ai_discoverability_data("https://example.com/products/test")

        assert result is not None
        assert result["robots_txt_exists"] is False
        assert result["llms_txt_exists"] is False

    @pytest.mark.asyncio
    async def test_timeout_degrades_gracefully(self):
        """When individual fetches time out, result still returned with None fields."""
        import httpx

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("timeout"))

        with patch("app.services.ai_discoverability_api.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_ai_discoverability_data("https://example.com/products/test")

        # Individual fetch exceptions are caught by gather(return_exceptions=True),
        # so the function returns partial results with None fields
        assert result is not None
        assert result["robots_txt_exists"] is None
        assert result["llms_txt_exists"] is None

    @pytest.mark.asyncio
    async def test_invalid_url_returns_none(self):
        result = await fetch_ai_discoverability_data("not-a-url")
        assert result is None

    @pytest.mark.asyncio
    async def test_domain_extraction(self):
        """Verify URLs are constructed correctly from product URLs."""
        calls = []

        async def capture_get(url, **kwargs):
            calls.append(url)
            resp = MagicMock()
            resp.status_code = 404
            resp.text = ""
            return resp

        mock_client = AsyncMock()
        mock_client.get = capture_get
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_discoverability_api.httpx.AsyncClient", return_value=mock_client):
            await fetch_ai_discoverability_data("https://mystore.com/products/cool-widget?variant=123")

        assert "https://mystore.com/robots.txt" in calls
        assert "https://mystore.com/llms.txt" in calls
