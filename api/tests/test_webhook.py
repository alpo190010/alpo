"""Tests for POST /webhook — Paddle Billing."""

from __future__ import annotations

import hashlib
import hmac as hmac_mod
import json
import time
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app

WEBHOOK_SECRET = "test-webhook-secret-123"
TEST_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
MONTHLY_PRICE_ID = "pri_monthly_001"
ANNUAL_PRICE_ID = "pri_annual_001"


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_mock_user(**overrides):
    user = MagicMock()
    user.id = overrides.get("id", TEST_USER_ID)
    user.email = overrides.get("email", "user@example.com")
    user.plan_tier = overrides.get("plan_tier", "free")
    user.credits_used = overrides.get("credits_used", 0)
    user.credits_reset_at = overrides.get(
        "credits_reset_at", datetime.now(timezone.utc)
    )
    user.paddle_subscription_id = overrides.get("paddle_subscription_id", None)
    user.paddle_customer_id = overrides.get("paddle_customer_id", None)
    user.current_period_end = overrides.get("current_period_end", None)
    user.paddle_customer_portal_url = overrides.get(
        "paddle_customer_portal_url", None
    )
    return user


def _mock_db_with_user(user=None):
    db = MagicMock()
    query_mock = MagicMock()
    filter_mock = MagicMock()
    filter_mock.first.return_value = user
    query_mock.filter.return_value = filter_mock
    db.query.return_value = query_mock
    return db


def _mock_db_factory(db_instance):
    def override():
        yield db_instance
    return override


def _paddle_signature(
    raw_body: bytes, secret: str = WEBHOOK_SECRET, ts: int | None = None
) -> str:
    ts = ts if ts is not None else int(time.time())
    payload = f"{ts}:".encode("utf-8") + raw_body
    h1 = hmac_mod.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"ts={ts};h1={h1}"


def _post_webhook(client: TestClient, body: dict, *, signature: str | None = None):
    raw = json.dumps(body).encode("utf-8")
    sig = signature if signature is not None else _paddle_signature(raw)
    return client.post(
        "/webhook",
        content=raw,
        headers={"content-type": "application/json", "paddle-signature": sig},
    )


def _subscription_event(
    event_type: str,
    *,
    subscription_id: str = "sub_abc",
    customer_id: str | None = "ctm_xyz",
    price_id: str | None = MONTHLY_PRICE_ID,
    user_id: str | None = TEST_USER_ID,
    status: str = "active",
    period_ends_at: str | None = "2026-06-01T00:00:00Z",
) -> dict:
    data: dict = {
        "id": subscription_id,
        "status": status,
        "customer_id": customer_id,
    }
    if price_id is not None:
        data["items"] = [{"price": {"id": price_id}, "quantity": 1}]
    if user_id is not None:
        data["custom_data"] = {"user_id": user_id}
    if period_ends_at is not None:
        data["current_billing_period"] = {
            "starts_at": "2026-05-01T00:00:00Z",
            "ends_at": period_ends_at,
        }
    return {
        "event_id": "evt_1",
        "event_type": event_type,
        "occurred_at": "2026-05-01T12:00:00Z",
        "data": data,
    }


def _get_client():
    app.dependency_overrides[get_db] = lambda: iter([MagicMock()])
    return TestClient(app)


# ---------------------------------------------------------------------------
# Signature verification
# ---------------------------------------------------------------------------


class TestWebhookSignature:
    @patch("app.routers.webhook.settings")
    def test_valid_signature_returns_200(self, mock_settings):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db_with_user(None)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event("subscription.created", user_id=None),
        )
        assert resp.status_code == 200

    @patch("app.routers.webhook.settings")
    def test_invalid_h1_returns_401(self, mock_settings):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        client = _get_client()

        body = json.dumps({"event_type": "subscription.created"}).encode("utf-8")
        bad_sig = f"ts={int(time.time())};h1=deadbeef"
        resp = client.post(
            "/webhook",
            content=body,
            headers={"content-type": "application/json", "paddle-signature": bad_sig},
        )
        assert resp.status_code == 401

    @patch("app.routers.webhook.settings")
    def test_malformed_header_returns_401(self, mock_settings):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        client = _get_client()

        body = json.dumps({"event_type": "subscription.created"}).encode("utf-8")
        resp = client.post(
            "/webhook",
            content=body,
            headers={"content-type": "application/json", "paddle-signature": "garbage"},
        )
        assert resp.status_code == 401

    @patch("app.routers.webhook.settings")
    def test_missing_signature_returns_401(self, mock_settings):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        client = _get_client()

        body = json.dumps({"event_type": "subscription.created"}).encode("utf-8")
        resp = client.post(
            "/webhook",
            content=body,
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 401

    @patch("app.routers.webhook.settings")
    def test_unconfigured_secret_returns_500(self, mock_settings):
        mock_settings.paddle_webhook_secret = ""
        client = _get_client()

        body = json.dumps({"event_type": "subscription.created"}).encode("utf-8")
        resp = client.post(
            "/webhook",
            content=body,
            headers={"content-type": "application/json", "paddle-signature": "ts=1;h1=abc"},
        )
        assert resp.status_code == 500


# ---------------------------------------------------------------------------
# subscription.created
# ---------------------------------------------------------------------------


class TestSubscriptionCreated:
    @patch("app.routers.webhook.get_tier_for_price_id", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_monthly_price_activates_starter(self, mock_settings, mock_tier):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user()
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event("subscription.created", price_id=MONTHLY_PRICE_ID),
        )

        assert resp.status_code == 200
        assert user.plan_tier == "starter"
        assert user.paddle_subscription_id == "sub_abc"
        assert user.paddle_customer_id == "ctm_xyz"
        assert user.credits_used == 0
        assert user.current_period_end == datetime(2026, 6, 1, tzinfo=timezone.utc)
        db.commit.assert_called()

    @patch("app.routers.webhook.get_tier_for_price_id", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_annual_price_also_activates_starter(self, mock_settings, mock_tier):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user()
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event("subscription.created", price_id=ANNUAL_PRICE_ID),
        )
        assert resp.status_code == 200
        assert user.plan_tier == "starter"

    @patch("app.routers.webhook.get_tier_for_price_id", return_value=None)
    @patch("app.routers.webhook.settings")
    def test_unknown_price_leaves_tier_unchanged(self, mock_settings, mock_tier):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(plan_tier="free")
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event("subscription.created", price_id="pri_unknown"),
        )
        assert resp.status_code == 200
        assert user.plan_tier == "free"

    @patch("app.routers.webhook.settings")
    def test_missing_user_id_returns_ok(self, mock_settings):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db_with_user(None)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event("subscription.created", user_id=None),
        )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


# ---------------------------------------------------------------------------
# subscription.updated
# ---------------------------------------------------------------------------


class TestSubscriptionUpdated:
    @patch("app.routers.webhook.get_tier_for_price_id", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_tier_change_updates_plan(self, mock_settings, mock_tier):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="free",
            paddle_subscription_id="sub_abc",
            current_period_end=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event(
                "subscription.updated",
                period_ends_at="2026-05-01T00:00:00Z",
            ),
        )
        assert resp.status_code == 200
        assert user.plan_tier == "starter"

    @patch("app.routers.webhook.get_tier_for_price_id", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_renewal_resets_credits(self, mock_settings, mock_tier):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="starter",
            credits_used=12,
            paddle_subscription_id="sub_abc",
            current_period_end=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event(
                "subscription.updated",
                period_ends_at="2026-06-01T00:00:00Z",
            ),
        )
        assert resp.status_code == 200
        assert user.credits_used == 0
        assert user.current_period_end == datetime(2026, 6, 1, tzinfo=timezone.utc)

    @patch("app.routers.webhook.get_tier_for_price_id", return_value="starter")
    @patch("app.routers.webhook.settings")
    def test_status_canceled_downgrades_to_free(self, mock_settings, mock_tier):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="starter",
            credits_used=5,
            paddle_subscription_id="sub_abc",
            paddle_customer_id="ctm_xyz",
            current_period_end=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event("subscription.updated", status="canceled"),
        )
        assert resp.status_code == 200
        assert user.plan_tier == "free"
        assert user.credits_used == 0
        assert user.paddle_subscription_id is None
        assert user.paddle_customer_id is None
        assert user.current_period_end is None

    @patch("app.routers.webhook.settings")
    def test_user_not_found_by_sub_id_returns_ok(self, mock_settings):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db_with_user(None)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(client, _subscription_event("subscription.updated"))
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


# ---------------------------------------------------------------------------
# subscription.canceled (scheduled cancel)
# ---------------------------------------------------------------------------


class TestSubscriptionCanceled:
    @patch("app.routers.webhook.settings")
    def test_canceled_stores_period_end_keeps_tier(self, mock_settings):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="starter",
            paddle_subscription_id="sub_abc",
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event(
                "subscription.canceled",
                period_ends_at="2026-05-15T00:00:00Z",
                status="canceled",
            ),
        )
        assert resp.status_code == 200
        assert user.plan_tier == "starter"  # still active until period end
        assert user.current_period_end == datetime(2026, 5, 15, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# subscription.past_due
# ---------------------------------------------------------------------------


class TestSubscriptionPastDue:
    @patch("app.routers.webhook.settings")
    def test_past_due_preserves_tier(self, mock_settings):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        user = _make_mock_user(
            plan_tier="starter",
            paddle_subscription_id="sub_abc",
        )
        db = _mock_db_with_user(user)
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event("subscription.past_due", status="past_due"),
        )
        assert resp.status_code == 200
        assert user.plan_tier == "starter"


# ---------------------------------------------------------------------------
# Unknown event types
# ---------------------------------------------------------------------------


class TestUnknownEvents:
    @patch("app.routers.webhook.settings")
    def test_unknown_event_returns_ok(self, mock_settings):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        client = _get_client()

        resp = _post_webhook(
            client,
            {
                "event_id": "evt_1",
                "event_type": "transaction.completed",
                "data": {"id": "txn_123"},
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
