"""Tests for the per-store subscription service.

Covers tier resolution (anonymous, missing row, expired row, active row)
and the upsert / lookup primitives the Paddle webhook calls.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.models import StoreSubscription
from app.services.store_subscriptions import (
    delete_subscription,
    find_by_paddle_subscription_id,
    get_active_subscription,
    get_effective_tier,
    get_paid_domains,
    list_paid_stores,
    upsert_subscription,
    user_has_active_subscription_for,
)


def _make_subscription(
    user_id=None,
    store_domain: str = "example.com",
    plan_tier: str = "fixes",
    current_period_end: datetime | None = None,
    paddle_subscription_id: str | None = None,
) -> StoreSubscription:
    sub = StoreSubscription()
    sub.id = uuid.uuid4()
    sub.user_id = user_id or uuid.uuid4()
    sub.store_domain = store_domain
    sub.plan_tier = plan_tier
    sub.paddle_subscription_id = paddle_subscription_id
    sub.paddle_customer_id = None
    sub.paddle_transaction_id = None
    sub.current_period_end = current_period_end or (
        datetime.now(timezone.utc) + timedelta(days=365)
    )
    sub.created_at = datetime.now(timezone.utc)
    sub.updated_at = datetime.now(timezone.utc)
    return sub


def _db_with_first(row) -> MagicMock:
    """Mock Session whose .query(...).filter(...).first() returns *row*."""
    db = MagicMock()
    chain = MagicMock()
    chain.filter.return_value.first.return_value = row
    db.query.return_value = chain
    return db


def _db_with_all(rows) -> MagicMock:
    db = MagicMock()
    chain = MagicMock()
    chain.filter.return_value.all.return_value = rows
    db.query.return_value = chain
    return db


# -- get_effective_tier ------------------------------------------------------


class TestGetEffectiveTier:
    def test_anonymous_returns_free(self):
        db = MagicMock()
        assert get_effective_tier(None, "example.com", db) == "free"
        db.query.assert_not_called()

    def test_missing_row_returns_free(self):
        db = _db_with_first(None)
        assert get_effective_tier(uuid.uuid4(), "example.com", db) == "free"

    def test_expired_row_returns_free(self):
        sub = _make_subscription(
            current_period_end=datetime.now(timezone.utc) - timedelta(days=1)
        )
        db = _db_with_first(sub)
        assert get_effective_tier(sub.user_id, sub.store_domain, db) == "free"

    def test_active_insights_returns_insights(self):
        sub = _make_subscription(plan_tier="insights")
        db = _db_with_first(sub)
        assert (
            get_effective_tier(sub.user_id, sub.store_domain, db) == "insights"
        )

    def test_active_fixes_returns_fixes(self):
        sub = _make_subscription(plan_tier="fixes")
        db = _db_with_first(sub)
        assert get_effective_tier(sub.user_id, sub.store_domain, db) == "fixes"

    def test_naive_datetime_treated_as_utc(self):
        # Defensive: legacy rows may have naive timestamps from the
        # backfill query. Ensure we treat them as UTC, not local.
        sub = _make_subscription(
            current_period_end=datetime.utcnow() + timedelta(days=10)
        )
        db = _db_with_first(sub)
        assert get_effective_tier(sub.user_id, sub.store_domain, db) == "fixes"

    def test_unknown_tier_string_returns_free(self):
        sub = _make_subscription(plan_tier="legacy_starter")
        db = _db_with_first(sub)
        assert get_effective_tier(sub.user_id, sub.store_domain, db) == "free"


# -- user_has_active_subscription_for ----------------------------------------


class TestUserHasActiveSubscriptionFor:
    def test_active_returns_true(self):
        sub = _make_subscription()
        db = _db_with_first(sub)
        assert user_has_active_subscription_for(
            sub.user_id, sub.store_domain, db
        )

    def test_expired_returns_false(self):
        sub = _make_subscription(
            current_period_end=datetime.now(timezone.utc) - timedelta(seconds=1)
        )
        db = _db_with_first(sub)
        assert not user_has_active_subscription_for(
            sub.user_id, sub.store_domain, db
        )

    def test_missing_returns_false(self):
        db = _db_with_first(None)
        assert not user_has_active_subscription_for(
            uuid.uuid4(), "example.com", db
        )

    def test_anonymous_returns_false(self):
        db = MagicMock()
        assert not user_has_active_subscription_for(None, "example.com", db)


# -- list_paid_stores / get_paid_domains -------------------------------------


class TestListPaidStores:
    def test_filters_expired_rows(self):
        active = _make_subscription(store_domain="active.com")
        expired = _make_subscription(
            store_domain="expired.com",
            current_period_end=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db = _db_with_all([active, expired])

        result = list_paid_stores(active.user_id, db)

        assert len(result) == 1
        assert result[0]["domain"] == "active.com"
        assert result[0]["tier"] == "fixes"
        assert result[0]["currentPeriodEnd"] is not None

    def test_returns_empty_for_user_with_no_rows(self):
        db = _db_with_all([])
        assert list_paid_stores(uuid.uuid4(), db) == []


class TestGetPaidDomains:
    def test_returns_only_active_domains(self):
        active = _make_subscription(store_domain="active.com")
        expired = _make_subscription(
            store_domain="expired.com",
            current_period_end=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db = _db_with_all([active, expired])

        domains = get_paid_domains(active.user_id, db)

        assert domains == {"active.com"}


# -- upsert_subscription -----------------------------------------------------


class TestUpsertSubscription:
    def test_creates_row_when_absent(self):
        db = _db_with_first(None)
        user_id = uuid.uuid4()
        period_end = datetime.now(timezone.utc) + timedelta(days=365)

        result = upsert_subscription(
            user_id=user_id,
            store_domain="new.com",
            plan_tier="fixes",
            current_period_end=period_end,
            paddle_transaction_id="txn_123",
            db=db,
        )

        db.add.assert_called_once()
        db.commit.assert_called_once()
        assert result.user_id == user_id
        assert result.store_domain == "new.com"
        assert result.plan_tier == "fixes"
        assert result.paddle_transaction_id == "txn_123"
        assert result.current_period_end == period_end

    def test_updates_existing_row_extends_period(self):
        existing = _make_subscription(plan_tier="insights")
        original_id = existing.id
        db = _db_with_first(existing)
        new_period_end = datetime.now(timezone.utc) + timedelta(days=730)

        result = upsert_subscription(
            user_id=existing.user_id,
            store_domain=existing.store_domain,
            plan_tier="fixes",
            current_period_end=new_period_end,
            db=db,
        )

        db.add.assert_not_called()
        db.commit.assert_called_once()
        assert result.id == original_id
        assert result.plan_tier == "fixes"
        assert result.current_period_end == new_period_end


# -- find_by_paddle_subscription_id ------------------------------------------


class TestFindByPaddleSubscriptionId:
    def test_returns_row_when_found(self):
        sub = _make_subscription(paddle_subscription_id="sub_abc")
        db = _db_with_first(sub)

        assert find_by_paddle_subscription_id("sub_abc", db) is sub

    def test_returns_none_for_empty_id(self):
        db = MagicMock()
        assert find_by_paddle_subscription_id("", db) is None
        db.query.assert_not_called()

    def test_returns_none_when_not_found(self):
        db = _db_with_first(None)
        assert find_by_paddle_subscription_id("sub_missing", db) is None


# -- delete_subscription -----------------------------------------------------


class TestDeleteSubscription:
    def test_deletes_and_commits(self):
        sub = _make_subscription()
        db = MagicMock()

        delete_subscription(sub, db)

        db.delete.assert_called_once_with(sub)
        db.commit.assert_called_once()


# -- get_active_subscription -------------------------------------------------


class TestGetActiveSubscription:
    def test_returns_row_when_active(self):
        sub = _make_subscription()
        db = _db_with_first(sub)
        assert get_active_subscription(sub.user_id, sub.store_domain, db) is sub

    def test_returns_none_when_expired(self):
        sub = _make_subscription(
            current_period_end=datetime.now(timezone.utc) - timedelta(seconds=1)
        )
        db = _db_with_first(sub)
        assert (
            get_active_subscription(sub.user_id, sub.store_domain, db) is None
        )

    def test_returns_none_for_anonymous(self):
        db = MagicMock()
        assert get_active_subscription(None, "example.com", db) is None
        db.query.assert_not_called()
