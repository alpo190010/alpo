"""Tests for the entitlement service (can_paginate / pagination_locked_response).

Per-store quota and credit functions were removed in the per-store-plans
migration; their behavior is now tested in test_store_subscriptions.py.
"""

import uuid
from unittest.mock import MagicMock, patch

from app.services.entitlement import can_paginate, pagination_locked_response


class TestCanPaginate:
    def test_anonymous_returns_false(self):
        db = MagicMock()
        assert can_paginate(None, "example.com", db) is False

    def test_missing_domain_returns_false(self):
        db = MagicMock()
        assert can_paginate(uuid.uuid4(), None, db) is False
        assert can_paginate(uuid.uuid4(), "", db) is False

    @patch("app.services.entitlement.get_effective_tier", return_value="free")
    def test_free_tier_returns_false(self, _mock):
        db = MagicMock()
        assert can_paginate(uuid.uuid4(), "example.com", db) is False

    @patch("app.services.entitlement.get_effective_tier", return_value="insights")
    def test_insights_tier_returns_true(self, _mock):
        db = MagicMock()
        assert can_paginate(uuid.uuid4(), "example.com", db) is True

    @patch("app.services.entitlement.get_effective_tier", return_value="fixes")
    def test_fixes_tier_returns_true(self, _mock):
        db = MagicMock()
        assert can_paginate(uuid.uuid4(), "example.com", db) is True


class TestPaginationLockedResponse:
    def test_default_uses_free_tier(self):
        body = pagination_locked_response()
        assert body["errorCode"] == "pagination_locked"
        assert body["planTier"] == "free"

    def test_passes_through_tier(self):
        body = pagination_locked_response("insights")
        assert body["planTier"] == "insights"
