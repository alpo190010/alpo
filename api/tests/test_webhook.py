"""Tests for POST /webhook — Paddle Billing → store_subscriptions."""

from __future__ import annotations

import hashlib
import hmac as hmac_mod
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models import StoreSubscription

WEBHOOK_SECRET = "test-webhook-secret-123"
TEST_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
TEST_STORE = "example.com"
MONTHLY_PRICE_ID = "pri_monthly_001"
ANNUAL_PRICE_ID = "pri_annual_001"
MEMBERSHIP_PRICE_ID = "pri_membership_001"


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_subscription(
    user_id: str = TEST_USER_ID,
    store_domain: str = TEST_STORE,
    plan_tier: str = "insights",
    paddle_subscription_id: str | None = "sub_abc",
    current_period_end: datetime | None = None,
) -> StoreSubscription:
    sub = StoreSubscription()
    sub.id = uuid.uuid4()
    sub.user_id = user_id
    sub.store_domain = store_domain
    sub.plan_tier = plan_tier
    sub.paddle_subscription_id = paddle_subscription_id
    sub.paddle_customer_id = "ctm_xyz"
    sub.paddle_transaction_id = None
    sub.current_period_end = current_period_end or (
        datetime.now(timezone.utc) + timedelta(days=365)
    )
    sub.created_at = datetime.now(timezone.utc)
    sub.updated_at = datetime.now(timezone.utc)
    return sub


def _mock_db(*, existing_row: StoreSubscription | None = None) -> MagicMock:
    """Build a Session mock whose .query(...).filter(...).first() returns *existing_row*.

    Used both for the initial lookup in upsert and the subscription_id
    lookup in find_by_paddle_subscription_id.
    """
    db = MagicMock()
    chain = MagicMock()
    chain.filter.return_value.first.return_value = existing_row
    db.query.return_value = chain
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


def _custom_data(user_id: str | None, store_domain: str | None) -> dict:
    out: dict = {}
    if user_id is not None:
        out["user_id"] = user_id
    if store_domain is not None:
        out["store_domain"] = store_domain
    return out


def _subscription_event(
    event_type: str,
    *,
    subscription_id: str = "sub_abc",
    customer_id: str | None = "ctm_xyz",
    price_id: str | None = MONTHLY_PRICE_ID,
    user_id: str | None = TEST_USER_ID,
    store_domain: str | None = TEST_STORE,
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
    custom = _custom_data(user_id, store_domain)
    if custom:
        data["custom_data"] = custom
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


def _transaction_event(
    *,
    transaction_id: str = "txn_abc",
    customer_id: str | None = "ctm_xyz",
    price_id: str | None = MEMBERSHIP_PRICE_ID,
    user_id: str | None = TEST_USER_ID,
    store_domain: str | None = TEST_STORE,
    upgrade_from: str | None = None,
) -> dict:
    """Build a Paddle ``transaction.completed`` event payload."""
    data: dict = {
        "id": transaction_id,
        "status": "completed",
        "customer_id": customer_id,
    }
    if price_id is not None:
        data["items"] = [{"price": {"id": price_id}, "quantity": 1}]
    custom = _custom_data(user_id, store_domain)
    if upgrade_from is not None:
        custom["upgrade_from"] = upgrade_from
    if custom:
        data["custom_data"] = custom
    return {
        "event_id": "evt_txn_1",
        "event_type": "transaction.completed",
        "occurred_at": "2026-05-03T12:00:00Z",
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
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event(
                "subscription.created", user_id=None, store_domain=None
            ),
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
# transaction.completed (Insights / Fixes one-time purchase)
# ---------------------------------------------------------------------------


class TestTransactionCompleted:
    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.get_tier_for_price_id", return_value="insights")
    @patch("app.routers.webhook.settings")
    def test_insights_purchase_creates_subscription_row(
        self, mock_settings, mock_tier, mock_upsert
    ):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        before = datetime.now(timezone.utc)
        resp = _post_webhook(client, _transaction_event())
        after = datetime.now(timezone.utc)

        assert resp.status_code == 200
        mock_upsert.assert_called_once()
        kwargs = mock_upsert.call_args.kwargs
        assert kwargs["user_id"] == TEST_USER_ID
        assert kwargs["store_domain"] == TEST_STORE
        assert kwargs["plan_tier"] == "insights"
        assert kwargs["paddle_transaction_id"] == "txn_abc"
        assert kwargs["paddle_customer_id"] == "ctm_xyz"
        period_end = kwargs["current_period_end"]
        assert before + timedelta(days=365) <= period_end <= after + timedelta(days=365)

    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.get_tier_for_price_id", return_value="fixes")
    @patch("app.routers.webhook.settings")
    def test_fixes_purchase_creates_fixes_row(
        self, mock_settings, mock_tier, mock_upsert
    ):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(client, _transaction_event(price_id="pri_fixes_001"))
        assert resp.status_code == 200
        mock_upsert.assert_called_once()
        assert mock_upsert.call_args.kwargs["plan_tier"] == "fixes"

    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.get_tier_for_price_id", return_value=None)
    @patch("app.routers.webhook.settings")
    def test_unknown_price_does_not_create_row(
        self, mock_settings, mock_tier, mock_upsert
    ):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(client, _transaction_event(price_id="pri_unknown"))
        assert resp.status_code == 200
        mock_upsert.assert_not_called()

    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.settings")
    def test_missing_user_id_does_not_create_row(
        self, mock_settings, mock_upsert
    ):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(client, _transaction_event(user_id=None))
        assert resp.status_code == 200
        mock_upsert.assert_not_called()

    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.get_tier_for_price_id", return_value="fixes")
    @patch("app.routers.webhook.settings")
    def test_upgrade_from_insights_preserves_period_end(
        self, mock_settings, mock_tier, mock_upsert
    ):
        """custom_data.upgrade_from='insights' → upsert with preserve_period_end=True."""
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _transaction_event(
                price_id="pri_fixes_upgrade_001", upgrade_from="insights"
            ),
        )

        assert resp.status_code == 200
        mock_upsert.assert_called_once()
        kwargs = mock_upsert.call_args.kwargs
        assert kwargs["plan_tier"] == "fixes"
        assert kwargs["preserve_period_end"] is True

    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.get_tier_for_price_id", return_value="fixes")
    @patch("app.routers.webhook.settings")
    def test_full_purchase_does_not_preserve_period_end(
        self, mock_settings, mock_tier, mock_upsert
    ):
        """Without upgrade_from, preserve_period_end stays False (full new year)."""
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(client, _transaction_event(price_id="pri_fixes_001"))

        assert resp.status_code == 200
        mock_upsert.assert_called_once()
        kwargs = mock_upsert.call_args.kwargs
        assert kwargs["preserve_period_end"] is False

    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.settings")
    def test_missing_store_domain_does_not_create_row(
        self, mock_settings, mock_upsert
    ):
        """No store_domain → fail closed. Can't grant access without a binding."""
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(client, _transaction_event(store_domain=None))
        assert resp.status_code == 200
        mock_upsert.assert_not_called()

    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.get_tier_for_price_id", return_value="fixes")
    @patch("app.routers.webhook.settings")
    def test_store_domain_normalized_to_lowercase(
        self, mock_settings, mock_tier, mock_upsert
    ):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client, _transaction_event(store_domain=" Example.COM ")
        )
        assert resp.status_code == 200
        mock_upsert.assert_called_once()
        assert mock_upsert.call_args.kwargs["store_domain"] == "example.com"


# ---------------------------------------------------------------------------
# subscription.created
# ---------------------------------------------------------------------------


class TestSubscriptionCreated:
    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.get_tier_for_price_id", return_value="insights")
    @patch("app.routers.webhook.settings")
    def test_creates_subscription_row(
        self, mock_settings, mock_tier, mock_upsert
    ):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event("subscription.created", price_id=MONTHLY_PRICE_ID),
        )

        assert resp.status_code == 200
        mock_upsert.assert_called_once()
        kwargs = mock_upsert.call_args.kwargs
        assert kwargs["user_id"] == TEST_USER_ID
        assert kwargs["store_domain"] == TEST_STORE
        assert kwargs["plan_tier"] == "insights"
        assert kwargs["paddle_subscription_id"] == "sub_abc"
        assert kwargs["current_period_end"] == datetime(
            2026, 6, 1, tzinfo=timezone.utc
        )

    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.get_tier_for_price_id", return_value=None)
    @patch("app.routers.webhook.settings")
    def test_unknown_price_does_not_upsert(
        self, mock_settings, mock_tier, mock_upsert
    ):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event("subscription.created", price_id="pri_unknown"),
        )
        assert resp.status_code == 200
        mock_upsert.assert_not_called()

    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.settings")
    def test_missing_binding_returns_ok_without_upsert(
        self, mock_settings, mock_upsert
    ):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event(
                "subscription.created", user_id=None, store_domain=None
            ),
        )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        mock_upsert.assert_not_called()


# ---------------------------------------------------------------------------
# subscription.updated
# ---------------------------------------------------------------------------


class TestSubscriptionUpdated:
    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.find_by_paddle_subscription_id")
    @patch("app.routers.webhook.get_tier_for_price_id", return_value="fixes")
    @patch("app.routers.webhook.settings")
    def test_tier_change_upserts(
        self, mock_settings, mock_tier, mock_find, mock_upsert
    ):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        existing = _make_subscription(plan_tier="insights")
        mock_find.return_value = existing
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event(
                "subscription.updated", period_ends_at="2027-06-01T00:00:00Z"
            ),
        )
        assert resp.status_code == 200
        mock_upsert.assert_called_once()
        kwargs = mock_upsert.call_args.kwargs
        assert kwargs["plan_tier"] == "fixes"
        assert kwargs["current_period_end"] == datetime(
            2027, 6, 1, tzinfo=timezone.utc
        )

    @patch("app.routers.webhook.delete_subscription")
    @patch("app.routers.webhook.find_by_paddle_subscription_id")
    @patch("app.routers.webhook.settings")
    def test_status_canceled_deletes_row(
        self, mock_settings, mock_find, mock_delete
    ):
        """status="canceled" on subscription.updated → fully terminated → drop the gate row."""
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        existing = _make_subscription()
        mock_find.return_value = existing
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(
            client,
            _subscription_event("subscription.updated", status="canceled"),
        )
        assert resp.status_code == 200
        mock_delete.assert_called_once()
        # First positional arg is the row instance
        assert mock_delete.call_args.args[0] is existing

    @patch("app.routers.webhook.upsert_subscription")
    @patch("app.routers.webhook.find_by_paddle_subscription_id")
    @patch("app.routers.webhook.settings")
    def test_row_not_found_returns_ok(
        self, mock_settings, mock_find, mock_upsert
    ):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        mock_find.return_value = None
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(client, _subscription_event("subscription.updated"))
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        mock_upsert.assert_not_called()


# ---------------------------------------------------------------------------
# subscription.canceled (scheduled cancel — keep access until period_end)
# ---------------------------------------------------------------------------


class TestSubscriptionCanceled:
    @patch("app.routers.webhook.find_by_paddle_subscription_id")
    @patch("app.routers.webhook.settings")
    def test_extends_period_end_on_row(self, mock_settings, mock_find):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        existing = _make_subscription()
        mock_find.return_value = existing
        db = _mock_db()
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
        # Row's period_end should be set to the new value, NOT deleted.
        assert existing.current_period_end == datetime(
            2026, 5, 15, tzinfo=timezone.utc
        )
        db.commit.assert_called()

    @patch("app.routers.webhook.find_by_paddle_subscription_id")
    @patch("app.routers.webhook.settings")
    def test_row_not_found_returns_ok(self, mock_settings, mock_find):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        mock_find.return_value = None
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        resp = _post_webhook(client, _subscription_event("subscription.canceled"))
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# subscription.past_due (no state change)
# ---------------------------------------------------------------------------


class TestSubscriptionPastDue:
    @patch("app.routers.webhook.find_by_paddle_subscription_id")
    @patch("app.routers.webhook.settings")
    def test_past_due_is_no_op(self, mock_settings, mock_find):
        mock_settings.paddle_webhook_secret = WEBHOOK_SECRET
        existing = _make_subscription()
        mock_find.return_value = existing
        db = _mock_db()
        app.dependency_overrides[get_db] = _mock_db_factory(db)
        client = TestClient(app)

        original_period_end = existing.current_period_end
        resp = _post_webhook(
            client,
            _subscription_event("subscription.past_due", status="past_due"),
        )
        assert resp.status_code == 200
        assert existing.current_period_end == original_period_end


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
                "event_type": "address.updated",
                "data": {"id": "addr_123"},
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
