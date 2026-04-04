"""Tests for Content Freshness API client."""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.content_freshness_api import fetch_content_freshness_data


@pytest.mark.asyncio
class TestFetchContentFreshnessData:
    async def test_successful_head_with_last_modified(self):
        mock_resp = MagicMock()
        mock_resp.headers = {"Last-Modified": "Wed, 01 Jan 2026 12:00:00 GMT"}

        mock_client = AsyncMock()
        mock_client.head = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.content_freshness_api.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_content_freshness_data("https://example.com/product")

        assert result is not None
        assert result["last_modified_header"] == "Wed, 01 Jan 2026 12:00:00 GMT"
        assert "last_modified_date_iso" in result

    async def test_no_last_modified_header(self):
        mock_resp = MagicMock()
        mock_resp.headers = {}

        mock_client = AsyncMock()
        mock_client.head = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.content_freshness_api.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_content_freshness_data("https://example.com/product")

        assert result is None

    async def test_timeout_returns_none(self):
        import httpx

        mock_client = AsyncMock()
        mock_client.head = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.content_freshness_api.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_content_freshness_data("https://example.com/product")

        assert result is None

    async def test_invalid_url_returns_none(self):
        result = await fetch_content_freshness_data("")
        assert result is None

        result = await fetch_content_freshness_data("not-a-url")
        assert result is None
