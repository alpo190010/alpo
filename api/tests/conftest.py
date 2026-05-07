"""Shared fixtures for all API tests."""

from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest

from app.rate_limit import limiter
from app.services.checkout_flow_simulator import FlowResult
from app.services.checkout_page_parser import unreached


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Reset slowapi rate-limit counters before every test.

    Without this, rate limits from one test can bleed into others since
    the in-memory storage is shared across the process.
    """
    limiter.reset()
    yield
    limiter.reset()


async def _mock_simulate_checkout_flow(*_args, **_kwargs) -> FlowResult:
    """Replacement for ``simulate_checkout_flow`` during unit tests.

    Returns an immediately-resolved ``unreached()`` result so tests
    don't attempt to launch Playwright/Chromium.
    """
    return FlowResult(
        signals=unreached("disabled_in_tests"),
        final_url=None,
        duration_ms=0,
        variant_id=None,
    )


@pytest.fixture(autouse=True)
def _default_is_shopify_to_true():
    """Default Shopify detection to ``True`` in tests.

    Existing test fixtures use stub HTML/hostnames that don't contain
    Shopify markers. Without this patch, the real ``is_shopify`` would
    classify them as non-Shopify and the orchestrator would skip the
    5 Shopify-specific dimensions — breaking tests that pre-date
    multi-platform support. Tests that intentionally exercise the
    non-Shopify path override the patch in their own scope.
    """
    with patch(
        "app.routers.analyze.is_shopify",
        new_callable=AsyncMock,
        return_value=True,
    ), patch(
        "app.routers.discover_products.is_shopify",
        new_callable=AsyncMock,
        return_value=True,
    ):
        yield


@pytest.fixture(autouse=True)
def _mock_checkout_flow_simulator():
    """Prevent the checkout flow simulator from launching Playwright during
    unit tests.

    The simulator is autouse-patched at both its module-level name and
    its router-level re-imports, because analyze.py and
    discover_products.py each have their own ``from ... import
    simulate_checkout_flow`` that resolves at import time.

    Integration tests that intentionally want the real simulator
    (``test_checkout_flow.py::test_live_allbirds_reaches_checkout``)
    call ``simulate_checkout_flow`` directly from the service module and
    bypass the router imports, so they aren't affected.
    """
    with patch(
        "app.routers.analyze.simulate_checkout_flow",
        side_effect=_mock_simulate_checkout_flow,
    ), patch(
        "app.routers.discover_products.simulate_checkout_flow",
        side_effect=_mock_simulate_checkout_flow,
    ):
        yield


# ---------------------------------------------------------------------------
# Per-store subscription stubs
# ---------------------------------------------------------------------------
#
# After the per-store-plans rewrite, every router that gates content (store,
# analyze, discover_products, fix, user_stores, user_plan, admin_users)
# resolves tier via ``store_subscriptions.get_effective_tier`` and friends.
# Most existing route tests are mocking the DB session at low level
# (``session.query.side_effect = [...]``) and don't expect the extra
# query that tier resolution would add.
#
# This autouse fixture stubs the per-store helpers across every router
# that imports them so tests default to "free / no paid plan / cannot
# delete blocked / cannot paginate". Tests that intentionally exercise
# paid behavior override the patch in their own scope.
def _tier_from_test_override(*_args, **_kwargs):
    """Resolve plan tier from the test's ``current_user`` dependency override.

    Many existing tests build a ``User`` instance with a chosen ``plan_tier``
    and inject it via ``app.dependency_overrides[get_current_user_*]``. The
    real ``get_effective_tier`` reads from ``store_subscriptions`` instead,
    which the tests don't populate. We bridge the two by returning the
    user's legacy ``plan_tier`` field when an override is in place. If none
    is in place, we fall back to ``"free"``.
    """
    try:
        from app.auth import get_current_user_optional, get_current_user_required
        from app.main import app
    except Exception:
        return "free"

    for dep in (get_current_user_required, get_current_user_optional):
        override = app.dependency_overrides.get(dep)
        if override is None:
            continue
        try:
            result = override()
            user = next(result) if hasattr(result, "__next__") else result
        except Exception:
            user = None
        if user is None:
            continue
        tier = getattr(user, "plan_tier", None)
        if tier:
            return tier
    return "free"


@pytest.fixture(autouse=True)
def _mock_store_subscription_lookups():
    """Bridge per-store tier lookups to legacy ``user.plan_tier`` in tests.

    Routes resolve tier via ``store_subscriptions.get_effective_tier``;
    tests mock the DB session at low level and don't populate that table.
    For backward-compat we look up the test's auth-overridden user and
    return its ``plan_tier`` field, defaulting to ``"free"``.
    """
    targets = [
        "app.routers.analyze.get_effective_tier",
        "app.routers.discover_products.get_effective_tier",
        "app.routers.store.get_effective_tier",
        "app.routers.fix.get_effective_tier",
        # ``can_paginate`` calls get_effective_tier through the entitlement
        # service's binding, so patch that too.
        "app.services.entitlement.get_effective_tier",
    ]
    paid_targets = [
        "app.routers.user_stores.list_paid_stores",
        "app.routers.user_plan.list_paid_stores",
        "app.routers.admin_users.list_paid_stores",
    ]
    has_active_targets = [
        "app.routers.user_stores.user_has_active_subscription_for",
    ]

    with ExitStack() as stack:
        for target in targets:
            stack.enter_context(
                patch(target, side_effect=_tier_from_test_override)
            )
        for target in paid_targets:
            try:
                stack.enter_context(patch(target, return_value=[]))
            except (AttributeError, ModuleNotFoundError):
                pass
        for target in has_active_targets:
            stack.enter_context(patch(target, return_value=False))
        yield
