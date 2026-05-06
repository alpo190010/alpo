"""Tests for /user/stores endpoints (list + delete)."""

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.auth import get_current_user_optional, get_current_user_required
from app.database import get_db
from app.main import app
from app.models import ProductAnalysis, Store, StoreAnalysis, StoreProduct, User


def _make_user() -> User:
    user = User()
    user.id = uuid.uuid4()
    user.google_sub = "google-sub-test"
    user.email = "test@example.com"
    user.name = "Test User"
    user.picture = None
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    return user


def _make_store_analysis(user_id, domain: str, score: int = 80, analyzed_at=None) -> MagicMock:
    analysis = MagicMock(spec=StoreAnalysis)
    analysis.id = uuid.uuid4()
    analysis.store_domain = domain
    analysis.user_id = user_id
    analysis.score = score
    analysis.updated_at = analyzed_at or datetime.now(timezone.utc)
    return analysis


def _make_product_analysis(user_id, domain: str, score: int = 65, analyzed_at=None) -> MagicMock:
    analysis = MagicMock(spec=ProductAnalysis)
    analysis.id = uuid.uuid4()
    analysis.store_domain = domain
    analysis.user_id = user_id
    analysis.score = score
    analysis.updated_at = analyzed_at or datetime.now(timezone.utc)
    return analysis


def _make_store(domain: str, name: str | None = None) -> MagicMock:
    store = MagicMock(spec=Store)
    store.domain = domain
    store.name = name
    return store


def _list_db(sa_rows=None, pa_rows=None) -> MagicMock:
    """Build a mock Session whose query() chain yields the configured rows for
    the two queries issued by ``list_user_stores``: one over StoreAnalysis,
    one over ProductAnalysis. The router distinguishes them by the first
    positional argument of ``db.query(...)``.
    """
    sa_rows = sa_rows or []
    pa_rows = pa_rows or []
    session = MagicMock()

    def query_side_effect(*models):
        # Router calls db.query(StoreAnalysis, Store) and db.query(ProductAnalysis, Store)
        chain = MagicMock()
        if models and models[0] is StoreAnalysis:
            chain.outerjoin.return_value.filter.return_value.all.return_value = sa_rows
        elif models and models[0] is ProductAnalysis:
            chain.outerjoin.return_value.filter.return_value.all.return_value = pa_rows
        else:
            chain.outerjoin.return_value.filter.return_value.all.return_value = []
        return chain

    session.query.side_effect = query_side_effect
    return session


class TestListUserStores:
    def test_no_auth_returns_401(self):
        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_optional] = lambda: None

        client = TestClient(app)
        resp = client.get("/user/stores")

        assert resp.status_code == 401
        app.dependency_overrides.clear()

    def test_empty_for_fresh_user(self):
        user = _make_user()
        db = _list_db()

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/stores")

        assert resp.status_code == 200
        data = resp.json()
        assert data == {"stores": []}

        app.dependency_overrides.clear()

    def test_lists_store_analyses(self):
        user = _make_user()
        sa = _make_store_analysis(user.id, "allbirds.com", score=82)
        store = _make_store("allbirds.com", name="Allbirds")

        db = _list_db(sa_rows=[(sa, store)])
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/stores")

        assert resp.status_code == 200
        data = resp.json()
        assert "quota" not in data
        assert "used" not in data
        assert data["stores"][0]["domain"] == "allbirds.com"
        assert data["stores"][0]["name"] == "Allbirds"
        assert data["stores"][0]["score"] == 82
        # New per-store fields default to free / deletable.
        assert data["stores"][0]["planTier"] == "free"
        assert data["stores"][0]["canDelete"] is True
        assert data["stores"][0]["currentPeriodEnd"] is None

        app.dependency_overrides.clear()

    def test_merges_product_only_domains(self):
        """A domain with only ProductAnalysis rows still shows up once."""
        user = _make_user()
        pa = _make_product_analysis(user.id, "warbyparker.com", score=71)

        db = _list_db(pa_rows=[(pa, None)])
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/stores")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["stores"]) == 1
        assert data["stores"][0]["domain"] == "warbyparker.com"
        assert data["stores"][0]["score"] == 71

        app.dependency_overrides.clear()

    def test_store_analysis_wins_over_product_analysis_for_same_domain(self):
        """StoreAnalysis carries richer metadata, so it overrides ProductAnalysis."""
        user = _make_user()
        domain = "example.com"
        pa = _make_product_analysis(user.id, domain, score=40)
        sa = _make_store_analysis(user.id, domain, score=88)
        store = _make_store(domain, name="Example Shop")

        db = _list_db(sa_rows=[(sa, store)], pa_rows=[(pa, store)])
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/stores")

        data = resp.json()
        assert len(data["stores"]) == 1
        assert data["stores"][0]["score"] == 88  # StoreAnalysis wins
        assert data["stores"][0]["name"] == "Example Shop"

        app.dependency_overrides.clear()

    def test_paid_store_marked_with_tier_and_canDelete_false(self):
        """Active subscription on a domain → planTier set, canDelete false."""
        user = _make_user()
        sa = _make_store_analysis(user.id, "paid.com", score=70)
        store = _make_store("paid.com", name="Paid Store")
        db = _list_db(sa_rows=[(sa, store)])

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        with patch(
            "app.routers.user_stores.list_paid_stores",
            return_value=[
                {
                    "domain": "paid.com",
                    "tier": "fixes",
                    "currentPeriodEnd": "2027-05-06T00:00:00+00:00",
                }
            ],
        ):
            client = TestClient(app)
            resp = client.get("/user/stores")

        data = resp.json()
        assert data["stores"][0]["planTier"] == "fixes"
        assert data["stores"][0]["canDelete"] is False
        assert data["stores"][0]["currentPeriodEnd"] == "2027-05-06T00:00:00+00:00"
        app.dependency_overrides.clear()


class TestDeleteUserStore:
    def test_no_auth_returns_401(self):
        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_optional] = lambda: None

        client = TestClient(app)
        resp = client.delete("/user/stores/example.com")

        assert resp.status_code == 401
        app.dependency_overrides.clear()

    def test_deletes_rows_for_caller(self):
        user = _make_user()
        db = MagicMock()
        # Both delete() calls return >0, emulating rows removed.
        db.query.return_value.filter.return_value.delete.return_value = 1

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.delete("/user/stores/allbirds.com")

        assert resp.status_code == 204
        # Commit was called after the deletes.
        db.commit.assert_called_once()
        app.dependency_overrides.clear()

    def test_returns_404_when_user_has_no_rows_for_domain(self):
        user = _make_user()
        db = MagicMock()
        db.query.return_value.filter.return_value.delete.return_value = 0

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.delete("/user/stores/missing.com")

        assert resp.status_code == 404
        db.commit.assert_not_called()
        app.dependency_overrides.clear()

    def test_empty_domain_returns_400(self):
        user = _make_user()
        db = MagicMock()
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        # Space-only domain trips the empty guard after .strip().
        resp = client.delete("/user/stores/%20")

        assert resp.status_code == 400
        app.dependency_overrides.clear()

    def test_cleans_global_store_when_last_user(self):
        """When no other user references the domain, the global Store row
        and its StoreProduct children are also deleted."""
        user = _make_user()
        store = MagicMock(spec=Store)
        store.id = uuid.uuid4()
        store.domain = "lonely.com"

        # Each model has a fresh chain whose terminal methods are all
        # pre-configured. The router's actual usage pattern dictates which
        # terminal is called; unused terminals are harmless.
        queried_models: list = []

        def query_side_effect(model):
            chain = MagicMock()
            if model is Store:
                # Used twice: first() to look up the row, then delete()
                # to drop it once StoreProduct children are gone.
                chain.filter.return_value.first.return_value = store
                chain.filter.return_value.delete.return_value = 1
            elif model is StoreProduct:
                chain.filter.return_value.delete.return_value = 3
            elif model in (StoreAnalysis, ProductAnalysis):
                # Per-user delete returns 1; global count returns 0
                # (no other user references the domain).
                chain.filter.return_value.delete.return_value = 1
                chain.filter.return_value.count.return_value = 0
            queried_models.append(model)
            return chain

        db = MagicMock()
        db.query.side_effect = query_side_effect

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.delete("/user/stores/lonely.com")

        assert resp.status_code == 204
        # All four model types were touched: per-user analyses + global cleanup.
        assert StoreAnalysis in queried_models
        assert ProductAnalysis in queried_models
        assert StoreProduct in queried_models
        assert Store in queried_models
        db.commit.assert_called_once()
        app.dependency_overrides.clear()

    def test_preserves_global_store_when_other_users_remain(self):
        """If another user still has analyses for the domain, the global
        Store row is preserved so that user's data keeps working."""
        user = _make_user()

        deleted_models: list = []
        # Store/StoreProduct should never be queried in this branch.
        forbidden_models: set = {Store, StoreProduct}

        def query_side_effect(model):
            chain = MagicMock()
            if model in forbidden_models:
                raise AssertionError(
                    f"Should not query {model.__name__} when other users "
                    "still reference the domain"
                )
            if model is StoreAnalysis:
                # User-scoped delete returns 1; global count returns 1
                # (representing another user still using this domain).
                chain.filter.return_value.delete.return_value = 1
                chain.filter.return_value.count.return_value = 1
            elif model is ProductAnalysis:
                chain.filter.return_value.delete.return_value = 1
                chain.filter.return_value.count.return_value = 0
            deleted_models.append(model)
            return chain

        db = MagicMock()
        db.query.side_effect = query_side_effect

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.delete("/user/stores/popular.com")

        assert resp.status_code == 204
        assert StoreAnalysis in deleted_models
        assert ProductAnalysis in deleted_models
        # Store and StoreProduct were never queried — the assertion in
        # query_side_effect would have raised if they were.
        db.commit.assert_called_once()
        app.dependency_overrides.clear()

    def test_skips_global_cleanup_when_store_row_missing(self):
        """If somehow the global Store row doesn't exist (e.g., user only
        had a ProductAnalysis from a one-off /analyze that bypassed
        /discover-products), per-user deletion still succeeds without
        crashing on a missing Store."""
        user = _make_user()

        def query_side_effect(model):
            chain = MagicMock()
            if model is Store:
                chain.filter.return_value.first.return_value = None
            elif model in (StoreAnalysis, ProductAnalysis):
                chain.filter.return_value.delete.return_value = 1
                chain.filter.return_value.count.return_value = 0
            elif model is StoreProduct:
                # Should not be reached since Store lookup returned None.
                raise AssertionError(
                    "StoreProduct should not be queried when Store is missing"
                )
            return chain

        db = MagicMock()
        db.query.side_effect = query_side_effect

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.delete("/user/stores/orphan.com")

        assert resp.status_code == 204
        db.commit.assert_called_once()
        app.dependency_overrides.clear()
