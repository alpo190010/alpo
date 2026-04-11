# Testing Patterns

**Analysis Date:** 2026-04-11

## Frontend Test Framework

**Runner:**
- Vitest 4.1.2
- Config: `webapp/vitest.config.ts`
- TypeScript support native

**Run Commands:**
```bash
npm test                          # Run all tests (vitest run)
npm test -- --watch              # Watch mode (vitest watch)
npm test -- --coverage           # Coverage report
```

**Assertion Library:**
- Vitest built-in `expect()` assertions
- No additional assertion library needed

## Frontend Test File Organization

**Location:**
- Co-located with source code in `__tests__/` subdirectory
- Pattern: `src/lib/analysis/__tests__/tier-gating.test.ts` alongside `src/lib/analysis/conversion-model.ts`

**Naming:**
- `*.test.ts` or `*.spec.ts` suffix
- Vitest config includes both patterns: `include: ["src/**/*.{test,spec}.ts"]`

**Current Tests:**
- `webapp/src/lib/analysis/__tests__/tier-gating.test.ts` — Tier gating rules validation
- `webapp/src/lib/analysis/__tests__/helpers.test.ts` — Analysis helper functions
- `webapp/src/lib/analysis/__tests__/conversion-model.test.ts` — Dollar loss calculations

## Frontend Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from "vitest";
import { getDimensionAccess } from "../conversion-model";

describe("getDimensionAccess", () => {
  describe("free plan", () => {
    it("returns locked for all 18 active dimensions", () => {
      // arrange
      for (const key of ALL_DIMENSION_KEYS) {
        // act
        const result = getDimensionAccess("free", key);
        // assert
        expect(result).toBe("locked");
      }
    });
  });
});
```

**Patterns:**
- Nested `describe()` blocks for related test groups (tier name, function name)
- Each test isolated; no shared state between `it()` blocks
- Arrange-Act-Assert (AAA) pattern implicit (no explicit comments)
- Heavy use of loops to test cartesian products (all tiers × all dimensions)

## Frontend Fixtures and Test Data

**Test Data Builders:**
```typescript
// From conversion-model.test.ts:10-18
function makeCategoryScores(defaultScore: number): CategoryScores {
  return {
    pageSpeed: defaultScore, images: defaultScore, socialProof: defaultScore,
    // ... all 18 dimensions
    contentFreshness: defaultScore,
  };
}
```

**Pattern:**
- Extracted helper function to build realistic test data
- Single parameter `defaultScore` creates uniform test fixture
- Specific overrides applied per-test: `categories.checkout = 10`
- Avoids hardcoding data in each test

## Backend Test Framework

**Runner:**
- pytest 8.0.0
- Config: `api/tests/conftest.py` for fixtures
- FastAPI TestClient for integration tests

**Run Commands:**
```bash
pytest                           # Run all tests
pytest tests/test_auth.py        # Run specific test file
pytest tests/test_auth.py::TestClassName::test_method_name  # Single test
pytest --cov=app                 # Coverage report
```

**Test Location:**
- Separate `api/tests/` directory (not co-located)
- Pattern: `tests/test_*.py` for each module being tested
- 20+ test files covering routers, services, and utilities

## Backend Test Structure

**Suite Organization:**
```python
"""Tests for JWT authentication dependencies."""

import pytest
from unittest.mock import MagicMock, patch

class TestGetCurrentUserOptional:
    """Test the optional auth dependency — must never raise."""
    
    @patch("app.auth.settings")
    def test_valid_jwt_known_user(self, mock_settings):
        """Valid JWT with UUID sub matching a user in DB → returns User."""
        # setup fixtures
        mock_settings.auth_secret = TEST_SECRET
        user = _make_user()
        
        # execute
        result = get_current_user_optional(request, db)
        
        # assert
        assert result == user
```

**Patterns:**
- Class-based test organization (TestClassName) for related tests
- Docstrings explain test condition and expected outcome
- `@patch` decorator for mocking config and dependencies
- Setup inside test method (no class-level fixtures for unit tests)

**Example: test_plans.py**
```python
def test_plan_tier_keys():
    """All expected tier keys are present and lowercase."""
    expected = {"free", "starter", "growth", "pro"}
    assert set(PLAN_TIERS.keys()) == expected
    for key in PLAN_TIERS:
        assert key == key.lower(), f"Tier key '{key}' is not lowercase"
```

## Backend Mocking

**Framework:** unittest.mock (Python stdlib)

**Mock Builders (conftest fixture pattern):**
```python
# From test_auth.py:21-36
def _make_user(
    google_sub: str = TEST_GOOGLE_SUB,
    user_id: uuid.UUID = TEST_USER_UUID,
    role: str = "user",
) -> User:
    """Build a User ORM instance without touching a real DB."""
    user = User()
    user.id = user_id
    user.google_sub = google_sub
    user.email = "test@example.com"
    user.name = "Test User"
    user.role = role
    user.created_at = datetime.now(timezone.utc)
    return user
```

**Mock Database Session:**
```python
# From test_auth.py:75-101
def _make_db_session(*filter_results: User | None) -> MagicMock:
    """Simulate a SQLAlchemy Session supporting sequential filter().first() calls.
    
    Each positional argument corresponds to the return value of one
    ``db.query(User).filter(...).first()`` call, in the order they happen.
    """
    session = MagicMock()
    query_mock = session.query.return_value
    
    if filter_results:
        filters = []
        for result in filter_results:
            f = MagicMock()
            f.first.return_value = result
            filters.append(f)
        query_mock.filter.side_effect = filters
    else:
        query_mock.filter.return_value.first.return_value = None
    
    return session
```

**Pattern:**
- Builder functions create ORM objects without DB access
- MagicMock chains complex SQLAlchemy patterns (`.query().filter().first()`)
- `side_effect` list simulates sequential method calls
- Default safe fallback when no filters expected

**What to Mock:**
- External services: OpenRouter API calls (see `analyze_competitors.py`)
- Database: Always mock `Session` with `MagicMock()`
- Configuration: Use `@patch("app.auth.settings")` to override env vars
- Email sending: Mock in auth tests, not called in test environment

**What NOT to Mock:**
- Core business logic: Test real `getDimensionAccess()`, `calculateConversionLoss()`
- Data transformation: Test real model instantiation
- Simple utilities: Test actual hash/verify functions

## Autouse Fixtures

**Rate Limiter Reset:**
```python
# From conftest.py:8-17
@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Reset slowapi rate-limit counters before every test.
    
    Without this, rate limits from one test can bleed into others since
    the in-memory storage is shared across the process.
    """
    limiter.reset()
    yield
    limiter.reset()
```

**Pattern:**
- `autouse=True` runs before every test without explicit request
- Prevents state leakage between tests
- Yields between setup and teardown for cleanup guarantee

## Test Patterns

**Comprehensive Validation Testing:**

Frontend example (tier-gating.test.ts):
```typescript
describe("getDimensionAccess", () => {
  describe("starter plan", () => {
    it("returns unlocked for the 7 starter dimensions", () => {
      for (const key of EXPECTED_STARTER_KEYS) {
        expect(getDimensionAccess("starter", key)).toBe("unlocked");
      }
    });

    it("returns locked for the other 11 dimensions", () => {
      const nonStarter = ALL_DIMENSION_KEYS.filter(k => !STARTER_DIMENSIONS.has(k));
      expect(nonStarter.length).toBe(11);
      for (const key of nonStarter) {
        expect(getDimensionAccess("starter", key)).toBe("locked");
      }
    });
  });
});
```

Pattern: Exhaustive testing of all plan/dimension combinations.

**Edge Case Testing:**

Backend example (conversion-model.test.ts:162-172):
```python
def test_all_scores_less_than_zero_clamped_to_zero():
    """All scores < 0 → clamps to 0, same result as score 0"""
    negative = calculateDollarLossPerThousand(makeCategoryScores(-50), 100, 'fashion')
    zero = calculateDollarLossPerThousand(makeCategoryScores(0), 100, 'fashion')
    expect(negative).toBe(zero)
    expect(negative).toBeGreaterThan(0)

def test_all_scores_greater_than_100_clamped_to_100():
    """All scores > 100 → clamps to 100, returns $0"""
    result = calculateDollarLossPerThousand(makeCategoryScores(150), 100, 'fashion')
    expect(result).toBe(0)
```

Pattern: Test boundary conditions, clamping, and fallbacks.

**Type Safety Testing:**

Example (helpers.test.ts:118-125):
```typescript
it("each card's revenue string contains '%' and not '$'", () => {
  const categories = makeCategoryScores(30);
  const cards = buildLeaks(categories, tips);
  for (const card of cards) {
    expect(card.revenue).toContain("%");
    expect(card.revenue).not.toContain("$");
  }
});
```

Pattern: Verify type and format properties match interface contracts.

## Test Coverage

**Current Status:**
- 3 frontend test files in `webapp/src/lib/analysis/__tests__/`
- 20+ backend test files in `api/tests/`
- Coverage focuses on:
  - **Frontend:** Analysis logic, tier gating, conversion loss calculation, dollar loss formulas
  - **Backend:** Auth, plans, entitlements, detectors, rate limiting, admin features

**Approach:**
- Critical business logic tested exhaustively (all combinations)
- Integration tests verify HTTP endpoints and database interactions
- Unit tests verify individual functions and classes
- No E2E tests detected (Playwright available but not in use)

**Recommended Coverage Gaps:**
- Frontend UI component rendering (no component tests found)
- Backend error handling edge cases
- Webhook signature validation

## Common Testing Patterns

**Async Testing (Frontend):**
```typescript
// From AuthModal.tsx testing approach (implicit from structure)
async function handleSignUp(e: React.FormEvent) {
  // async API call
  const res = await fetch(`${API_URL}/auth/signup`, { ... });
  // handle result
}
```

Pattern: No async/await in test helpers; tests expect promises handled by components.

**Async Testing (Backend):**
```python
# Not explicitly used; FastAPI TestClient is synchronous
# All tests are sync, even for async endpoints
def test_async_endpoint():
    response = client.get("/endpoint")
    assert response.status_code == 200
```

**Error Testing (Frontend):**
```typescript
it("returns locked for free plan", () => {
  expect(getDimensionAccess("free", "nonexistent")).toBe("locked");
});
```

Pattern: Test with invalid inputs; verify defensive fallback behavior.

**Error Testing (Backend):**
```python
def test_unknown_category_fallback():
    """unknown category 'nonexistent' falls back to 'other' benchmarks"""
    withUnknown = calculateDollarLossPerThousand(makeCategoryScores(50), 100, 'nonexistent')
    withOther = calculateDollarLossPerThousand(makeCategoryScores(50), 100, 'other')
    assert withUnknown == withOther
```

Pattern: Verify graceful degradation with unknown inputs.

---

*Testing analysis: 2026-04-11*
