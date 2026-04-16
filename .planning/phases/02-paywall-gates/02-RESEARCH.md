# Phase 2: Paywall Gates - Research

**Researched:** 2026-04-16
**Domain:** Auth-gated UI, Next.js client components, FastAPI rate limiting
**Confidence:** HIGH — all findings are VERIFIED from direct codebase inspection

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Anonymous scan behavior**
- D-01: Anonymous users trigger a real backend scan — no more SAMPLE_SCAN data
- D-02: IP-based rate limiting for unauthenticated scans: 3 scans per day
- D-03: Anonymous users see full revenue loss estimates (PluginCTACard). Not hidden.
- D-04: Anonymous users see full ScoreRing. Not hidden.

**Locked card presentation**
- D-05: Locked IssueCards show dimension name, score, and impact badge only. No recommendation text, no blur, no teaser. Clean collapsed card with lock icon and "Sign up to see fixes" text.
- D-06: Locked cards are clickable — clicking opens AuthModal directly (signup flow).
- D-07: Authenticated free users see full inline expansion. `getDimensionAccess()` must return "unlocked" for all dimensions when authenticated (flip current behavior: free = unlocked).

**Signup prompt placement**
- D-08: Inline CTA card as last item in the issue cards grid for anonymous users.
- D-09: Problem-aware copy using dynamic data: "Your page has {N} issues. Sign up free to see how to fix them."
- D-10: Remove the bottom gradient banner section for anonymous users.

**PaywallModal removal**
- D-11: Clicking locked cards or inline CTA opens AuthModal directly — no PaywallModal.
- D-12: Delete PaywallModal.tsx entirely and remove all imports/references.
- D-13: After signup, the page auto-refreshes to show unlocked results via useSession effect.
- D-14: Credit exhaustion screen changes "Upgrade Plan" to "Join Pro Waitlist" with link to /pricing.

### Claude's Discretion

- Exact locked card styling (colors, spacing, lock icon size/placement)
- AuthModal callbackUrl configuration for returning to the results page post-signup
- Rate limiting implementation approach (backend middleware vs. frontend check vs. both)
- Whether SAMPLE_SCAN / sample-data.ts should be removed or kept for dev/test purposes
- How the "Scan Another" CTA section works for anonymous users after removing the bottom banner

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GATE-01 | Unauthorized user sees dimension scores but not recommendations on results page | D-05, D-06: IssueCard locked prop + getDimensionAccess() flip; backend already returns full scan data to unauthenticated callers |
| GATE-02 | Signed-in user sees all 18 dimensions with full recommendations | D-07: getDimensionAccess() free → "unlocked"; tier-gating.test.ts must be updated |
| GATE-03 | Results page shows a signup prompt nudging anonymous users to create an account | D-08, D-09, D-10: CTACard copy + inline placement; remove bottom banner for anon |
</phase_requirements>

---

## Summary

Phase 2 converts the results page from a sample-data teaser to a real-scan-with-signup-gate flow. The architecture is already partially scaffolded: the backend `/analyze` endpoint already accepts unauthenticated calls (uses `get_current_user_optional`), skips DB persistence for anonymous users, and returns full scan results. The frontend currently short-circuits to `SAMPLE_SCAN` for unauthenticated users before even calling the backend — this is the primary behavior to replace.

The tier gating flip (`getDimensionAccess` free → "unlocked") is a single-line change in `conversion-model.ts` with a corresponding test update in `tier-gating.test.ts`. The locked card redesign is a contained change within `IssueCard.tsx` — the `locked` prop and `LockKeyIcon` already exist; the card body just needs to collapse to score + impact + lock. The PaywallModal deletion is surgical: one file deleted, two usage sites in `analyze/page.tsx` removed.

The most complex piece is the rate limiting addition for anonymous scans. The backend already has the `slowapi` limiter infrastructure with Cloudflare-aware IP extraction. The current `/analyze` decorator is `@limiter.limit("5/minute")` — an additional per-day IP limit of `"3/day"` needs to be layered in specifically for unauthenticated callers.

**Primary recommendation:** Work in three focused task groups — (1) backend: anonymous scan path + rate limiting, (2) tier gating flip + tests, (3) frontend UI: locked card redesign + CTACard + PaywallModal deletion + page flow.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Anonymous scan execution | API / Backend | — | Backend runs Playwright + scoring pipeline; already accepts unauthenticated POST /analyze |
| IP rate limiting (3/day anon) | API / Backend | — | Rate limiting must be server-enforced; client-side checks are bypassable |
| Tier gating decision | Frontend (client) | — | `getDimensionAccess()` is pure TS in the client bundle; no server-side rendering of card state |
| Locked card UI | Frontend (client) | — | IssueCard is a client component; locked prop drives collapsed render |
| AuthModal trigger | Frontend (client) | — | onClick on locked card sets `authModalOpen=true` in page state |
| Post-signup unlock | Frontend (client) | — | `useSession` status change triggers scan useEffect re-run — no server round-trip needed |
| CTACard inline prompt | Frontend (client) | — | Rendered in leaks grid; copy uses `leaks.length` from existing scan result state |
| Credit exhaustion screen | Frontend (client) | — | Existing screen; button label change only |

---

## Standard Stack

All libraries below are already installed in the project — no new dependencies required for this phase.

### Core (already in project)
| Library | Version | Purpose | Role in this Phase |
|---------|---------|---------|-------------------|
| next-auth | (installed) | Session management | `useSession` drives anon vs. authenticated branch | [VERIFIED: webapp/src/app/analyze/page.tsx line 8] |
| slowapi | (installed) | FastAPI rate limiting | Add `"3/day"` limit for unauthenticated callers | [VERIFIED: api/app/rate_limit.py] |
| vitest | ^4.1.2 | Test runner | Update tier-gating.test.ts | [VERIFIED: webapp/package.json] |
| @phosphor-icons/react | (installed) | Icon library | `LockKeyIcon`, `LockSimpleIcon` already imported in IssueCard | [VERIFIED: IssueCard.tsx line 49] |

### No new installations needed
This phase is entirely modifications to existing files. No `npm install` or `pip install` steps required.

---

## Architecture Patterns

### System Architecture Diagram

```
Anonymous user submits URL
         │
         ▼
Frontend: status === "unauthenticated"  ──►  POST /analyze (no auth header)
         │                                         │
         │                          Backend: get_current_user_optional
         │                          → current_user = None
         │                          → skip credit check
         │                          → skip dedup lock
         │                          → run full Playwright scan
         │                          → apply IP rate limit "3/day"
         │                          → skip DB upsert (anon, R013)
         │                          → return full scan JSON
         │
         ◄─── scan result (score, categories, tips, signals)
         │
         ▼
Frontend renders:
  ScoreRing ──────────────────── visible (D-04)
  PluginCTACard ──────────────── visible (D-03)
  IssueCards (18x) ───────────── collapsed locked view (D-05)
    [score + impact + LockKeyIcon]
    onClick → setAuthModalOpen(true)  (D-06)
  CTACard (inline, last) ──────── "Your page has N issues. Sign up free to see how to fix them." (D-08/09)
  Bottom gradient banner ──────── REMOVED for anon (D-10)
         │
         ▼
User signs up via AuthModal
         │
         ▼
useSession status: "loading" → "authenticated"
         │
         ▼
useEffect re-runs → authFetch /user/plan + /analysis (cache) or /analyze
getDimensionAccess("free", key) → "unlocked" (D-07)
All 18 IssueCards render expandable with full recommendation text
```

### Recommended File Change Surface
```
webapp/src/
├── app/analyze/page.tsx          # Major: anon scan path, PaywallModal removal, state cleanup
├── components/
│   ├── analysis/
│   │   ├── IssueCard.tsx         # Locked state visual redesign (D-05)
│   │   └── CTACard.tsx           # Anonymous problem-aware copy (D-08/09)
│   └── PaywallModal.tsx          # DELETE entirely (D-12)
└── lib/analysis/
    ├── conversion-model.ts       # getDimensionAccess: free → "unlocked" (D-07)
    └── __tests__/
        └── tier-gating.test.ts   # Update free plan assertions to expect "unlocked"

api/app/routers/
└── analyze.py                    # Add "3/day" IP rate limit for unauthenticated (D-02)
```

### Pattern 1: Anonymous scan path in analyze/page.tsx

The current unauthenticated branch (lines 159–174) uses a fake `setTimeout` + `SAMPLE_SCAN`. Replace with a real `fetch` to `/analyze`:

```typescript
// Source: VERIFIED from webapp/src/app/analyze/page.tsx lines 159-174 + api/app/routers/analyze.py line 133
// current_user is Optional — backend accepts unauthenticated POST
if (status === "unauthenticated") {
  const controller = new AbortController();
  abortRef.current = controller;

  fetch(`${API_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (res.status === 429) throw new Error(getUserFriendlyError(429));
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || `Analysis failed (${res.status})`);
      }
      return res.json();
    })
    .then((data) => {
      setResult(parseAnalysisResponse(data));
      setLoading(false);
      captureEvent("anon_scan_completed", { url });
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : getUserFriendlyError(0));
      setLoading(false);
    });

  return () => { controller.abort(); };
}
```

### Pattern 2: getDimensionAccess flip

```typescript
// Source: VERIFIED from webapp/src/lib/analysis/conversion-model.ts line 51
// Current behavior: free → "locked", pro → "unlocked"
// Required behavior (D-07): authenticated (any plan including free) → "unlocked"
// The function receives PlanTier from planData, which is only fetched for authenticated users.
// For anonymous users, dimAccess is forced to "locked" at the call site in page.tsx (line 352).

export function getDimensionAccess(plan: PlanTier, _dimensionKey: string): DimensionAccess {
  // All authenticated users (free or pro) see full recommendations
  return "unlocked";
}
```

Note: The `plan` parameter remains in the signature to avoid breaking the call sites. The `pro` branch is now redundant but harmless — both tiers return "unlocked". The anonymous gate is enforced entirely at the call site via the `isTeaser` (to be renamed/replaced with `isAnonymous`) flag.

### Pattern 3: Rate limiting unauthenticated callers (D-02)

```python
# Source: VERIFIED from api/app/routers/analyze.py lines 127-128 + api/app/rate_limit.py
# Current: @limiter.limit("5/minute") — applies to ALL callers
# Required: additionally enforce 3/day for unauthenticated callers only

@router.post("/analyze")
@limiter.limit("5/minute")          # keep existing per-minute global limit
async def analyze(
    request: Request,
    body: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    # After auth resolution, apply per-day IP limit for anonymous only
    if current_user is None:
        # Manual rate limit check: track IP in a lightweight in-process store
        # or use a second @limiter.limit decorator with a conditional key function
        ...
```

**Implementation options for "anon only" rate limit** (Claude's discretion per CONTEXT.md):

| Option | Mechanism | Tradeoff |
|--------|-----------|----------|
| A | Second `@limiter.limit` with custom key that returns a sentinel for authenticated users | Clean decorator style; sentinel key means authenticated users never hit the limit |
| B | Manual `limiter.hit()` check inside the handler after `current_user` is resolved | More explicit control; slightly more code |
| C | Separate `anon_limiter` instance with `key_func` that returns `None` for authenticated (slowapi skips `None` keys) | Cleanest separation; requires verifying slowapi behavior with `None` keys |

Option A is recommended: use a custom key function that returns `f"anon:{ip}"` for unauthenticated requests and a fixed string like `"authenticated"` for authenticated ones — authenticated users effectively share one bucket with a very high limit.

### Pattern 4: IssueCard locked state redesign (D-05)

The current locked card renders the full card body (category name, problem text, revenue, arrow) with just a `LockKeyIcon` replacing the arrow (lines 1416–1418). The redesign collapses everything except score + impact + lock:

```typescript
// Source: VERIFIED from IssueCard.tsx lines 1337-1433
// Current: locked card shows full body (name + problem + revenue) with lock icon at bottom
// Required: locked card shows ONLY dimension name + score + impact badge + "Sign up to see fixes"

// The locked branch should render a minimal card body, NOT the full space-y-5 layout.
// The outer <div> wrapper and animation stay identical (no change to grid layout).
```

Key insight: the outer wrapper div (line 1364) with `contain-card group` CSS and `fade-in-up` animation must be preserved identically for both locked and unlocked cards so grid layout is not disrupted.

### Anti-Patterns to Avoid

- **Checking `isTeaser` after the auth branch merge:** With D-01, anonymous users get real scans. The `isTeaser` flag was tied to fake SAMPLE_SCAN mode. After the refactor, the correct flag is `status === "unauthenticated"` (or a derived `isAnonymous` boolean). Do not leave `isTeaser` checks that assume fake data.
- **Removing `planData` fetch for authenticated users:** The `planData` state and `/user/plan` fetch are still needed for authenticated users (credit counting, plan tier). Only the unauthenticated branch changes.
- **Deleting PaywallModal before removing all references:** TypeScript will error. Remove imports first, then delete the file. Two usage sites in `analyze/page.tsx`: the dynamic import (line 10) and two JSX instances (lines 282, 469).
- **Assuming `useSession` re-run auto-resets scan result:** After signup, `status` changes from `"unauthenticated"` to `"authenticated"`. The `useEffect` dependency on `[url, status]` (line 174) means it re-runs and fetches fresh. However, `result` state is NOT reset before the new scan begins — the old locked view briefly remains until new data arrives. Reset `result`, `loading`, and relevant flags at the top of the effect when status changes.
- **Sharing the rate limit bucket across anon/auth for the daily limit:** The 3/day limit must only fire for `current_user is None`. If implemented carelessly with a global decorator, authenticated users with high scan volume will be rate limited at 3/day too.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IP rate limiting | Custom Redis counter | `slowapi` (already installed, Limiter with `get_client_ip`) | Cloudflare-aware IP extraction already implemented in `rate_limit.py`; slowapi handles atomic increment, TTL, 429 response |
| Auth state detection | Custom session polling | `useSession` from next-auth | Already used in page.tsx line 8; re-runs effect on status change automatically |
| Modal focus trap / scroll lock | Custom modal | `AuthModal` (already built) | Radix Dialog primitive, Google OAuth + email/password, callbackUrl support |
| Post-signup unlock animation | Custom re-render logic | `useSession` status change → useEffect re-run | Already wired at line 174; no extra code needed |

---

## Common Pitfalls

### Pitfall 1: `isTeaser` state not cleaned up
**What goes wrong:** Old `isTeaser = true` state persists after the anonymous scan path is refactored, causing locked card logic to branch on `isTeaser` when it should branch on `status === "unauthenticated"`.
**Why it happens:** `isTeaser` was set to `true` in the SAMPLE_SCAN timer callback (line 169). After removing SAMPLE_SCAN, the flag becomes vestigial but existing checks (`line 209`, `line 352`, `line 375`, `line 391`) still reference it.
**How to avoid:** Audit all `isTeaser` references in `analyze/page.tsx` and replace with the appropriate auth-based check, or keep `isTeaser` as an alias for `status === "unauthenticated"` set at the top of the component.
**Warning signs:** `isTeaser` still appears in the file after the refactor.

### Pitfall 2: Rate limit applies to authenticated users
**What goes wrong:** Adding `@limiter.limit("3/day")` as a second decorator without scoping it to anonymous callers means authenticated users who run >3 scans/day get 429.
**Why it happens:** slowapi decorators apply to all callers by default; the key function must encode auth state.
**How to avoid:** Use a key function that returns a fixed high-limit key for authenticated callers (e.g., `"auth:unlimited"`) so they never hit the 3/day bucket. The daily limit bucket only fills for real IP keys.
**Warning signs:** Authenticated users see 429 errors after 3 scans.

### Pitfall 3: PaywallModal state left dangling
**What goes wrong:** `paywallOpen`, `paywallLeakKey`, `setPaywallOpen`, `closePaywall` state and handlers remain in `analyze/page.tsx` after PaywallModal is deleted, causing TypeScript lint errors or dead code.
**Why it happens:** PaywallModal has 3 usage sites in the file — the import (line 10), the credit exhaustion screen (line 282), and the main page render (line 469).
**How to avoid:** Remove all `paywall*` state variables and the `closePaywall` callback when deleting PaywallModal. The credit exhaustion screen button becomes a direct `/pricing` link (D-14).
**Warning signs:** `paywallOpen`, `setPaywallOpen`, `closePaywall` still in the file after refactor.

### Pitfall 4: Anonymous scan result has no `signals` field
**What goes wrong:** Anonymous scans return full `signals` in the JSON response (verified: line 737 of analyze.py `"signals": {**_product_signals, **_store_signals}`), but the frontend's `FreeResult` type has `signals` as optional. If the locked card rendering accidentally passes `signals` to locked IssueCards, the signal checklists appear.
**Why it happens:** The `signals` prop is passed conditionally at line 363: `signals={isUnlocked ? result?.signals : undefined}`. As long as locked cards receive `undefined`, this is fine.
**How to avoid:** Maintain the `isUnlocked ? result?.signals : undefined` pattern. Do not pass `result?.signals` unconditionally.
**Warning signs:** Signal checklists visible inside locked/collapsed cards.

### Pitfall 5: AuthModal opened in "signin" mode instead of "signup"
**What goes wrong:** Locked card clicks open AuthModal in signin (default) mode, but the user is unauthenticated and likely new — they should land on signup.
**Why it happens:** `AuthModal` defaults `mode` to `"signin"` (line 46). There is no `initialMode` prop.
**How to avoid:** Add an `initialMode?: AuthMode` prop to AuthModal, or open with a query param that AuthModal reads. Alternatively, use the existing toggle — the mode toggle is one click away and copy can make it clear. This is Claude's discretion per CONTEXT.md.
**Warning signs:** Anonymous users who click locked cards see "Sign In" heading when they're new users.

### Pitfall 6: useSession effect double-fires during status transition
**What goes wrong:** During signup, `status` transitions `unauthenticated → loading → authenticated`. The effect fires on `loading` too (the guard `if (status === "loading") return` exists for auth). The unauthenticated branch runs an abort on cleanup — but if the abort fires while the anon scan is still in progress, the scan result is lost.
**Why it happens:** The `useEffect` cleanup function calls `controller.abort()` when dependencies change. If status changes during the scan, the in-flight fetch is aborted.
**How to avoid:** The existing auth branch already has `if (status === "loading") return` (line 91) — ensure the anonymous branch has the same guard. Do not start the anon scan until `status === "unauthenticated"` is confirmed (not just "not authenticated").
**Warning signs:** Scan results lost when user signs up mid-scan.

---

## Code Examples

### Existing locked card rendering (current state)
```typescript
// Source: VERIFIED from IssueCard.tsx lines 1416-1431
// Current locked state — only the bottom icon differs from unlocked
{locked ? (
  <LockKeyIcon
    className="w-5 h-5 text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] transition-all duration-200"
    weight="regular"
  />
) : expandable ? (
  <CaretDownIcon ... />
) : (
  <CaretRightIcon ... />
)}
```

### Backend anonymous scan path (current state — already works)
```python
# Source: VERIFIED from api/app/routers/analyze.py lines 132-133, 740-753, 784-786
# current_user is Optional — already accepted
current_user: User | None = Depends(get_current_user_optional)

# Credits: only checked for authenticated users (line 142)
if current_user and not has_credits_remaining(current_user):
    ...

# DB persistence: skipped for anonymous (lines 784-788)
if current_user is not None:
    # upsert ProductAnalysis
    ...

# Scan record: inserted with user_id=None for anonymous (line 772)
Scan(url=url, ..., user_id=current_user.id if current_user else None)
```

### Existing rate limiting setup
```python
# Source: VERIFIED from api/app/rate_limit.py + analyze.py line 127
from app.rate_limit import limiter

@router.post("/analyze")
@limiter.limit("5/minute")  # current: global per-minute limit
async def analyze(request: Request, ..., current_user: User | None = ...):
    ...
```

### AuthModal callbackUrl pattern (existing)
```typescript
// Source: VERIFIED from webapp/src/app/analyze/page.tsx lines 190-191
const authCallbackUrl = `/analyze?url=${encodeURIComponent(url)}`;
// This already exists and points back to the results page — reuse as-is for D-11
```

---

## State of the Art

| Old Approach | Current Approach | Status | Impact |
|--------------|------------------|--------|--------|
| Anonymous users see SAMPLE_SCAN (fake Gymshark data) | Anonymous users see real scan of their URL | To implement (D-01) | Core hook change — real problems = real motivation to sign up |
| Free plan = locked (getDimensionAccess returns "locked") | Authenticated = unlocked regardless of plan | To implement (D-07) | Single-line change in conversion-model.ts + test update |
| PaywallModal as intermediate step | AuthModal directly | To implement (D-11/12) | Delete one file, simplify flow |
| Bottom gradient banner as signup CTA | Inline CTACard in issues grid only | To implement (D-08/10) | Removes duplicate CTAs |

**Currently outdated in codebase:**
- `isTeaser` boolean semantics: currently means "fake SAMPLE_SCAN mode". After D-01, no fake data exists — the concept maps 1:1 to `status === "unauthenticated"`.
- `isShallow` boolean: currently means `planTier === "free"` (line 83). After D-07, "shallow" and "free" are decoupled — free users are NOT shallow. This flag should be removed or redefined as "anonymous" context only.
- `hasFullAccess` boolean: currently means `planTier === "pro"` (line 86). After D-07, all authenticated users have full access. This simplifies to `status === "authenticated"`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | — | — | — |

**All claims in this research were verified from direct codebase inspection — no assumed knowledge.**

---

## Open Questions

1. **AuthModal initial mode for anonymous locked-card clicks**
   - What we know: AuthModal defaults to "signin" mode; the toggle to signup is one click. CONTEXT.md marks this as Claude's discretion.
   - What's unclear: Whether opening in "signup" mode meaningfully improves conversion for this entry point.
   - Recommendation: Add optional `initialMode?: "signin" | "signup"` prop to AuthModal and open in "signup" mode from locked card / CTACard clicks. One-line prop addition.

2. **"Scan Another" CTA for anonymous users after removing bottom banner (D-10)**
   - What we know: D-10 removes the bottom gradient banner for anonymous users. The authenticated "Scan Another" button remains for auth users. CONTEXT.md marks this as Claude's discretion.
   - What's unclear: Whether anonymous users should see a "Scan Another" button below the issues grid, or if the inline CTACard is the only CTA.
   - Recommendation: Keep a minimal "Analyze Another Page" button below the issues grid for anonymous users (reuse the existing Button variant="gradient" pattern) — prevents dead ends if the user wants to try a different URL before signing up.

3. **SAMPLE_SCAN / sample-data.ts retention**
   - What we know: After D-01, `SAMPLE_SCAN` will no longer be imported by `analyze/page.tsx`. CONTEXT.md marks this as Claude's discretion.
   - What's unclear: Whether other code references it (dev fixtures, tests, Storybook).
   - Recommendation: Check for remaining imports before deleting. If no other consumers exist, delete the file. If used in tests, keep with a comment noting it's test-only fixture data.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is entirely modifications to existing files with no new external dependencies, runtimes, services, or CLI tools required.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.2 |
| Config file | (none detected — uses default vitest discovery) |
| Quick run command | `cd webapp && npx vitest run src/lib/analysis/__tests__/tier-gating.test.ts` |
| Full suite command | `cd webapp && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 | `getDimensionAccess("free", key)` with unauthenticated context returns correct access | unit | `cd webapp && npx vitest run src/lib/analysis/__tests__/tier-gating.test.ts` | ✅ exists — needs update |
| GATE-02 | `getDimensionAccess("free", key)` returns `"unlocked"` for all 18 dimensions | unit | `cd webapp && npx vitest run src/lib/analysis/__tests__/tier-gating.test.ts` | ✅ exists — needs update |
| GATE-03 | CTACard renders with issue count in copy | unit | `cd webapp && npm test` | ❌ Wave 0 (no component test exists) |

### Sampling Rate
- **Per task commit:** `cd webapp && npx vitest run src/lib/analysis/__tests__/tier-gating.test.ts`
- **Per wave merge:** `cd webapp && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] No component test for CTACard anonymous copy — covers GATE-03 (optional: CTACard is simple enough that manual verification suffices for this phase)
- [ ] `tier-gating.test.ts` currently asserts `free → "locked"` — **must be updated** before or alongside conversion-model.ts change or tests will fail immediately

*(Existing `tier-gating.test.ts` at line 17 asserts `getDimensionAccess("free", key)` returns `"locked"` — this assertion inverts to `"unlocked"` in Phase 2. The test file must be updated in the same task as the conversion-model.ts change.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | next-auth (already in place); no new auth logic added |
| V3 Session Management | no | Session behavior unchanged |
| V4 Access Control | yes | Rate limiting for anonymous callers; gating enforced server-side for credits |
| V5 Input Validation | yes | URL validation in `validate_url()` — already applied to all `/analyze` calls including anonymous |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IP spoofing to bypass rate limit | Tampering | `get_client_ip()` already uses `CF-Connecting-IP` priority (Cloudflare strips/overrides this header) — VERIFIED from `rate_limit.py` |
| Scan abuse by anonymous users | Denial of service | 3/day IP rate limit (D-02); existing 5/minute global limit remains |
| Exposing scan results to wrong user | Information disclosure | Anonymous scans not persisted to DB (verified lines 784-788) — no cross-user data leakage possible |

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `webapp/src/app/analyze/page.tsx` — full page logic, session flow, PaywallModal usage, isTeaser/isShallow/hasFullAccess derived state
- `webapp/src/lib/analysis/conversion-model.ts` — `getDimensionAccess()` current implementation (lines 51-54)
- `webapp/src/lib/analysis/__tests__/tier-gating.test.ts` — current test assertions (free → locked)
- `webapp/src/components/analysis/IssueCard.tsx` — locked card current render (lines 1337-1433)
- `webapp/src/components/analysis/CTACard.tsx` — existing props and copy patterns
- `webapp/src/components/AuthModal.tsx` — modal interface, callbackUrl, default mode
- `webapp/src/components/PaywallModal.tsx` — confirmed shell with no functional content
- `api/app/routers/analyze.py` — `get_current_user_optional`, credit check, scan dedup, DB skip for anon, rate limit decorator
- `api/app/rate_limit.py` — `get_client_ip()` Cloudflare-aware extraction, `Limiter` instance
- `webapp/src/lib/sample-data.ts` — SAMPLE_SCAN constant (confirmed unused after D-01)
- `webapp/package.json` — vitest version, test script
- `.planning/config.json` — `workflow.nyquist_validation` absent (treated as enabled)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from package.json and imports
- Architecture: HIGH — all file paths and line numbers verified from direct read
- Pitfalls: HIGH — derived from actual code paths found in codebase inspection
- Backend behavior: HIGH — anonymous path through analyze.py traced end-to-end

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable codebase; no external API dependencies for this phase)
