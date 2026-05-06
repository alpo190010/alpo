"""Tests for the shareable-link feature.

Covers:
  * the ``tier_meets`` helper truth table
  * token generator entropy
  * owner-scoped endpoints (list / create / revoke) — auth, ceiling, idempotency
  * public ``GET /share/{token}`` — 404/410/200 across the four error states,
    tier-gated payload shapes, view-count increment
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_optional, get_current_user_required
from app.database import get_db
from app.main import app
from app.models import StoreShare, User
from app.routers.shares import _generate_token
from app.services.store_subscriptions import tier_meets


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(user_id=None, plan_tier="free") -> User:
    user = User()
    user.id = user_id or uuid.uuid4()
    user.email = "test@example.com"
    user.name = "Test User"
    user.plan_tier = plan_tier
    user.role = "user"
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    return user


def _make_share(
    owner_user_id=None,
    store_domain="shop.io",
    share_tier="fixes",
    token=None,
    revoked_at=None,
    view_count=0,
):
    s = MagicMock(spec=StoreShare)
    s.id = uuid.uuid4()
    s.token = token or "tk_" + uuid.uuid4().hex
    s.owner_user_id = owner_user_id or uuid.uuid4()
    s.store_domain = store_domain
    s.share_tier = share_tier
    s.revoked_at = revoked_at
    s.view_count = view_count
    s.last_viewed_at = None
    s.created_at = datetime.now(timezone.utc)
    s.updated_at = datetime.now(timezone.utc)
    return s


def _make_store(domain="shop.io", name="Shop"):
    s = MagicMock()
    s.id = uuid.uuid4()
    s.domain = domain
    s.name = name
    s.product_count = 1
    s.updated_at = datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)
    s.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return s


def _make_store_analysis(checks=None):
    sa = MagicMock()
    sa.id = uuid.uuid4()
    sa.score = 75
    sa.categories = {"trustSignals": 80}
    sa.tips = {"trust": ["Add badges"]}
    sa.signals = {"ssl": True}
    sa.checks = checks or {
        "trust": [
            {
                "label": "Money-back guarantee visible",
                "detail": "Show guarantee near Add to Cart.",
                "remediation": "Add a guarantee line above ATC.",
                "code": "<div class='guarantee'>...</div>",
            }
        ]
    }
    sa.analyzed_url = "https://shop.io"
    sa.updated_at = datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)
    return sa


def _override_db(session):
    app.dependency_overrides[get_db] = lambda: session


def _override_user(user):
    app.dependency_overrides[get_current_user_required] = lambda: user
    app.dependency_overrides[get_current_user_optional] = lambda: user


def _clear_overrides():
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Service-layer tests
# ---------------------------------------------------------------------------


class TestTierMeets:
    @pytest.mark.parametrize(
        "current,required,expected",
        [
            ("free", "free", True),
            ("free", "insights", False),
            ("free", "fixes", False),
            ("insights", "free", True),
            ("insights", "insights", True),
            ("insights", "fixes", False),
            ("fixes", "free", True),
            ("fixes", "insights", True),
            ("fixes", "fixes", True),
            (None, "free", True),
            ("garbage", "insights", False),
        ],
    )
    def test_truth_table(self, current, required, expected):
        assert tier_meets(current, required) is expected


class TestTokenGeneration:
    def test_tokens_are_unique(self):
        tokens = {_generate_token() for _ in range(2_000)}
        assert len(tokens) == 2_000

    def test_token_has_useful_entropy(self):
        token = _generate_token()
        # ~32 base64url chars from 24 bytes
        assert 30 <= len(token) <= 44


# ---------------------------------------------------------------------------
# Owner-scoped endpoints
# ---------------------------------------------------------------------------


class TestListShares:
    def teardown_method(self):
        _clear_overrides()

    def test_requires_auth(self):
        _override_db(MagicMock())
        client = TestClient(app)
        # No user override → auth dep raises 401
        resp = client.get("/user/stores/shop.io/shares")
        assert resp.status_code == 401

    @patch("app.routers.shares.get_effective_tier", return_value="insights")
    def test_returns_caller_shares_with_owner_tier_and_expired_flag(self, _):
        user = _make_user()
        # Two shares: one matching the current tier, one above (lapsed).
        active = _make_share(
            owner_user_id=user.id, store_domain="shop.io", share_tier="insights"
        )
        lapsed = _make_share(
            owner_user_id=user.id, store_domain="shop.io", share_tier="fixes"
        )
        session = MagicMock()
        chain = MagicMock()
        chain.filter.return_value.order_by.return_value.all.return_value = [
            active,
            lapsed,
        ]
        session.query.return_value = chain

        _override_db(session)
        _override_user(user)
        resp = TestClient(app).get("/user/stores/shop.io/shares")

        assert resp.status_code == 200
        body = resp.json()
        assert body["ownerCurrentTier"] == "insights"
        assert len(body["shares"]) == 2
        by_tier = {s["shareTier"]: s for s in body["shares"]}
        assert by_tier["insights"]["isExpiredByOwnerTier"] is False
        assert by_tier["fixes"]["isExpiredByOwnerTier"] is True


class TestCreateShare:
    def teardown_method(self):
        _clear_overrides()

    def test_requires_auth(self):
        _override_db(MagicMock())
        resp = TestClient(app).post(
            "/user/stores/shop.io/shares", json={"shareTier": "free"}
        )
        assert resp.status_code == 401

    def test_invalid_tier_rejected(self):
        user = _make_user()
        _override_db(MagicMock())
        _override_user(user)
        resp = TestClient(app).post(
            "/user/stores/shop.io/shares", json={"shareTier": "platinum"}
        )
        assert resp.status_code == 400
        assert resp.json()["errorCode"] == "invalid_tier"

    @patch("app.routers.shares.get_effective_tier", return_value="insights")
    def test_above_ceiling_returns_403(self, _):
        user = _make_user()
        _override_db(MagicMock())
        _override_user(user)
        resp = TestClient(app).post(
            "/user/stores/shop.io/shares", json={"shareTier": "fixes"}
        )
        assert resp.status_code == 403
        body = resp.json()
        assert body["errorCode"] == "tier_above_ceiling"
        assert body["ownerCurrentTier"] == "insights"

    @patch("app.routers.shares.get_effective_tier", return_value="fixes")
    def test_at_ceiling_creates_row(self, _):
        user = _make_user()
        session = MagicMock()
        # Capture the StoreShare instance the route adds.
        added: list = []
        session.add.side_effect = lambda obj: added.append(obj)
        session.refresh.side_effect = lambda obj: None
        _override_db(session)
        _override_user(user)

        resp = TestClient(app).post(
            "/user/stores/shop.io/shares", json={"shareTier": "fixes"}
        )
        assert resp.status_code == 201
        share = resp.json()["share"]
        assert share["shareTier"] == "fixes"
        assert share["ownerCurrentTier"] == "fixes"
        assert share["isExpiredByOwnerTier"] is False
        assert added and added[0].store_domain == "shop.io"
        assert added[0].owner_user_id == user.id
        assert added[0].token  # populated
        assert session.commit.called

    @patch("app.routers.shares.get_effective_tier", return_value="free")
    def test_free_owner_can_create_free_share(self, _):
        user = _make_user()
        session = MagicMock()
        added: list = []
        session.add.side_effect = lambda obj: added.append(obj)
        _override_db(session)
        _override_user(user)
        resp = TestClient(app).post(
            "/user/stores/shop.io/shares", json={"shareTier": "free"}
        )
        assert resp.status_code == 201
        assert added[0].share_tier == "free"


class TestRevokeShare:
    def teardown_method(self):
        _clear_overrides()

    def test_requires_auth(self):
        _override_db(MagicMock())
        resp = TestClient(app).delete(
            f"/user/stores/shop.io/shares/{uuid.uuid4()}"
        )
        assert resp.status_code == 401

    def test_invalid_uuid_returns_404(self):
        user = _make_user()
        _override_db(MagicMock())
        _override_user(user)
        resp = TestClient(app).delete(
            "/user/stores/shop.io/shares/not-a-uuid"
        )
        assert resp.status_code == 404

    def test_other_users_share_returns_404(self):
        user = _make_user()
        session = MagicMock()
        chain = MagicMock()
        chain.filter.return_value.first.return_value = None
        session.query.return_value = chain
        _override_db(session)
        _override_user(user)
        resp = TestClient(app).delete(
            f"/user/stores/shop.io/shares/{uuid.uuid4()}"
        )
        assert resp.status_code == 404

    def test_first_revoke_sets_revoked_at_and_returns_204(self):
        user = _make_user()
        share = _make_share(owner_user_id=user.id, revoked_at=None)
        # MagicMock(spec=) doesn't allow attribute writes by default;
        # use a real object so we can observe the mutation.
        share = StoreShare(
            id=uuid.uuid4(),
            token="abc",
            owner_user_id=user.id,
            store_domain="shop.io",
            share_tier="fixes",
            revoked_at=None,
            view_count=0,
        )
        session = MagicMock()
        chain = MagicMock()
        chain.filter.return_value.first.return_value = share
        session.query.return_value = chain
        _override_db(session)
        _override_user(user)
        resp = TestClient(app).delete(
            f"/user/stores/shop.io/shares/{share.id}"
        )
        assert resp.status_code == 204
        assert share.revoked_at is not None
        assert session.commit.called

    def test_second_revoke_is_idempotent(self):
        user = _make_user()
        share = StoreShare(
            id=uuid.uuid4(),
            token="abc",
            owner_user_id=user.id,
            store_domain="shop.io",
            share_tier="fixes",
            revoked_at=datetime.now(timezone.utc) - timedelta(days=1),
            view_count=0,
        )
        original_revoked = share.revoked_at
        session = MagicMock()
        chain = MagicMock()
        chain.filter.return_value.first.return_value = share
        session.query.return_value = chain
        _override_db(session)
        _override_user(user)
        resp = TestClient(app).delete(
            f"/user/stores/shop.io/shares/{share.id}"
        )
        assert resp.status_code == 204
        # Idempotent: revoked_at not changed on second call.
        assert share.revoked_at == original_revoked


# ---------------------------------------------------------------------------
# Public endpoint
# ---------------------------------------------------------------------------


def _public_session_for(
    share=None,
    store=None,
    products=None,
    analyses=None,
    store_analysis=None,
):
    """Build a MagicMock session for the public ``GET /share/{token}`` flow.

    The route runs queries in this order: StoreShare → Store → StoreProduct
    → ProductAnalysis → StoreAnalysis. ``query.side_effect`` returns the
    corresponding chain for each call.
    """
    session = MagicMock()

    share_q = MagicMock()
    share_q.filter.return_value.first.return_value = share

    store_q = MagicMock()
    store_q.filter.return_value.first.return_value = store

    products_q = MagicMock()
    products_q.filter.return_value.order_by.return_value.limit.return_value.all.return_value = (
        products or []
    )

    analyses_q = MagicMock()
    analyses_q.filter.return_value.all.return_value = analyses or []

    store_analysis_q = MagicMock()
    store_analysis_q.filter.return_value.first.return_value = store_analysis

    session.query.side_effect = [
        share_q,
        store_q,
        products_q,
        analyses_q,
        store_analysis_q,
    ]
    return session


class TestPublicGetShare:
    def teardown_method(self):
        _clear_overrides()

    def test_unknown_token_returns_404_share_not_found(self):
        session = _public_session_for(share=None)
        _override_db(session)
        resp = TestClient(app).get("/share/does-not-exist")
        assert resp.status_code == 404
        assert resp.json()["errorCode"] == "share_not_found"

    def test_revoked_share_returns_410(self):
        share = _make_share(revoked_at=datetime.now(timezone.utc))
        session = MagicMock()
        chain = MagicMock()
        chain.filter.return_value.first.return_value = share
        session.query.return_value = chain
        _override_db(session)
        resp = TestClient(app).get(f"/share/{share.token}")
        assert resp.status_code == 410
        assert resp.json()["errorCode"] == "share_revoked"

    @patch("app.routers.shares.get_effective_tier", return_value="free")
    def test_tier_lapsed_returns_410(self, _):
        # Owner had Fixes when they minted the share but has since
        # lapsed to free. The Fixes share must 410.
        share = _make_share(share_tier="fixes")
        session = MagicMock()
        chain = MagicMock()
        chain.filter.return_value.first.return_value = share
        session.query.return_value = chain
        _override_db(session)
        resp = TestClient(app).get(f"/share/{share.token}")
        assert resp.status_code == 410
        body = resp.json()
        assert body["errorCode"] == "share_tier_lapsed"
        assert body["shareTier"] == "fixes"
        assert body["ownerCurrentTier"] == "free"

    def test_free_share_skips_tier_check(self):
        # Free share: even if owner tier resolution would say 'free',
        # we never call it (free is baseline). Use a regular MagicMock
        # session that allows arbitrary chained queries.
        share = _make_share(share_tier="free")
        store = _make_store()
        store_analysis = _make_store_analysis()
        session = _public_session_for(
            share=share,
            store=store,
            products=[],
            analyses=[],
            store_analysis=store_analysis,
        )
        _override_db(session)
        with patch(
            "app.routers.shares.get_effective_tier"
        ) as mock_tier:
            resp = TestClient(app).get(f"/share/{share.token}")
            mock_tier.assert_not_called()
        assert resp.status_code == 200
        body = resp.json()
        assert body["share"]["isShared"] is True
        assert body["share"]["shareTier"] == "free"
        # Free-tier share strips fix-only fields.
        check = body["storeAnalysis"]["checks"]["trust"][0]
        assert "code" not in check
        assert "remediation" not in check
        assert check["lockedFix"] is True
        assert body["storeAnalysis"]["detailsLocked"] is True
        assert body["storeAnalysis"]["recommendationsLocked"] is True

    @patch("app.routers.shares.get_effective_tier", return_value="fixes")
    def test_fixes_share_returns_full_payload(self, _):
        share = _make_share(share_tier="fixes")
        store = _make_store()
        store_analysis = _make_store_analysis()
        session = _public_session_for(
            share=share,
            store=store,
            products=[],
            analyses=[],
            store_analysis=store_analysis,
        )
        _override_db(session)
        resp = TestClient(app).get(f"/share/{share.token}")
        assert resp.status_code == 200
        body = resp.json()
        # Fixes share keeps fix-only fields.
        check = body["storeAnalysis"]["checks"]["trust"][0]
        assert "remediation" in check
        assert "code" in check
        assert body["storeAnalysis"]["detailsLocked"] is False
        assert body["storeAnalysis"]["recommendationsLocked"] is False

    @patch("app.routers.shares.get_effective_tier", return_value="insights")
    def test_insights_share_strips_fix_fields_only(self, _):
        share = _make_share(share_tier="insights")
        store = _make_store()
        store_analysis = _make_store_analysis()
        session = _public_session_for(
            share=share,
            store=store,
            products=[],
            analyses=[],
            store_analysis=store_analysis,
        )
        _override_db(session)
        resp = TestClient(app).get(f"/share/{share.token}")
        assert resp.status_code == 200
        body = resp.json()
        check = body["storeAnalysis"]["checks"]["trust"][0]
        assert "remediation" not in check
        assert "code" not in check
        assert check["lockedFix"] is True
        # Insights tier sees prose, just no fix code.
        assert body["storeAnalysis"]["detailsLocked"] is False
        assert body["storeAnalysis"]["recommendationsLocked"] is True

    def test_store_not_found_returns_404(self):
        share = _make_share(share_tier="free")
        session = _public_session_for(share=share, store=None)
        _override_db(session)
        resp = TestClient(app).get(f"/share/{share.token}")
        assert resp.status_code == 404
        assert resp.json()["errorCode"] == "store_not_found"

    def test_view_count_increments_on_success(self):
        # Use a real ORM instance so attribute writes stick.
        share = StoreShare(
            id=uuid.uuid4(),
            token="watch-me",
            owner_user_id=uuid.uuid4(),
            store_domain="shop.io",
            share_tier="free",
            revoked_at=None,
            view_count=4,
        )
        store = _make_store()
        store_analysis = _make_store_analysis()
        session = _public_session_for(
            share=share,
            store=store,
            products=[],
            analyses=[],
            store_analysis=store_analysis,
        )
        _override_db(session)
        resp = TestClient(app).get(f"/share/{share.token}")
        assert resp.status_code == 200
        assert share.view_count == 5
        assert share.last_viewed_at is not None
        assert session.commit.called

    def test_response_strips_owner_identifying_fields(self):
        share = _make_share(share_tier="free")
        store = _make_store()
        store_analysis = _make_store_analysis()
        session = _public_session_for(
            share=share,
            store=store,
            products=[],
            analyses=[],
            store_analysis=store_analysis,
        )
        _override_db(session)
        resp = TestClient(app).get(f"/share/{share.token}")
        body = resp.json()
        # No PII / cross-store leakage.
        flat = str(body)
        assert "email" not in flat
        assert "owner_user_id" not in flat
        assert "ownerUserId" not in flat
