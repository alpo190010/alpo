# Phase 3: Waitlist - Research

**Researched:** 2026-04-16
**Domain:** FastAPI backend endpoint + Alembic migration + Next.js client-side auth flow
**Confidence:** HIGH

## Summary

This phase is narrow, well-scoped, and almost entirely mechanical. All the infrastructure it depends on — the User model, Alembic migration pipeline, `get_current_user_required` auth dependency, `authFetch` utility, `PricingActions.tsx` client island with existing state stubs, and `AuthModal` with `callbackUrl` — are already in place and verified by reading the live source.

The backend work is three small, additive changes: (1) a new Alembic migration adding `pro_waitlist boolean DEFAULT false` to the `users` table, (2) a new `POST /user/waitlist` FastAPI router, and (3) two augmented responses (`GET /user/plan` and `GET /admin/analytics`). The `GET /admin/users` backend response is also extended, and the admin users frontend needs a "Waitlisted" badge and filter option. The frontend work is replacing the stub in `PricingActions.tsx` with a real `authFetch` call, reading `proWaitlist` from `/user/plan` on mount, and wiring the `?waitlist=1` query-param auto-enroll flow.

The `router.replace` + `useSearchParams` pattern for URL param cleanup already exists in `scan/[domain]/page.tsx` and can be applied directly in `PricingActions.tsx` after auto-enroll fires.

**Primary recommendation:** Implement in dependency order — migration first, then API endpoint, then `/user/plan` augmentation, then admin changes, then frontend wiring. No new libraries needed.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add `pro_waitlist` boolean column (default false) to the existing `users` table. No separate table.
- **D-02:** Alembic migration to add the column. No timestamp column — the boolean is sufficient.
- **D-03:** New `POST /user/waitlist` endpoint. Requires authentication (`get_current_user_required`). Sets `pro_waitlist = true` on the user record. Returns success.
- **D-04:** `GET /user/plan` response should include `proWaitlist` boolean so the frontend can check waitlist status on page load.
- **D-05:** Replace the `// Phase 3: replace with POST /user/waitlist` stub with an actual `authFetch` call to `POST /user/waitlist`.
- **D-06:** On page load, check waitlist status from the `/user/plan` response. If already waitlisted, show the confirmation message immediately — no "Join Waitlist" button.
- **D-07:** On return visits, the Pro card permanently shows "You're on the list! We'll let you know when Pro launches." instead of the Join button. Same message as initial confirmation.
- **D-08:** When an anonymous user clicks "Join Waitlist", the AuthModal `callbackUrl` includes `?waitlist=1` (e.g., `/pricing?waitlist=1`).
- **D-09:** After signup/signin, PricingActions detects the `waitlist=1` query param + authenticated session and automatically fires `POST /user/waitlist`. User sees confirmation without clicking again.
- **D-10:** Inline text swap in the button area — "You're on the list! We'll let you know when Pro launches." Already stubbed in PricingActions.tsx. No toast, no modal, no redirect.
- **D-11:** Confirmation is identical for first-time join and return visits. Single consistent message.
- **D-12:** Add `pro_waitlist` flag to the `GET /admin/users` response. Show a "Waitlisted" badge/filter in the admin users list.
- **D-13:** Add a `waitlistCount` field to the `GET /admin/analytics` response — simple `SELECT COUNT(*) FROM users WHERE pro_waitlist = true`.

### Claude's Discretion

- Error handling for the POST /user/waitlist endpoint (duplicate calls, edge cases)
- Whether to strip the `?waitlist=1` query param from the URL after auto-enrolling
- Exact admin badge styling and filter implementation
- Whether the results page credit exhaustion "Join Pro Waitlist" link should also check/show waitlist status, or just link to /pricing as-is

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WAIT-01 | Clicking Pro CTA prompts user to sign up if not authenticated | AuthModal already renders; just change `callbackUrl` to `/pricing?waitlist=1` (D-08). Auth gate logic (`isSignedIn` check) already in PricingActions.tsx. |
| WAIT-02 | System records in database which authenticated users clicked Pro (waitlist flag) | Requires Alembic migration (D-01/D-02) + `POST /user/waitlist` endpoint (D-03). SQLAlchemy pattern confirmed from existing endpoints. |
| WAIT-03 | User sees confirmation that they're on the Pro waitlist after clicking | `waitlistConfirmed` state and confirmation JSX already exist in PricingActions.tsx at line 47-49. Backend wiring + on-mount status check (D-05/D-06) complete this. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persist waitlist flag | API / Backend | Database | Business data — belongs in PostgreSQL via SQLAlchemy, never in browser storage |
| Auth gate for anonymous users | Frontend (Client) | — | PricingActions.tsx already owns this via `useSession`; modal handles redirect |
| Surface waitlist status on load | API / Backend | Frontend (Client) | `/user/plan` is the canonical user-state endpoint; frontend reads it on mount |
| Auto-enroll after signup | Frontend (Client) | API / Backend | Query param detected client-side; `authFetch` fires POST to backend |
| Admin visibility of waitlist | API / Backend | Frontend (Client) | Backend query + response augmentation; admin UI reads existing API contract |

---

## Standard Stack

All libraries used in this phase are already installed in the project. No new dependencies required.

### Core (Backend)
| Component | Version | Purpose | Source |
|-----------|---------|---------|--------|
| FastAPI | existing | New `POST /user/waitlist` router | [VERIFIED: api/app/routers/] |
| SQLAlchemy | existing | ORM update: `user.pro_waitlist = True` | [VERIFIED: api/app/models.py] |
| Alembic | existing | Migration `0011_add_pro_waitlist.py` | [VERIFIED: api/alembic/versions/] |
| `get_current_user_required` | existing | Auth dependency for new endpoint | [VERIFIED: api/app/auth.py, used in user_plan.py] |

### Core (Frontend)
| Component | Version | Purpose | Source |
|-----------|---------|---------|--------|
| `authFetch` | existing | Authenticated POST to `/user/waitlist` | [VERIFIED: webapp/src/lib/auth-fetch.ts] |
| `useSession` (next-auth) | existing | Auth state check in PricingActions | [VERIFIED: PricingActions.tsx line 27] |
| `useSearchParams` (next/navigation) | existing | Read `?waitlist=1` query param | [VERIFIED: used in scan/[domain]/page.tsx, verify-email, reset-password] |
| `useRouter` (next/navigation) | existing | `router.replace` to strip `?waitlist=1` after auto-enroll | [VERIFIED: scan/[domain]/page.tsx line 43] |

### No Alternatives to Consider
All decisions are locked. The phase uses existing infrastructure exclusively.

---

## Architecture Patterns

### System Architecture Diagram

```
Anonymous user clicks "Join Waitlist"
         |
         v
PricingActions.tsx (isSignedIn=false)
         |
         v
AuthModal opens with callbackUrl="/pricing?waitlist=1"
         |
    [user signs in / signs up]
         |
         v
Next.js router.push("/pricing?waitlist=1")
         |
         v
PricingActions.tsx mounts / session becomes active
         |
   [useSearchParams detects waitlist=1]
         |
         v
authFetch POST /user/waitlist
         |
         v
FastAPI: get_current_user_required + get_db
         |
         v
SQLAlchemy: user.pro_waitlist = True → db.commit()
         |
         v
200 OK
         |
         v
setWaitlistConfirmed(true) + router.replace("/pricing", {scroll:false})
         |
         v
"You're on the list! We'll let you know when Pro launches."


Authenticated user visits /pricing (return visit)
         |
         v
PricingActions.tsx mounts
         |
   useEffect: authFetch GET /user/plan
         |
         v
FastAPI /user/plan → { proWaitlist: true }
         |
         v
setWaitlistConfirmed(true) immediately on mount
         |
         v
Confirmation message shown — no button rendered
```

### Recommended File Structure (changes only)

```
api/
├── alembic/versions/
│   └── 0011_add_pro_waitlist.py       # new — boolean column migration
├── app/
│   ├── models.py                      # add pro_waitlist column to User
│   └── routers/
│       ├── user_waitlist.py           # new — POST /user/waitlist
│       ├── user_plan.py               # extend response with proWaitlist
│       ├── admin_users.py             # extend _user_to_dict with pro_waitlist
│       └── admin_analytics.py        # add waitlistCount aggregate
webapp/src/app/
├── pricing/_components/
│   └── PricingActions.tsx             # wire backend + query-param auto-enroll
└── admin/
    └── users/
        └── page.tsx                   # add Waitlisted badge + filter option
```

### Pattern 1: Alembic `add_column` Migration

The project uses sequential numeric IDs (`0001`–`0010`, plus one hash-based revision that is now part of the chain). The current head is `0010`. New migration ID is `0011`.

```python
# Source: api/alembic/versions/0006_add_role_column.py (verified pattern)
# File: 0011_add_pro_waitlist.py

revision: str = "0011"
down_revision: Union[str, None] = "0010"

def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "pro_waitlist",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

def downgrade() -> None:
    op.drop_column("users", "pro_waitlist")
```

Key detail: `server_default=sa.text("false")` ensures the column is NOT NULL and all existing rows default to false without a data migration. [VERIFIED: pattern from 0004, 0005, 0006 migrations which use server_default for boolean/text additions]

### Pattern 2: FastAPI Router for Waitlist

```python
# Source: api/app/routers/user_plan.py (verified pattern)
# File: api/app/routers/user_waitlist.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.auth import get_current_user_required
from app.database import get_db
from app.models import User

router = APIRouter()

@router.post("/user/waitlist", status_code=200)
def join_waitlist(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Record the authenticated user's Pro waitlist interest."""
    # Idempotent: safe to call multiple times
    if not current_user.pro_waitlist:
        current_user.pro_waitlist = True
        db.commit()
    return {"waitlisted": True}
```

Error handling (Claude's Discretion): make idempotent — duplicate calls from the auto-enroll flow (e.g., double-mount in React strict mode) must not 500 or raise. The `if not current_user.pro_waitlist` guard handles this. [VERIFIED: pattern consistent with auth_routes.py commit pattern]

### Pattern 3: Augmenting `/user/plan` Response

```python
# Source: api/app/routers/user_plan.py (verified — read in full)
# Add one line to the return dict:
return {
    "userId": str(current_user.id),
    "plan": current_user.plan_tier,
    # ... existing fields ...
    "proWaitlist": current_user.pro_waitlist,   # NEW
}
```

### Pattern 4: Frontend On-Mount Status Check

```typescript
// Source: PricingActions.tsx (verified — lines 26-79)
// Pattern: useEffect reading /user/plan on mount, conditional on tier + session

useEffect(() => {
  if (tier.key !== "pro-waitlist" || !isSignedIn) return;

  authFetch(`${API_URL}/user/plan`)
    .then((res) => res.ok ? res.json() : null)
    .then((data) => {
      if (data?.proWaitlist) setWaitlistConfirmed(true);
    })
    .catch(() => {/* silent — button still renders if fetch fails */});
}, [tier.key, isSignedIn]);
```

### Pattern 5: Query-Param Auto-Enroll

```typescript
// Source: scan/[domain]/page.tsx line 43 (verified router.replace pattern)
// Uses useSearchParams + useRouter, already used across the codebase

const searchParams = useSearchParams();
const router = useRouter();
const pathname = usePathname();

useEffect(() => {
  if (tier.key !== "pro-waitlist" || !isSignedIn) return;
  if (searchParams.get("waitlist") !== "1") return;

  // Auto-fire waitlist join, then clean the URL
  authFetch(`${API_URL}/user/waitlist`, { method: "POST" })
    .then((res) => {
      if (res.ok) {
        setWaitlistConfirmed(true);
        router.replace(pathname, { scroll: false });
      }
    })
    .catch(() => {/* no-op — user can click button manually */});
}, [isSignedIn, searchParams, pathname, router, tier.key]);
```

URL cleanup: `router.replace(pathname, { scroll: false })` strips `?waitlist=1` without a page reload. [VERIFIED: identical pattern at scan/[domain]/page.tsx line 43]

### Pattern 6: Admin `waitlistCount` Aggregate

```python
# Source: admin_analytics.py (verified — read in full)
# Add one query to get_analytics():

waitlist_count = (
    db.query(func.count(User.id))
    .filter(User.pro_waitlist == True)
    .scalar()
) or 0

return {
    # ... existing fields ...
    "waitlistCount": waitlist_count,
}
```

### Pattern 7: Admin Users — `_user_to_dict` Extension

```python
# Source: admin_users.py line 45-57 (verified)
# Add to _user_to_dict:
def _user_to_dict(user: User) -> dict:
    return {
        # ... existing fields ...
        "pro_waitlist": user.pro_waitlist,   # NEW
    }
```

Frontend: add `pro_waitlist: boolean` to the `AdminUser` interface. Add a "Waitlisted" column/badge using existing `<Badge>` component (inline style pattern from `planBadgeStyle`). Add a `waitlisted` option to the filter `<Select>` — maps to `?pro_waitlist=true` query param. The backend `list_users` endpoint needs a corresponding `pro_waitlist: Optional[bool]` query param and `.filter(User.pro_waitlist == True)` when set. [VERIFIED: admin_users.py filter pattern lines 101-105]

### Anti-Patterns to Avoid

- **Don't read `proWaitlist` from the PricingPage server component and pass as a prop.** The pricing page is a public server component with no auth context. The status check must happen client-side in PricingActions via `authFetch`. [VERIFIED: pricing/page.tsx has no session/auth imports]
- **Don't fire the auto-enroll POST on every render.** Wrap in `useEffect` with `[isSignedIn, searchParams]` dependencies and a `?waitlist=1` guard. Without the guard, signing in for any reason on the pricing page would enroll the user.
- **Don't make `POST /user/waitlist` raise 409 on duplicate calls.** The auto-enroll can fire on strict-mode double-mount. Idempotent behavior (check then set) is correct.
- **Don't run the migration without a `server_default`.** `pro_waitlist` must be NOT NULL to match the SQLAlchemy model column. Adding a nullable column and backfilling would require a multi-step migration.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authenticated API calls | Custom fetch with manual token | `authFetch` | Token caching, 401 invalidation, 30s timeout already handled |
| Auth gate in UI | Custom session checks | `useSession` from next-auth | Session state, loading state, and reactivity handled |
| URL param detection | Manual `window.location.search` | `useSearchParams` from next/navigation | SSR-safe, reactive to navigation events |
| DB boolean column default | Manual UPDATE backfill | `server_default=sa.text("false")` in migration | Atomic, handles existing rows, no separate backfill step |

---

## Common Pitfalls

### Pitfall 1: `PricingActions` is a Client Component wrapped in a Server Component

**What goes wrong:** The pricing page (`page.tsx`) is a server component. It renders `<PricingActions>` as a client island. If you try to pass `proWaitlist` as a server-fetched prop, you'd need to make the pricing page call the API during SSR, requiring session cookies — which adds complexity and is out of scope.

**Why it happens:** Next.js App Router blurs the server/client boundary.

**How to avoid:** Keep all waitlist-status logic inside `PricingActions.tsx` (already a `"use client"` component). Fetch `/user/plan` client-side on mount. The server component remains stateless and public.

**Warning signs:** If you add `import { getServerSession }` or `cookies()` to `pricing/page.tsx`, you're in the wrong tier.

### Pitfall 2: React Strict Mode Double-Invocation

**What goes wrong:** In development, React Strict Mode mounts components twice. The `useEffect` auto-enroll fires twice, potentially sending two `POST /user/waitlist` requests before the first responds.

**Why it happens:** Strict Mode intentionally double-invokes effects to surface side-effect bugs.

**How to avoid:** Make `POST /user/waitlist` idempotent (already covered in Pattern 2). The second call is harmless: `if not current_user.pro_waitlist` is false on the second call, no commit issued.

### Pitfall 3: `useSearchParams` Requires Suspense Boundary in Next.js App Router

**What goes wrong:** In Next.js 13+ App Router, `useSearchParams()` in a client component can cause build warnings or errors unless the component is wrapped in a `<Suspense>` boundary (or the page itself uses `export const dynamic = 'force-dynamic'`).

**Why it happens:** `useSearchParams` opts the page into dynamic rendering. Next.js requires the component to be wrapped in Suspense to allow static generation of the rest of the page.

**How to avoid:** Wrap `<PricingActions>` in a `<Suspense fallback={null}>` in `pricing/page.tsx`. This is a one-line change and the existing `PricingActions` dynamic import already uses `ssr: false` for `AuthModal` — adding Suspense is consistent with the existing pattern. Alternatively, use `useSearchParams` directly and let Next.js handle the dynamic boundary (it will emit a warning but not fail production builds). [VERIFIED: other pages using useSearchParams — verify-email, reset-password — are client-only pages that don't hit this issue at the page-level boundary]

**Warning signs:** Build output includes "useSearchParams() should be wrapped in a suspense boundary at page /pricing".

### Pitfall 4: Migration Head Mismatch

**What goes wrong:** If `down_revision` is set to the wrong value, `alembic upgrade head` will either fail or create a branch (two heads), breaking future migrations.

**Why it happens:** The migration chain has one non-sequential revision (`a335b2dc6b17`) that is part of the main chain via `0008`'s `down_revision`. The current verified head is `0010`.

**How to avoid:** Set `down_revision = "0010"` in the new migration. Verify with `alembic heads` (returns `0010 (head)`) before running. [VERIFIED: `alembic heads` output confirmed `0010 (head)`]

### Pitfall 5: Router Registration

**What goes wrong:** New FastAPI router is created but not registered in the app factory/main.py.

**Why it happens:** FastAPI requires explicit `app.include_router()` calls.

**How to avoid:** After creating `user_waitlist.py`, verify registration in `api/app/main.py` (check how `user_plan` router is registered and replicate the pattern).

---

## Code Examples

### Complete `PricingActions.tsx` Logic (post-phase)

```typescript
// Source: PricingActions.tsx (verified existing structure)
// Three effects are needed:
// 1. On-mount: check /user/plan for existing waitlist status
// 2. On-mount: detect ?waitlist=1 + authenticated → auto-enroll
// 3. Button click: fire POST /user/waitlist for first-time authenticated join

// Effect 1 — on-mount status check
useEffect(() => {
  if (tier.key !== "pro-waitlist" || !isSignedIn) return;
  authFetch(`${API_URL}/user/plan`)
    .then((r) => r.ok ? r.json() : null)
    .then((d) => { if (d?.proWaitlist) setWaitlistConfirmed(true); })
    .catch(() => {});
}, [tier.key, isSignedIn]);

// Effect 2 — auto-enroll from ?waitlist=1 after signup redirect
useEffect(() => {
  if (tier.key !== "pro-waitlist" || !isSignedIn) return;
  if (searchParams.get("waitlist") !== "1") return;
  authFetch(`${API_URL}/user/waitlist`, { method: "POST" })
    .then((r) => {
      if (r.ok) {
        setWaitlistConfirmed(true);
        router.replace(pathname, { scroll: false });
      }
    })
    .catch(() => {});
}, [isSignedIn, searchParams, pathname, router, tier.key]);

// Button onClick (existing, replace stub)
onClick={() => {
  if (!isSignedIn) {
    setAuthModalOpen(true);
    return;
  }
  authFetch(`${API_URL}/user/waitlist`, { method: "POST" })
    .then((r) => { if (r.ok) setWaitlistConfirmed(true); })
    .catch(() => {});
}}
```

### Admin Users — Waitlist Filter (backend)

```python
# Source: admin_users.py list_users (verified pattern lines 101-105)
@router.get("/admin/users")
def list_users(
    # ... existing params ...
    pro_waitlist: Optional[bool] = None,   # NEW
    # ...
):
    if pro_waitlist is not None:
        query = query.filter(User.pro_waitlist == pro_waitlist)
```

### Admin Analytics — `waitlistCount`

```python
# Source: admin_analytics.py (verified structure)
waitlist_count = (
    db.query(func.count(User.id))
    .filter(User.pro_waitlist == True)
    .scalar()
) or 0
# Add to return dict: "waitlistCount": waitlist_count
```

---

## State of the Art

| Area | Approach Used Here | Note |
|------|--------------------|------|
| Waitlist storage | Boolean flag on user row | Simple and sufficient. No timestamp needed per D-02. |
| Auto-enroll | Query param + client-side detection | Standard pattern for post-auth redirects in Next.js. Avoids server-side session complexity. |
| Idempotency | Guard in endpoint (`if not current_user.pro_waitlist`) | Simpler than 409 handling; correct for this use case. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `POST /user/waitlist` router must be registered in `main.py` using `app.include_router()` | Architecture Patterns / Pitfall 5 | Router never mounts; endpoint 404s. Verify main.py during implementation. |
| A2 | Wrapping `PricingActions` in `<Suspense>` is needed for `useSearchParams` | Pitfall 3 | Build warning but not a production failure — low risk, easy fix. |

**All other claims were verified by reading the live codebase.**

---

## Open Questions

1. **Should the `results page` credit-exhaustion "Join Pro Waitlist" link also check/show waitlist status?**
   - What we know: That link currently navigates to `/pricing` as-is.
   - What's unclear: Whether to replace it with a direct waitlist CTA that shows status inline.
   - Recommendation: Out of scope for this phase per decisions. Leave as `/pricing` link — the user lands on the pricing page where status is already checked.

2. **Suspense boundary placement for `useSearchParams`**
   - What we know: `PricingActions` uses dynamic import for `AuthModal` (ssr: false). `useSearchParams` requires Suspense in the App Router.
   - What's unclear: Whether the existing dynamic import already creates a sufficient boundary.
   - Recommendation: Add explicit `<Suspense fallback={null}>` around `<PricingActions>` in `pricing/page.tsx`. One-line safe change.

---

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — phase uses only existing project infrastructure: PostgreSQL already running, FastAPI already running, Next.js already running).

---

## Validation Architecture

`workflow.nyquist_validation` key is absent from `.planning/config.json` — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Not detected in codebase scan (no pytest.ini, jest.config, or test directories found) |
| Config file | None — Wave 0 gap |
| Quick run command | N/A until framework installed |
| Full suite command | N/A until framework installed |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WAIT-01 | Anonymous user clicking Pro CTA opens AuthModal with `/pricing?waitlist=1` callbackUrl | unit (component) | — | ❌ Wave 0 |
| WAIT-02 | `POST /user/waitlist` sets `pro_waitlist=true` on user record; idempotent on duplicate calls | unit (API) | `pytest tests/test_waitlist.py -x` | ❌ Wave 0 |
| WAIT-03 | Authenticated user sees confirmation message after POST succeeds; return visit shows message without clicking | integration | — | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] No test infrastructure detected in the project. If testing is desired, a framework must be installed before writing tests.
- [ ] For backend: `pip install pytest pytest-asyncio httpx` + `tests/test_waitlist.py`
- [ ] For frontend: component tests would require Jest + React Testing Library

*Note: This project has no existing test files. The phase is implementable without tests — the planner should determine whether Wave 0 test setup is in scope given project history.*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `get_current_user_required` FastAPI dependency — already used project-wide |
| V3 Session Management | no | No new session handling |
| V4 Access Control | yes | `POST /user/waitlist` requires authenticated user; admin endpoints require `get_current_user_admin` |
| V5 Input Validation | yes (minimal) | Endpoint takes no body input — no validation surface. Response is boolean. |
| V6 Cryptography | no | No cryptographic operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated waitlist join | Spoofing | `get_current_user_required` dependency — 401 if no valid JWT |
| Mass enrollment via script | Elevation of Privilege | Idempotent endpoint — repeated calls are no-ops. Rate limiting already applied project-wide via `@limiter` where sensitive. Consider whether waitlist endpoint needs rate limiting (low risk — booleans are idempotent). |
| Waitlist status exposure | Information Disclosure | `proWaitlist` is only returned to the owning user via authenticated `/user/plan`. Admin endpoints are guarded by `get_current_user_admin`. |

---

## Sources

### Primary (HIGH confidence)
All findings derived from direct source file reads — no training-data assumptions for technical claims.

- `api/app/models.py` lines 123–151 — User model, confirmed no `pro_waitlist` column exists yet
- `api/app/routers/user_plan.py` — full file — GET /user/plan response structure confirmed
- `api/app/routers/auth_routes.py` — full file — `get_current_user_required` dependency pattern confirmed
- `api/app/routers/admin_users.py` — full file — `_user_to_dict`, filter pattern, `get_current_user_admin` confirmed
- `api/app/routers/admin_analytics.py` — full file — `func.count` aggregate pattern confirmed
- `api/alembic/versions/0010_add_store_analysis.py` — migration head confirmed (`0010`)
- `api/alembic/versions/0009_per_user_analysis_isolation.py` — `op.add_column` / `op.alter_column` patterns confirmed
- `webapp/src/app/pricing/_components/PricingActions.tsx` — full file — stub location, `waitlistConfirmed` state, `AuthModal` callbackUrl confirmed
- `webapp/src/app/pricing/page.tsx` — full file — server component structure, tier keys confirmed
- `webapp/src/components/AuthModal.tsx` — full file — `callbackUrl` prop routing behavior confirmed
- `webapp/src/lib/auth-fetch.ts` — full file — `authFetch` API confirmed
- `webapp/src/app/admin/users/page.tsx` — full file — `Badge`, filter `Select`, `AdminUser` interface confirmed
- `webapp/src/app/admin/page.tsx` — full file — `AnalyticsData` interface, stat card pattern confirmed
- `webapp/src/components/ui/Badge.tsx` — badge variant pattern confirmed
- `webapp/src/lib/format.ts` — `planBadgeStyle` pattern confirmed
- `webapp/src/app/scan/[domain]/page.tsx` lines 30–46 — `router.replace` + `useSearchParams` URL cleanup pattern confirmed
- `alembic heads` command — current migration head `0010` verified

### Tertiary (LOW confidence)
- Next.js App Router Suspense requirement for `useSearchParams` — based on training knowledge. [ASSUMED: A2] Low risk; easily verified during implementation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in live codebase
- Architecture: HIGH — all patterns verified from existing code
- Pitfalls: HIGH (Pitfalls 1-2, 4-5) / MEDIUM (Pitfall 3 — Suspense requirement is [ASSUMED])
- Migration chain: HIGH — `alembic heads` run and confirmed

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable stack — no fast-moving dependencies)
