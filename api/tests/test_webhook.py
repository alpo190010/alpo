"""Tests for POST /webhook endpoint."""

import hashlib
import hmac as hmac_mod
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app

WEBHOOK_SECRET = "test-webhook-secret-123"

# A fixed UUID for test users
TEST_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


def _make_mock_user(**overrides):
    """Create a mock User object with default subscription fields."""
    user = MagicMock()
    user.id = overrides.get("id", TEST_USER_ID)
    user.email = overrides.get("email", "user@example.com")
    user.plan_tier = overrides.get("plan_tier", "free")
    user.credits_used = overrides.get("credits_used", 0)
    user.credits_reset_at = overrides.get("credits_reset_at", datetime.now(timezone.utc))
    user.lemon_subscription_id = overrides.get("lemon_subscription_id", None)
    user.lemon_customer_id = overrides.get("lemon_customer_id", None)
    user.current_period_end = overrides.get("current_period_end", None)
    user.lemon_customer_portal_url = overrides.get("lemon_customer_portal_url", None)
    return user


def _mock_db_with_user(user=None):
    """Create a mock DB session that returns the given user on queries."""
    db = MagicMock()
    query_mock = MagicMock()
    filter_mock = MagicMock()
    filter_mock.first.return_value = user
    query_mock.filter.return_value = filter_mock
    db.query.return_value = query_mock
    return db


def _mock_db_factory(db_instance):
    """Create a get_db override that yields the given DB mock."""
    def override():
        yield db_instance
    return override


def _mock_db():
    """Yield a mock DB session for dependency override."""
    yield MagicMock()


def _get_client():
    app.dependency_overrides[get_db] = _mock_db
    client = TestClient(app)
    return client


def _sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    """Compute HMAC-SHA256 hex digest for a raw body."""
    return hmac_mod.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _order_created_body(
    email: str = "buyer@example.com",
    url: str = "https://example.com/landing",
) -> dict:
    """Build a LemonSqueezy order_created webhook payload."""
    return {
        "meta": {
            "event_name": "order_created",
            "custom_data": {"url": url},
        },
        "data": {
            "attributes": {
                "user_email": email,
            }
        },
    }


def _send_webhook(client, body: dict, secret: str = WEBHOOK_SECRET):
    """POST /webhook with correct HMAC signature."""
    raw = json.dumps(body).encode("utf-8")
    sig = _sign(raw, secret)
    return client.post(
        "/webhook",
        content=raw,
        headers={"content-type": "application/json", "x-signature": sig},
    )


# ---- HMAC verification ----------------------------------------------------


class TestWebhookHMAC:
    @patch("app.routers.webhook.settings")
    def test_invalid_signature_returns_401(self, mock_settings):
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        client = _get_client()
        body = json.dumps({"meta": {"event_name": "test"}}).encode("utf-8")
        resp = client.post(
            "/webhook",
            content=body,
            headers={"content-type": "application/json", "x-signature": "bad-sig"},
        )
        assert resp.status_code == 401
        assert resp.json()["error"] == "Invalid signature"

    @patch("app.routers.webhook.settings")
    def test_missing_signature_returns_401(self, mock_settings):
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        client = _get_client()
        body = json.dumps({"meta": {"event_name": "test"}}).encode("utf-8")
        resp = client.post(
            "/webhook",
            content=body,
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 401


# ---- event filtering -------------------------------------------------------


class TestWebhookEventFiltering:
    @patch("app.routers.webhook.settings")
    def test_non_order_created_returns_ok(self, mock_settings):
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        client = _get_client()
        body = {"meta": {"event_name": "subscription_created"}}
        resp = _send_webhook(client, body)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    @patch("app.routers.webhook.settings")
    def test_order_updated_returns_ok(self, mock_settings):
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        client = _get_client()
        body = {"meta": {"event_name": "order_updated"}}
        resp = _send_webhook(client, body)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


# ---- missing data ----------------------------------------------------------


class TestWebhookMissingData:
    @patch("app.routers.webhook.settings")
    def test_missing_email_returns_400(self, mock_settings):
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        mock_settings.openai_api_key = "sk-test"
        client = _get_client()
        body = {
            "meta": {"event_name": "order_created", "custom_data": {"url": "https://x.com"}},
            "data": {"attributes": {}},
        }
        resp = _send_webhook(client, body)
        assert resp.status_code == 400
        assert resp.json()["error"] == "Missing data"

    @patch("app.routers.webhook.settings")
    def test_missing_url_returns_400(self, mock_settings):
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        mock_settings.openai_api_key = "sk-test"
        client = _get_client()
        body = {
            "meta": {"event_name": "order_created", "custom_data": {}},
            "data": {"attributes": {"user_email": "buyer@x.com"}},
        }
        resp = _send_webhook(client, body)
        assert resp.status_code == 400


# ---- full order_created flow -----------------------------------------------


class TestWebhookOrderCreated:
    @patch("app.routers.webhook.send_email", return_value=True)
    @patch("app.routers.webhook._generate_report", new_callable=AsyncMock)
    @patch("app.routers.webhook._fetch_page_html", new_callable=AsyncMock)
    @patch("app.routers.webhook.settings")
    def test_valid_order_created_sends_email(
        self, mock_settings, mock_fetch, mock_report, mock_send
    ):
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        mock_settings.openai_api_key = "sk-test"
        mock_fetch.return_value = "<html>page</html>"
        mock_report.return_value = "Great landing page analysis..."

        client = _get_client()
        resp = _send_webhook(client, _order_created_body())
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

        # Verify email was sent
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["from_addr"] == "alpo.ai <report@alpo.com>"
        assert call_kwargs["to"] == "buyer@example.com"
        assert "example.com/landing" in call_kwargs["subject"]

    @patch("app.routers.webhook.send_email", return_value=True)
    @patch("app.routers.webhook._generate_report", new_callable=AsyncMock)
    @patch("app.routers.webhook._fetch_page_html", new_callable=AsyncMock)
    @patch("app.routers.webhook.settings")
    def test_report_included_in_email_html(
        self, mock_settings, mock_fetch, mock_report, mock_send
    ):
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        mock_settings.openai_api_key = "sk-test"
        mock_fetch.return_value = "<html>content</html>"
        mock_report.return_value = "**Bold Section**\nDetails here"

        client = _get_client()
        _send_webhook(client, _order_created_body())

        email_html = mock_send.call_args[1]["html"]
        assert "<strong>Bold Section</strong>" in email_html
        assert "<br>" in email_html

    @patch("app.routers.webhook.send_email", return_value=True)
    @patch("app.routers.webhook._generate_report", new_callable=AsyncMock)
    @patch("app.routers.webhook._fetch_page_html", new_callable=AsyncMock)
    @patch("app.routers.webhook.settings")
    def test_fetch_failure_sends_error_report(
        self, mock_settings, mock_fetch, mock_report, mock_send
    ):
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        mock_settings.openai_api_key = "sk-test"
        mock_fetch.return_value = None  # fetch failed

        client = _get_client()
        resp = _send_webhook(client, _order_created_body())
        assert resp.status_code == 200

        # _generate_report should NOT be called since html is None
        mock_report.assert_not_called()

        # Email should still be sent with error message
        mock_send.assert_called_once()
        email_html = mock_send.call_args[1]["html"]
        assert "Could not fetch" in email_html

    @patch("app.routers.webhook.send_email", return_value=True)
    @patch("app.routers.webhook._generate_report", new_callable=AsyncMock)
    @patch("app.routers.webhook._fetch_page_html", new_callable=AsyncMock)
    @patch("app.routers.webhook.settings")
    def test_ai_error_sends_error_report(
        self, mock_settings, mock_fetch, mock_report, mock_send
    ):
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        mock_settings.openai_api_key = "sk-test"
        mock_fetch.return_value = "<html>ok</html>"
        mock_report.return_value = "Error generating report. Our team has been notified."

        client = _get_client()
        resp = _send_webhook(client, _order_created_body())
        assert resp.status_code == 200

        email_html = mock_send.call_args[1]["html"]
        assert "Error generating report" in email_html


# ---- _generate_report unit tests ------------------------------------------


class TestGenerateReport:
    def test_missing_api_key_returns_config_error(self):
        import asyncio
        from app.routers.webhook import _generate_report

        with patch("app.routers.webhook.settings") as mock_settings:
            mock_settings.openai_api_key = ""
            result = asyncio.get_event_loop().run_until_complete(
                _generate_report("https://x.com", "<html></html>")
            )
            assert result == "Error: Server configuration issue."

    def test_api_failure_returns_error_message(self):
        import asyncio
        from app.routers.webhook import _generate_report

        with patch("app.routers.webhook.settings") as mock_settings:
            mock_settings.openai_api_key = "sk-test"

            with patch("app.routers.webhook.httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=False)
                mock_client.post = AsyncMock(side_effect=httpx.HTTPError("timeout"))
                mock_client_cls.return_value = mock_client

                result = asyncio.get_event_loop().run_until_complete(
                    _generate_report("https://x.com", "<html></html>")
                )
                assert "Error generating report" in result

    def test_successful_report_returns_content(self):
        import asyncio
        from app.routers.webhook import _generate_report

        with patch("app.routers.webhook.settings") as mock_settings:
            mock_settings.openai_api_key = "sk-test"

            mock_response = MagicMock()
            mock_response.json.return_value = {
                "choices": [{"message": {"content": "Full report text here."}}]
            }
            mock_response.raise_for_status = MagicMock()

            with patch("app.routers.webhook.httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=False)
                mock_client.post = AsyncMock(return_value=mock_response)
                mock_client_cls.return_value = mock_client

                result = asyncio.get_event_loop().run_until_complete(
                    _generate_report("https://x.com", "<html></html>")
                )
                assert result == "Full report text here."


# ---- payload builders for subscription events --------------------------------


def _subscription_created_body(
    user_id: str = TEST_USER_ID,
    variant_id: str = "var_starter",
    subscription_id: str = "sub_123",
    customer_id: str = "cust_456",
    renews_at: str = "2026-05-01T00:00:00Z",
    portal_url: str = "https://app.lemonsqueezy.com/my-orders",
) -> dict:
    """Build a LemonSqueezy subscription_created webhook payload."""
    body = {
        "meta": {
            "event_name": "subscription_created",
            "custom_data": {"user_id": user_id},
        },
        "data": {
            "id": subscription_id,
            "attributes": {
                "variant_id": variant_id,
                "customer_id": customer_id,
                "status": "active",
                "renews_at": renews_at,
                "urls": {"customer_portal": portal_url},
            },
        },
    }
    return body


def _subscription_updated_body(
    subscription_id: str = "sub_123",
    variant_id: str = "var_starter",
    status: str = "active",
    renews_at: str = "2026-06-01T00:00:00Z",
    portal_url: str = "https://app.lemonsqueezy.com/my-orders",
) -> dict:
    """Build a LemonSqueezy subscription_updated webhook payload."""
    return {
        "meta": {"event_name": "subscription_updated"},
        "data": {
            "id": subscription_id,
            "attributes": {
                "variant_id": variant_id,
                "status": status,
                "renews_at": renews_at,
                "urls": {"customer_portal": portal_url},
            },
        },
    }


def _subscription_cancelled_body(
    subscription_id: str = "sub_123",
    ends_at: str = "2026-05-15T00:00:00Z",
) -> dict:
    """Build a LemonSqueezy subscription_cancelled webhook payload."""
    return {
        "meta": {"event_name": "subscription_cancelled"},
        "data": {
            "id": subscription_id,
            "attributes": {
                "status": "cancelled",
                "ends_at": ends_at,
            },
        },
    }


# ---- subscription_created tests -------------------------------------------


class TestSubscriptionCreated:
    @patch("app.routers.webhook.get_tier_for_variant", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_creates_subscription_sets_tier_and_credits(
        self, mock_settings, mock_tier
    ):
        """subscription_created sets plan_tier, LS IDs, resets credits."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(credits_used=5)
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_created_body()
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        assert user.plan_tier == "starter"
        assert user.lemon_subscription_id == "sub_123"
        assert user.lemon_customer_id == "cust_456"
        assert user.lemon_customer_portal_url == "https://app.lemonsqueezy.com/my-orders"
        assert user.credits_used == 0
        assert user.current_period_end is not None
        db.commit.assert_called_once()

    @patch("app.routers.webhook.get_tier_for_variant", return_value=None)
    @patch("app.routers.webhook.settings")
    def test_unknown_variant_returns_ok_no_changes(self, mock_settings, mock_tier):
        """Unknown variant_id returns ok without modifying user."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(plan_tier="free")
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_created_body(variant_id="var_unknown")
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.plan_tier == "free"  # unchanged
        db.commit.assert_not_called()

    @patch("app.routers.webhook.settings")
    def test_missing_custom_data_user_id_returns_ok(self, mock_settings):
        """Missing custom_data.user_id returns ok (no crash)."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        db = _mock_db_with_user(None)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = {
            "meta": {"event_name": "subscription_created", "custom_data": {}},
            "data": {"id": "sub_1", "attributes": {"variant_id": "var_s"}},
        }
        resp = _send_webhook(client, body)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    @patch("app.routers.webhook.settings")
    def test_null_custom_data_returns_ok(self, mock_settings):
        """Null custom_data (no user_id) returns ok without crash."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        db = _mock_db_with_user(None)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = {
            "meta": {"event_name": "subscription_created"},
            "data": {"id": "sub_1", "attributes": {"variant_id": "var_s"}},
        }
        resp = _send_webhook(client, body)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    @patch("app.routers.webhook.settings")
    def test_user_not_found_returns_ok(self, mock_settings):
        """User ID in custom_data not found in DB returns ok."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        db = _mock_db_with_user(None)  # no user found
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_created_body(user_id="nonexistent-uuid")
        resp = _send_webhook(client, body)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    @patch("app.routers.webhook.get_tier_for_variant", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_missing_data_attributes_returns_ok(self, mock_settings, mock_tier):
        """Missing data.attributes doesn't crash, returns ok."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user()
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = {
            "meta": {
                "event_name": "subscription_created",
                "custom_data": {"user_id": TEST_USER_ID},
            },
            "data": {"id": "sub_1"},  # no attributes
        }
        resp = _send_webhook(client, body)
        assert resp.status_code == 200


# ---- subscription_updated tests -------------------------------------------


class TestSubscriptionUpdated:
    @patch("app.routers.webhook.get_tier_for_variant", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_expired_downgrades_to_free(self, mock_settings, mock_tier):
        """Expired status downgrades user to free and clears LS fields."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="starter",
            lemon_subscription_id="sub_123",
            lemon_customer_id="cust_456",
            current_period_end=datetime(2026, 5, 1, tzinfo=timezone.utc),
            lemon_customer_portal_url="https://portal.example.com",
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_updated_body(status="expired")
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.plan_tier == "free"
        assert user.credits_used == 0
        assert user.lemon_subscription_id is None
        assert user.lemon_customer_id is None
        assert user.current_period_end is None
        assert user.lemon_customer_portal_url is None
        db.commit.assert_called_once()

    @patch("app.routers.webhook.get_tier_for_variant", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_renewal_resets_credits(self, mock_settings, mock_tier):
        """When renews_at differs from stored current_period_end, credits reset."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        old_period = datetime(2026, 5, 1, tzinfo=timezone.utc)
        user = _make_mock_user(
            plan_tier="starter",
            credits_used=8,
            lemon_subscription_id="sub_123",
            current_period_end=old_period,
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        # New renews_at differs from old
        body = _subscription_updated_body(renews_at="2026-06-01T00:00:00Z")
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.credits_used == 0
        assert user.current_period_end == datetime(2026, 6, 1, tzinfo=timezone.utc)
        db.commit.assert_called_once()

    @patch("app.routers.webhook.get_tier_for_variant", return_value="growth")
    @patch("app.routers.webhook.settings")
    def test_tier_change_updates_plan(self, mock_settings, mock_tier):
        """When variant changes, plan_tier is updated."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="starter",
            lemon_subscription_id="sub_123",
            current_period_end=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_updated_body(
            variant_id="var_growth",
            renews_at="2026-05-01T00:00:00Z",  # same period = no credit reset
        )
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.plan_tier == "growth"

    @patch("app.routers.webhook.settings")
    def test_user_not_found_by_subscription_id_returns_ok(self, mock_settings):
        """Unlinked subscription_id returns ok (no crash)."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        db = _mock_db_with_user(None)  # no user found
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_updated_body(subscription_id="sub_unknown")
        resp = _send_webhook(client, body)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    @patch("app.routers.webhook.get_tier_for_variant", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_missing_renews_at_no_credit_reset(self, mock_settings, mock_tier):
        """Missing renews_at doesn't reset credits or crash."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="starter",
            credits_used=5,
            lemon_subscription_id="sub_123",
            current_period_end=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_updated_body(renews_at=None)
        # Need to remove renews_at from attributes
        body["data"]["attributes"].pop("renews_at", None)
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.credits_used == 5  # not reset


# ---- subscription_cancelled tests -------------------------------------------


class TestSubscriptionCancelled:
    @patch("app.routers.webhook.settings")
    def test_cancelled_stores_ends_at_keeps_tier(self, mock_settings):
        """Cancellation sets current_period_end but keeps plan_tier."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="growth",
            lemon_subscription_id="sub_123",
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_cancelled_body(ends_at="2026-05-15T00:00:00Z")
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.plan_tier == "growth"  # NOT downgraded
        assert user.current_period_end == datetime(2026, 5, 15, tzinfo=timezone.utc)
        db.commit.assert_called_once()

    @patch("app.routers.webhook.settings")
    def test_null_ends_at_no_period_change(self, mock_settings):
        """Null ends_at doesn't change current_period_end."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        old_period = datetime(2026, 5, 1, tzinfo=timezone.utc)
        user = _make_mock_user(
            plan_tier="starter",
            lemon_subscription_id="sub_123",
            current_period_end=old_period,
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_cancelled_body()
        body["data"]["attributes"]["ends_at"] = None
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.current_period_end == old_period  # unchanged

    @patch("app.routers.webhook.settings")
    def test_user_not_found_returns_ok(self, mock_settings):
        """Unknown subscription_id on cancellation returns ok."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        db = _mock_db_with_user(None)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_cancelled_body(subscription_id="sub_ghost")
        resp = _send_webhook(client, body)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


# ---- ISO datetime parsing unit tests ----------------------------------------


class TestParseIsoDatetime:
    def test_valid_z_suffix(self):
        from app.routers.webhook import _parse_iso_datetime
        result = _parse_iso_datetime("2026-05-01T00:00:00Z")
        assert result == datetime(2026, 5, 1, tzinfo=timezone.utc)

    def test_valid_offset(self):
        from app.routers.webhook import _parse_iso_datetime
        result = _parse_iso_datetime("2026-05-01T12:00:00+00:00")
        assert result == datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)

    def test_none_returns_none(self):
        from app.routers.webhook import _parse_iso_datetime
        assert _parse_iso_datetime(None) is None

    def test_empty_string_returns_none(self):
        from app.routers.webhook import _parse_iso_datetime
        assert _parse_iso_datetime("") is None

    def test_garbage_string_returns_none(self):
        from app.routers.webhook import _parse_iso_datetime
        assert _parse_iso_datetime("not-a-date") is None


# ---- user resolution unit tests ----------------------------------------


class TestUserResolution:
    def test_resolve_by_custom_data_found(self):
        from app.routers.webhook import _resolve_user_by_custom_data
        user = _make_mock_user()
        db = _mock_db_with_user(user)
        body = {"meta": {"custom_data": {"user_id": TEST_USER_ID}}}
        result = _resolve_user_by_custom_data(body, db)
        assert result is user

    def test_resolve_by_custom_data_missing_user_id(self):
        from app.routers.webhook import _resolve_user_by_custom_data
        db = _mock_db_with_user(None)
        body = {"meta": {"custom_data": {}}}
        result = _resolve_user_by_custom_data(body, db)
        assert result is None

    def test_resolve_by_custom_data_no_custom_data_key(self):
        from app.routers.webhook import _resolve_user_by_custom_data
        db = _mock_db_with_user(None)
        body = {"meta": {}}
        result = _resolve_user_by_custom_data(body, db)
        assert result is None

    def test_resolve_by_custom_data_user_not_in_db(self):
        from app.routers.webhook import _resolve_user_by_custom_data
        db = _mock_db_with_user(None)
        body = {"meta": {"custom_data": {"user_id": "nonexistent"}}}
        result = _resolve_user_by_custom_data(body, db)
        assert result is None

    def test_resolve_by_subscription_id_found(self):
        from app.routers.webhook import _resolve_user_by_subscription_id
        user = _make_mock_user(lemon_subscription_id="sub_123")
        db = _mock_db_with_user(user)
        body = {"data": {"id": "sub_123"}}
        result = _resolve_user_by_subscription_id(body, db)
        assert result is user

    def test_resolve_by_subscription_id_not_found(self):
        from app.routers.webhook import _resolve_user_by_subscription_id
        db = _mock_db_with_user(None)
        body = {"data": {"id": "sub_unknown"}}
        result = _resolve_user_by_subscription_id(body, db)
        assert result is None

    def test_resolve_by_subscription_id_empty_body(self):
        from app.routers.webhook import _resolve_user_by_subscription_id
        db = _mock_db_with_user(None)
        body = {}
        result = _resolve_user_by_subscription_id(body, db)
        assert result is None


# ---- subscription_created idempotency test ----------------------------------


class TestSubscriptionCreatedIdempotent:
    @patch("app.routers.webhook.get_tier_for_variant", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_same_payload_twice_succeeds_and_state_stable(
        self, mock_settings, mock_tier
    ):
        """Sending the same subscription_created twice succeeds; user state stable."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(credits_used=5)
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_created_body()
        resp1 = _send_webhook(client, body)
        assert resp1.status_code == 200
        assert user.plan_tier == "starter"
        assert user.lemon_subscription_id == "sub_123"

        # Second call with same payload — should succeed and not crash
        db.commit.reset_mock()
        resp2 = _send_webhook(client, body)
        assert resp2.status_code == 200
        assert resp2.json() == {"ok": True}
        assert user.plan_tier == "starter"  # still starter
        assert user.credits_used == 0
        db.commit.assert_called_once()


# ---- subscription_updated additional edge cases ----------------------------


class TestSubscriptionUpdatedEdgeCases:
    @patch("app.routers.webhook.get_tier_for_variant", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_same_renews_at_no_credit_reset(self, mock_settings, mock_tier):
        """When renews_at matches stored current_period_end, credits are NOT reset."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        period = datetime(2026, 5, 1, tzinfo=timezone.utc)
        user = _make_mock_user(
            plan_tier="starter",
            credits_used=7,
            lemon_subscription_id="sub_123",
            current_period_end=period,
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        # renews_at = same as stored → no renewal detected
        body = _subscription_updated_body(renews_at="2026-05-01T00:00:00Z")
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.credits_used == 7  # NOT reset

    @patch("app.routers.webhook.get_tier_for_variant", return_value=None)
    @patch("app.routers.webhook.settings")
    def test_unknown_variant_on_update_keeps_tier(self, mock_settings, mock_tier):
        """Unknown variant during update doesn't change tier."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="growth",
            lemon_subscription_id="sub_123",
            current_period_end=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_updated_body(
            variant_id="var_unknown",
            renews_at="2026-05-01T00:00:00Z",  # same period
        )
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.plan_tier == "growth"  # unchanged

    @patch("app.routers.webhook.get_tier_for_variant", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_expired_with_credits_resets_to_zero(self, mock_settings, mock_tier):
        """Expired status resets credits_used to 0 alongside downgrade."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="pro",
            credits_used=42,
            lemon_subscription_id="sub_123",
            lemon_customer_id="cust_789",
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_updated_body(status="expired")
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.plan_tier == "free"
        assert user.credits_used == 0
        assert user.lemon_subscription_id is None
        assert user.lemon_customer_id is None

    @patch("app.routers.webhook.get_tier_for_variant", return_value="growth")
    @patch("app.routers.webhook.settings")
    def test_portal_url_updated_on_active(self, mock_settings, mock_tier):
        """Portal URL is updated from subscription_updated payload."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="growth",
            lemon_subscription_id="sub_123",
            lemon_customer_portal_url="https://old-portal.example.com",
            current_period_end=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_updated_body(
            portal_url="https://new-portal.example.com",
            renews_at="2026-05-01T00:00:00Z",
        )
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.lemon_customer_portal_url == "https://new-portal.example.com"


# ---- order_created enhanced tests (user resolution) -------------------------


class TestOrderCreatedEnhanced:
    @patch("app.routers.webhook.send_email", return_value=True)
    @patch("app.routers.webhook._generate_report", new_callable=AsyncMock)
    @patch("app.routers.webhook._fetch_page_html", new_callable=AsyncMock)
    @patch("app.routers.webhook.settings")
    def test_order_created_with_user_id_resolves_user(
        self, mock_settings, mock_fetch, mock_report, mock_send
    ):
        """order_created with custom_data.user_id resolves user for correlation."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        mock_settings.openai_api_key = "sk-test"
        mock_fetch.return_value = "<html>page</html>"
        mock_report.return_value = "Analysis report"

        user = _make_mock_user()
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = {
            "meta": {
                "event_name": "order_created",
                "custom_data": {"url": "https://example.com/lp", "user_id": TEST_USER_ID},
            },
            "data": {"attributes": {"user_email": "buyer@example.com"}},
        }
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        # DB was queried to resolve user
        db.query.assert_called()
        # Email still sent regardless of user resolution
        mock_send.assert_called_once()

    @patch("app.routers.webhook.send_email", return_value=True)
    @patch("app.routers.webhook._generate_report", new_callable=AsyncMock)
    @patch("app.routers.webhook._fetch_page_html", new_callable=AsyncMock)
    @patch("app.routers.webhook.settings")
    def test_order_created_without_user_id_still_sends_email(
        self, mock_settings, mock_fetch, mock_report, mock_send
    ):
        """order_created without user_id still sends report — backward compat."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        mock_settings.openai_api_key = "sk-test"
        mock_fetch.return_value = "<html>page</html>"
        mock_report.return_value = "Analysis report"

        db = _mock_db_with_user(None)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _order_created_body()  # no user_id in custom_data
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        # Email still sent even without user resolution
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["to"] == "buyer@example.com"

    @patch("app.routers.webhook.send_email", return_value=True)
    @patch("app.routers.webhook._generate_report", new_callable=AsyncMock)
    @patch("app.routers.webhook._fetch_page_html", new_callable=AsyncMock)
    @patch("app.routers.webhook.settings")
    def test_order_created_user_id_not_found_still_sends_email(
        self, mock_settings, mock_fetch, mock_report, mock_send
    ):
        """order_created with user_id not in DB still completes successfully."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        mock_settings.openai_api_key = "sk-test"
        mock_fetch.return_value = "<html>page</html>"
        mock_report.return_value = "Analysis report"

        db = _mock_db_with_user(None)  # user not found
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = {
            "meta": {
                "event_name": "order_created",
                "custom_data": {"url": "https://example.com/lp", "user_id": "nonexistent-uuid"},
            },
            "data": {"attributes": {"user_email": "buyer@example.com"}},
        }
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        mock_send.assert_called_once()


# ---- subscription_cancelled additional edge case ----------------------------


class TestSubscriptionCancelledEdgeCases:
    @patch("app.routers.webhook.settings")
    def test_cancelled_does_not_clear_ls_fields(self, mock_settings):
        """Cancellation preserves all LS fields (subscription_id, customer_id, etc.)."""
        mock_settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="pro",
            lemon_subscription_id="sub_123",
            lemon_customer_id="cust_456",
            lemon_customer_portal_url="https://portal.example.com",
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        body = _subscription_cancelled_body(ends_at="2026-06-01T00:00:00Z")
        resp = _send_webhook(client, body)

        assert resp.status_code == 200
        assert user.plan_tier == "pro"  # NOT downgraded
        assert user.lemon_subscription_id == "sub_123"  # preserved
        assert user.lemon_customer_id == "cust_456"  # preserved
        assert user.lemon_customer_portal_url == "https://portal.example.com"
        assert user.current_period_end == datetime(2026, 6, 1, tzinfo=timezone.utc)
