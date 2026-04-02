"""Tests for the credit entitlement service (app.services.entitlement).

Uses the same MagicMock-for-db pattern established in test_user_scans.py.
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.models import User
from app.services.entitlement import (
    get_credits_limit,
    has_credits_remaining,
    increment_credits,
    maybe_reset_free_credits,
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
    # Nullable LemonSqueezy fields
    user.lemon_subscription_id = None
    user.lemon_customer_id = None
    user.current_period_end = None
    user.lemon_customer_portal_url = None
    return user


# -- get_credits_limit -------------------------------------------------------


class TestGetCreditsLimit:
    def test_all_tiers(self):
        """Each defined tier returns its configured credit limit."""
        assert get_credits_limit("free") == 3
        assert get_credits_limit("starter") == 10
        assert get_credits_limit("growth") == 30
        assert get_credits_limit("pro") == 100

    def test_unknown_tier_defaults_to_free(self):
        """An unrecognised tier string falls back to the free-tier limit."""
        assert get_credits_limit("nonexistent") == 3
        assert get_credits_limit("") == 3


# -- has_credits_remaining ---------------------------------------------------


class TestHasCreditsRemaining:
    def test_under_limit(self):
        """A user well below their limit has credits remaining."""
        user = _make_user(plan_tier="free", credits_used=0)
        assert has_credits_remaining(user) is True

    def test_at_limit(self):
        """A user exactly at the limit has NO credits remaining."""
        user = _make_user(plan_tier="free", credits_used=3)
        assert has_credits_remaining(user) is False

    def test_over_limit(self):
        """A user past the limit (edge case) has NO credits remaining."""
        user = _make_user(plan_tier="free", credits_used=5)
        assert has_credits_remaining(user) is False


# -- increment_credits -------------------------------------------------------


class TestIncrementCredits:
    def test_increments_and_commits(self):
        """credits_used increases by 1 and db.commit() is called."""
        user = _make_user(credits_used=0)
        db = MagicMock()

        increment_credits(user, db)

        assert user.credits_used == 1
        db.commit.assert_called_once()


# -- maybe_reset_free_credits -----------------------------------------------


class TestMaybeResetFreeCredits:
    def test_stale_free_credits_reset(self):
        """Free user with reset_at >30 days ago → credits zeroed, reset_at updated."""
        stale_date = datetime.now(timezone.utc) - timedelta(days=31)
        user = _make_user(plan_tier="free", credits_used=3, credits_reset_at=stale_date)
        db = MagicMock()

        maybe_reset_free_credits(user, db)

        assert user.credits_used == 0
        # credits_reset_at should be freshly set (within the last few seconds)
        assert user.credits_reset_at > datetime.now(timezone.utc) - timedelta(seconds=5)
        db.commit.assert_called_once()

    def test_recent_free_credits_not_reset(self):
        """Free user whose reset_at is only 5 days ago → no change."""
        recent_date = datetime.now(timezone.utc) - timedelta(days=5)
        user = _make_user(plan_tier="free", credits_used=2, credits_reset_at=recent_date)
        db = MagicMock()

        maybe_reset_free_credits(user, db)

        assert user.credits_used == 2  # unchanged
        db.commit.assert_not_called()

    def test_paid_tier_skipped(self):
        """Starter-tier user with stale date → no reset (paid tiers use webhooks)."""
        stale_date = datetime.now(timezone.utc) - timedelta(days=31)
        user = _make_user(plan_tier="starter", credits_used=10, credits_reset_at=stale_date)
        db = MagicMock()

        maybe_reset_free_credits(user, db)

        assert user.credits_used == 10  # unchanged
        db.commit.assert_not_called()
