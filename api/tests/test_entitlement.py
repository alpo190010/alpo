"""Tests for the credit entitlement service (app.services.entitlement)."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.models import ProductAnalysis, StoreAnalysis, User
from app.services.entitlement import (
    count_user_stores,
    get_credits_limit,
    has_credits_remaining,
    increment_credits,
    maybe_reset_free_credits,
    user_has_store_slot_for,
)


# -- Helpers ----------------------------------------------------------------


def _make_user(
    plan_tier: str = "free",
    credits_used: int = 0,
    credits_reset_at: datetime | None = None,
) -> User:
    """Build a User ORM instance with plan/credit fields set."""
    user = User()
    user.id = uuid.uuid4()
    user.google_sub = "test-sub"
    user.email = "test@example.com"
    user.name = "Test"
    user.picture = None
    user.plan_tier = plan_tier
    user.credits_used = credits_used
    user.credits_reset_at = credits_reset_at or datetime.now(timezone.utc)
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    user.paddle_subscription_id = None
    user.paddle_customer_id = None
    user.current_period_end = None
    user.paddle_customer_portal_url = None
    return user


# -- get_credits_limit -------------------------------------------------------


class TestGetCreditsLimit:
    def test_free_tier_is_three(self):
        assert get_credits_limit("free") == 3

    def test_starter_tier_is_unlimited(self):
        assert get_credits_limit("starter") is None

    def test_pro_tier_is_unlimited(self):
        assert get_credits_limit("pro") is None

    def test_unknown_tier_defaults_to_free(self):
        """An unrecognised tier string falls back to the free-tier limit."""
        assert get_credits_limit("nonexistent") == 3
        assert get_credits_limit("") == 3


# -- has_credits_remaining ---------------------------------------------------


class TestHasCreditsRemaining:
    def test_free_under_limit(self):
        user = _make_user(plan_tier="free", credits_used=0)
        assert has_credits_remaining(user) is True

    def test_free_at_limit(self):
        user = _make_user(plan_tier="free", credits_used=3)
        assert has_credits_remaining(user) is False

    def test_free_over_limit(self):
        user = _make_user(plan_tier="free", credits_used=5)
        assert has_credits_remaining(user) is False

    def test_starter_always_has_credits(self):
        """Unlimited tiers short-circuit to True regardless of credits_used."""
        user = _make_user(plan_tier="starter", credits_used=999)
        assert has_credits_remaining(user) is True

    def test_pro_always_has_credits(self):
        user = _make_user(plan_tier="pro", credits_used=9999)
        assert has_credits_remaining(user) is True


# -- increment_credits -------------------------------------------------------


class TestIncrementCredits:
    def test_increments_for_metered_tier(self):
        """Free tier: credits_used increases by 1 and db.commit() is called."""
        user = _make_user(plan_tier="free", credits_used=0)
        db = MagicMock()

        increment_credits(user, db)

        assert user.credits_used == 1
        db.commit.assert_called_once()

    def test_noop_for_unlimited_tier(self):
        """Starter/Pro: no increment, no commit (usage metering is pointless)."""
        user = _make_user(plan_tier="starter", credits_used=0)
        db = MagicMock()

        increment_credits(user, db)

        assert user.credits_used == 0
        db.commit.assert_not_called()


# -- maybe_reset_free_credits (calendar-month semantics) ---------------------


class TestMaybeResetFreeCredits:
    def test_reset_when_month_differs(self):
        """Free user with reset_at in a previous calendar month → credits zeroed."""
        # 45 days ago is safely in a previous calendar month regardless of today's date
        stale_date = datetime.now(timezone.utc) - timedelta(days=45)
        user = _make_user(plan_tier="free", credits_used=3, credits_reset_at=stale_date)
        db = MagicMock()

        maybe_reset_free_credits(user, db)

        assert user.credits_used == 0
        assert user.credits_reset_at > datetime.now(timezone.utc) - timedelta(seconds=5)
        db.commit.assert_called_once()

    def test_no_reset_same_calendar_month(self):
        """Free user whose reset_at is earlier in the same month → no change."""
        now = datetime.now(timezone.utc)
        same_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        user = _make_user(plan_tier="free", credits_used=2, credits_reset_at=same_month)
        db = MagicMock()

        maybe_reset_free_credits(user, db)

        assert user.credits_used == 2
        db.commit.assert_not_called()

    def test_paid_tier_skipped(self):
        """Starter-tier user with stale date → no reset (paid tiers use webhooks)."""
        stale_date = datetime.now(timezone.utc) - timedelta(days=45)
        user = _make_user(plan_tier="starter", credits_used=10, credits_reset_at=stale_date)
        db = MagicMock()

        maybe_reset_free_credits(user, db)

        assert user.credits_used == 10
        db.commit.assert_not_called()

    def test_resets_across_year_boundary(self):
        """(year, month) comparison catches year rollover, not just month number."""
        # One year ago to the day — same month number, different year
        now = datetime.now(timezone.utc)
        one_year_ago = now.replace(year=now.year - 1)
        user = _make_user(plan_tier="free", credits_used=3, credits_reset_at=one_year_ago)
        db = MagicMock()

        maybe_reset_free_credits(user, db)

        assert user.credits_used == 0
        db.commit.assert_called_once()


# -- Store quota helpers -----------------------------------------------------


def _quota_db(sa_domains: list[str], pa_domains: list[str]) -> MagicMock:
    """Build a mock Session for count_user_stores / user_has_store_slot_for.

    Returns the configured store_domain rows for StoreAnalysis.store_domain
    queries and ProductAnalysis.store_domain queries. Existence queries
    (``db.query(StoreAnalysis.id).filter(...).first()``) use `.first()`
    and are handled by the per-query chain.
    """
    session = MagicMock()
    calls: dict[str, list] = {
        "sa_domain_all": [(d,) for d in sa_domains],
        "pa_domain_all": [(d,) for d in pa_domains],
    }

    def query_side_effect(*cols):
        chain = MagicMock()
        col = cols[0] if cols else None
        # ``StoreAnalysis.store_domain`` / ``ProductAnalysis.store_domain``
        # queries are followed by .filter(...).all() (for count) or
        # .filter(...).first() (for existence).
        if col is StoreAnalysis.store_domain:
            chain.filter.return_value.all.return_value = calls["sa_domain_all"]
        elif col is ProductAnalysis.store_domain:
            chain.filter.return_value.all.return_value = calls["pa_domain_all"]
        elif col is StoreAnalysis.id:
            chain.filter.return_value.first.return_value = None
        elif col is ProductAnalysis.id:
            chain.filter.return_value.first.return_value = None
        else:
            chain.filter.return_value.all.return_value = []
            chain.filter.return_value.first.return_value = None
        return chain

    session.query.side_effect = query_side_effect
    return session


class TestCountUserStores:
    def test_counts_distinct_domains_across_both_tables(self):
        db = _quota_db(
            sa_domains=["allbirds.com", "warbyparker.com"],
            pa_domains=["allbirds.com", "glossier.com"],
        )
        # a, w, g → 3 distinct
        assert count_user_stores(uuid.uuid4(), db) == 3

    def test_empty_when_no_analyses(self):
        db = _quota_db(sa_domains=[], pa_domains=[])
        assert count_user_stores(uuid.uuid4(), db) == 0


class TestUserHasStoreSlotFor:
    def test_allows_when_below_quota(self):
        user = _make_user()
        user.store_quota = 3
        db = _quota_db(sa_domains=["existing.com"], pa_domains=[])
        assert user_has_store_slot_for(user, "new.com", db) is True

    def test_denies_when_at_quota_for_new_domain(self):
        user = _make_user()
        user.store_quota = 1
        db = _quota_db(sa_domains=["existing.com"], pa_domains=[])
        assert user_has_store_slot_for(user, "new.com", db) is False

    def test_allows_re_scan_even_at_quota(self):
        """Re-scanning an already-tracked domain never consumes a slot."""
        user = _make_user()
        user.store_quota = 1

        session = MagicMock()

        def query_side_effect(*cols):
            chain = MagicMock()
            if cols and cols[0] is StoreAnalysis.id:
                # Existence row found → allow immediately.
                chain.filter.return_value.first.return_value = MagicMock()
            else:
                chain.filter.return_value.first.return_value = None
                chain.filter.return_value.all.return_value = []
            return chain

        session.query.side_effect = query_side_effect
        assert user_has_store_slot_for(user, "existing.com", session) is True

    def test_defaults_to_one_when_store_quota_is_none(self):
        """Transient User() instances in tests may have store_quota=None."""
        user = _make_user()
        user.store_quota = None
        db = _quota_db(sa_domains=["existing.com"], pa_domains=[])
        assert user_has_store_slot_for(user, "new.com", db) is False
