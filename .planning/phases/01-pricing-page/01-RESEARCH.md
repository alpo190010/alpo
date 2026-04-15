# Phase 1: Pricing Page - Research

**Researched:** 2026-04-15
**Domain:** Next.js page rewrite + TypeScript type refactor + UI component composition
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Free Plan Card**
- D-01: Generous feature list with all checkmarks, no X marks. List: 3 scans per month, Full 18-dimension scoring, Actionable recommendations, Revenue leak estimates.
- D-02: Keep the 3 scans/month limit (existing backend logic stays). Do not change to unlimited.
- D-03: CTA button: "Get Started" linking to homepage (same as current free tier behavior).

**Pro Waitlist CTA**
- D-04: Side-by-side teaser card next to free card (2-column grid on desktop, stacked on mobile).
- D-05: Pro card has "coming soon" styling — grayed/muted, distinct from the active free card.
- D-06: Lists 4 future features: AI-powered fixes, Store monitoring, Competitor insights, Unlimited scans.
- D-07: "Join Waitlist" button. When clicked: if not authenticated, prompt signup first. If authenticated, record waitlist interest and show confirmation. (Waitlist backend is Phase 3 — this phase only needs the CTA button wired to auth check.)

**Old Tier Cleanup**
- D-08: Remove Starter/Growth/Pro tier definitions from pricing page entirely. No dormant code.
- D-09: Remove LemonSqueezy checkout logic from PricingActions.tsx (env vars, buildCheckoutUrl, variant maps).
- D-10: Remove or simplify PaywallModal.tsx — the $29/$79/$149 subscription prompts are no longer used.
- D-11: Simplify PlanTier type from `"free" | "starter" | "growth" | "pro"` to `"free" | "pro"` across the codebase. Update getDimensionAccess() and any consuming code.

### Claude's Discretion
- Page hero copy ("Simple, transparent pricing") — update if it no longer fits, or keep if it still works
- Card styling details — reuse existing design tokens and card patterns
- Whether PricingActions.tsx is still needed or can be simplified/inlined after removing checkout logic

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRICE-01 | User sees a single free plan card (3 scans/month, full scoring, recommendations, revenue leak estimates) | Rewrite PRICING_TIERS array in page.tsx to one entry; all features marked `included: true` |
| PRICE-02 | User sees a Pro waitlist CTA below (or beside) the free plan | New Pro teaser card rendered alongside free card; waitlist button wired to auth check via PricingActions |
| PRICE-03 | Old pricing tiers and $79 references are removed | Delete Starter/Growth/Pro from page.tsx; gut PricingActions.tsx LemonSqueezy logic; simplify PaywallModal.tsx; update PlanTier type and all consumers |
</phase_requirements>

---

## Summary

This phase is a **contained UI + type refactor** with no new infrastructure. The work divides into three tracks that must be coordinated: (1) rewrite `pricing/page.tsx` to a 2-card layout, (2) gut `PricingActions.tsx` of LemonSqueezy logic and wire a minimal waitlist auth-check, and (3) simplify `PlanTier` across the codebase and update its consumers.

The highest-risk track is the `PlanTier` type change. The type currently has 4 members (`"free" | "starter" | "growth" | "pro"`), and 8 source files reference it or rely on its values — including the tier-gating test suite, the analyze page, and two admin pages. Narrowing it to `"free" | "pro"` will break `getDimensionAccess()` (which has `starter`/`growth` branches), `STARTER_DIMENSIONS`, the tier-gating tests, `format.ts` (plan badge styles), and the admin user-edit page dropdown. Each of these must be updated atomically with the type change or TypeScript will catch them at build time.

`PaywallModal.tsx` is currently the only live entry point for the LemonSqueezy checkout URLs; it is rendered twice in `analyze/page.tsx`. Decision D-10 says to remove or simplify it. Since the waitlist backend is not built until Phase 3, Phase 1's scope for PaywallModal is: strip all paid-tier checkout logic and pricing copy ($29/$79/$149), keep the modal shell if still useful for Phase 2's paywall gates, or delete it entirely. The planner should make this call explicit in the plan.

**Primary recommendation:** Execute in three sequential tasks — (1) page rewrite, (2) PricingActions simplification, (3) PlanTier type rename + consumer updates + test fix. Committing the type change last means TypeScript guards each prior step.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pricing page rendering | Frontend Server (Next.js Server Component) | — | `/pricing/page.tsx` is already a Server Component; no data fetching needed |
| Waitlist CTA interactivity (auth check) | Browser / Client | — | Session check requires `useSession`; must stay in a Client Component (island pattern already used) |
| PlanTier type definition | Shared library (`lib/analysis/types.ts`) | — | Consumed by both frontend and API-calling logic; single source of truth |
| Tier-gating logic (getDimensionAccess) | Shared library (`lib/analysis/conversion-model.ts`) | — | Pure TS function, SSR-safe; consumed by analyze page and tests |
| PaywallModal UI | Browser / Client | — | Uses React state; already `"use client"` |
| Admin plan dropdown | Browser / Client | — | Admin UI is already a Client Component |

---

## Standard Stack

All libraries are already installed. No new packages required for this phase.

### Core (in use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | (project) | Server Component page, routing | Project framework |
| React | (project) | UI components | Project framework |
| next-auth | (project) | `useSession()` for auth check on waitlist CTA | Already used in PricingActions |
| @phosphor-icons/react | (project) | Icons (Sparkle, RocketLaunch, etc.) | Already imported in pricing page |
| Tailwind CSS | (project) | Layout, responsive grid, utility classes | Project CSS system |

### No New Installations Required

This phase is a rewrite of existing files using existing infrastructure. The waitlist CTA in Phase 1 only needs the auth-gate pattern already present in PricingActions.tsx (`useSession` + `AuthModal`). No new npm packages.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser GET /pricing
        │
        ▼
pricing/page.tsx  [Server Component]
        │  renders static JSX
        ├──► Free Plan Card  (static HTML)
        │         └─► <PricingActions tier="free" />  [Client Island]
        │                   └─► Button → Link href="/"
        │
        └──► Pro Teaser Card  (static HTML, muted styling)
                  └─► <PricingActions tier="pro-waitlist" />  [Client Island]
                            └─► "Join Waitlist" button
                                      │
                                      ├─ not authed ──► open AuthModal
                                      └─ authed ──────► show inline confirmation
                                                         (Phase 3 wires to DB)
```

### Recommended Project Structure (unchanged)
```
webapp/src/app/pricing/
├── page.tsx                     # Server Component — rewrite to 2-card layout
├── error.tsx                    # Keep as-is
└── _components/
    └── PricingActions.tsx       # Client island — strip LemonSqueezy, keep auth gate

webapp/src/lib/analysis/
├── types.ts                     # PlanTier: "free" | "starter" | "growth" | "pro"
│                                #   → change to: "free" | "pro"
├── conversion-model.ts          # getDimensionAccess() — update starter/growth branches
└── __tests__/
    └── tier-gating.test.ts      # Update tests to match new 2-tier model

webapp/src/components/
└── PaywallModal.tsx             # Remove paid-tier checkout logic
```

### Pattern 1: Server Component with Client Islands (existing pattern)
**What:** Page renders as a Server Component; interactive parts (auth check, modal) are isolated to small Client Component islands loaded with `dynamic()`.
**When to use:** Already used — replicate exact pattern.
**Example from existing code:**
```typescript
// pricing/page.tsx (Server Component, no "use client")
import PricingActions from "./_components/PricingActions";

export default function PricingPage() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {/* Free card */}
      <div className="rounded-2xl border border-[var(--brand)] ...">
        ...
        <PricingActions tier={{ key: "free", ctaLabel: "Get Started" }} />
      </div>
      {/* Pro teaser card */}
      <div className="rounded-2xl border border-[var(--outline-variant)] opacity-70 ...">
        ...
        <PricingActions tier={{ key: "pro-waitlist", ctaLabel: "Join Waitlist" }} />
      </div>
    </div>
  );
}
```

### Pattern 2: Auth-Gated CTA (existing pattern in PricingActions.tsx)
**What:** Check `useSession()`. If unauthenticated, open `AuthModal`. If authenticated, perform the action.
**When to use:** Waitlist "Join Waitlist" button in Phase 1 — Phase 3 will wire the authenticated branch to a backend call.
**Example from existing code:**
```typescript
// PricingActions.tsx — simplified pattern (already present)
const { data: session } = useSession();
const isSignedIn = !!session?.user;

// Phase 1: authenticated branch shows inline confirmation only
// Phase 3: will call POST /user/waitlist here
onClick={() => {
  if (!isSignedIn) { setAuthModalOpen(true); return; }
  setWaitlistConfirmed(true);  // Phase 1: local state only
}}
```

### Pattern 3: "Coming Soon" Badge (adapt from existing "Popular" badge)
**What:** Absolute-positioned badge on card corner using existing CSS class pattern.
**Example from existing code:**
```tsx
// Existing "Popular" badge in page.tsx (line 129)
<div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white primary-gradient">
  Popular
</div>

// Adapt for Pro card:
<div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">
  Coming Soon
</div>
```

### Anti-Patterns to Avoid
- **Leaving dormant tier code:** D-08 is explicit — no commented-out Starter/Growth/Pro definitions. Remove completely.
- **Partial PlanTier update:** Changing `types.ts` without updating `getDimensionAccess()`, the test file, `format.ts`, and the admin dropdown will produce TypeScript errors or silent runtime mismatches. Update all consumers in the same task.
- **Inlining LemonSqueezy env vars as empty strings:** Remove the `const LS_*` declarations entirely from PricingActions.tsx and PaywallModal.tsx. Empty string vars left in code are confusing and violate D-09.
- **Blocking waitlist button on Phase 3:** The waitlist backend doesn't exist yet. Phase 1 must wire an auth check + show a local confirmation state. Do not block the button or leave it non-functional.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth modal trigger | Custom modal state management | Existing `AuthModal` + `dynamic()` pattern in PricingActions | Already tested; same `callbackUrl="/pricing"` pattern works |
| "Coming Soon" visual | New CSS class or animation | Existing Tailwind `opacity-70` + `var(--outline-variant)` border + muted color tokens | Consistent with design system |
| Responsive 2-col layout | CSS Grid custom implementation | `grid grid-cols-1 sm:grid-cols-2 gap-6` (existing Tailwind pattern from pricing page) | Already in use on the page |
| TypeScript union narrowing | Runtime checks | Narrowing the type at the definition in `types.ts` — TypeScript compiler enforces at build | Type system handles it; no runtime guard needed |

---

## Full Consumer Inventory for PlanTier Change (D-11)

This is the complete list of files that must be updated when `PlanTier` narrows to `"free" | "pro"`:

| File | What References It | Required Change |
|------|--------------------|-----------------|
| `webapp/src/lib/analysis/types.ts` | **Type definition** | Change union to `"free" \| "pro"` |
| `webapp/src/lib/analysis/conversion-model.ts` | `getDimensionAccess()` branches on `"growth"`, `"pro"`, `"starter"`; `STARTER_DIMENSIONS` set | Remove `starter`/`growth` branches. New logic: `"pro"` → all unlocked; `"free"` → all locked. `STARTER_DIMENSIONS` set becomes unused — remove or keep for Phase 2 at planner's discretion |
| `webapp/src/lib/analysis/helpers.ts` | Re-exports `PlanTier` | No change needed; re-export still valid after type narrows |
| `webapp/src/lib/analysis/__tests__/tier-gating.test.ts` | Tests `getDimensionAccess("starter", ...)`, `getDimensionAccess("growth", ...)`, `STARTER_DIMENSIONS.size === 7` | Delete or rewrite starter/growth test blocks; update free/pro assertions |
| `webapp/src/components/PaywallModal.tsx` | `userPlan?: PlanTier`; `isStarter = userPlan === "starter"` branch | Remove `isStarter` branch and all starter-specific copy; simplify or remove modal per D-10 |
| `webapp/src/app/analyze/page.tsx` | `planTier: PlanTier` cast; `isStarter`, `hasFullAccess` (`growth\|pro`) derivations; two `<PaywallModal>` usages | Remove `isStarter` and `hasFullAccess` based on old tiers; update derivation: `"pro"` → full access, `"free"` → locked |
| `webapp/src/app/admin/users/[id]/page.tsx` | `const PLAN_TIERS = ["free", "starter", "growth", "pro"]` as dropdown options | Remove `"starter"` and `"growth"` from array |
| `webapp/src/lib/format.ts` | `planBadgeStyle()` has `case "growth"` and `case "starter"` | Remove those cases; keep `"pro"` and default (`"free"`) |

**Note on analyze/page.tsx:** The `isStarter` path (partial 7-dimension access) will be removed. After this change, authenticated users are either `"free"` (all dimensions locked = no recommendations shown) or `"pro"` (all unlocked). This aligns with Phase 2's GATE requirements (GATE-01/02/03) which gate on signed-in vs. not. The planner should confirm this is the intended behavior per D-11.

---

## Common Pitfalls

### Pitfall 1: PaywallModal still imported in analyze/page.tsx after gutting
**What goes wrong:** PaywallModal.tsx is simplified/gutted but `analyze/page.tsx` still dynamically imports it and passes `userPlan` prop with the old tier values. If the prop type changes, TypeScript will fail the build.
**Why it happens:** Two separate files both reference the modal; easy to update one and forget the other.
**How to avoid:** Update PaywallModal's props interface and analyze/page.tsx in the same task or sequential tasks. TypeScript build (`npm run build`) catches this.
**Warning signs:** `Type '"starter"' is not assignable to type 'PlanTier'` TypeScript error.

### Pitfall 2: getDimensionAccess becomes over-permissive after type change
**What goes wrong:** If `getDimensionAccess` is updated carelessly (e.g. the `pro` branch returns `"unlocked"` but the old `growth` check is left), users on `"free"` could accidentally get unlocked access.
**Why it happens:** The current function has `if (plan === "growth" || plan === "pro")` — removing `growth` but keeping the structure is safe, but leaving an unreachable `else if (plan === "starter")` branch produces dead code.
**How to avoid:** Rewrite the function body cleanly: `if (plan === "pro") return "unlocked"; return "locked";`. Remove STARTER_DIMENSIONS if not needed downstream.
**Warning signs:** Tier-gating test failures; analyze page showing recommendations to free users.

### Pitfall 3: LemonSqueezy env vars still referenced in next.config
**What goes wrong:** After removing LS vars from the source files, they may still be listed in `next.config` or `.env.example`, causing confusion.
**Why it happens:** Env var declarations are often in multiple places (source, config, CI).
**How to avoid:** After removing from source files, search for `LS_VARIANT` and `LS_STORE_URL` across the whole webapp directory to find any remaining references.
**Warning signs:** `NEXT_PUBLIC_LS_STORE_URL` appearing in build output or config files after source cleanup.

### Pitfall 4: Hero copy "No hidden fees. Cancel anytime." in FAQ section
**What goes wrong:** The FAQ/trust section at the bottom of `pricing/page.tsx` (lines 228-241) currently reads "All plans are billed monthly via LemonSqueezy." This copy is stale and visible to users.
**Why it happens:** The tier grid cleanup (D-08) focuses on the card grid section; the FAQ section at the bottom is a separate JSX block and easy to miss.
**How to avoid:** The planner must include updating this section as an explicit sub-task of the page rewrite. Replace with copy appropriate for a free-only plan.
**Warning signs:** "LemonSqueezy" text visible on /pricing after deployment.

### Pitfall 5: Waitlist button is a no-op for authenticated users in Phase 1
**What goes wrong:** D-07 says "if authenticated, record waitlist interest" — but the backend doesn't exist yet (Phase 3). If the button does nothing for authenticated users, it appears broken.
**How to avoid:** Phase 1 should show an in-UI confirmation (e.g., local state: "You're on the list! We'll notify you."). This satisfies the user-visible requirement without needing a backend. Phase 3 replaces this with a real API call.
**Warning signs:** "Join Waitlist" button with no visible feedback on click for signed-in users.

---

## Code Examples

### Verified: Current card layout structure (from pricing/page.tsx lines 117-224)
The existing grid uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` with 4 cards. For 2 cards, change to:
```tsx
// Source: webapp/src/app/pricing/page.tsx (existing pattern, adapt)
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 max-w-3xl mx-auto">
  {/* Free card — active */}
  {/* Pro card — muted */}
</div>
```

### Verified: Existing "Popular" badge as template for "Coming Soon" (page.tsx line 129)
```tsx
// Source: webapp/src/app/pricing/page.tsx line 129
// "Popular" (branded) — exists today
<div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white primary-gradient">
  Popular
</div>

// "Coming Soon" (muted) — adapt for Pro card
<div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">
  Coming Soon
</div>
```

### Verified: getDimensionAccess after simplification
```typescript
// Source: webapp/src/lib/analysis/conversion-model.ts (rewrite of lines 57-61)
export function getDimensionAccess(plan: PlanTier, dimensionKey: string): DimensionAccess {
  if (plan === "pro") return "unlocked";
  return "locked";
}
```

### Verified: AuthModal dynamic import pattern to reuse in PricingActions.tsx
```typescript
// Source: webapp/src/app/pricing/_components/PricingActions.tsx lines 9-11
const AuthModal = dynamic(() => import("@/components/AuthModal"), {
  ssr: false,
});
```

---

## State of the Art

| Old Approach | Current Approach | Impact on This Phase |
|--------------|------------------|----------------------|
| 4-tier grid (Free/Starter/Growth/Pro) | 2-card layout (Free + Pro teaser) | Rewrite entire PRICING_TIERS array and card grid |
| LemonSqueezy checkout URLs in PricingActions | Auth-gate only (no checkout) | Remove all LS env var reads and buildCheckoutUrl |
| PlanTier = `"free"\|"starter"\|"growth"\|"pro"` | PlanTier = `"free"\|"pro"` | 8 files need updates |
| PaywallModal shows $29/$79/$149 tiers | PaywallModal no longer needed for pricing | Gut or delete; must still handle Phase 2 paywall use case |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | After PlanTier simplification, `analyze/page.tsx` should treat `"pro"` as "all unlocked" and `"free"` as "all locked" — there is no middle tier | Consumer Inventory | If a middle tier is added before Phase 3, the analyze page logic needs revisiting |
| A2 | PaywallModal.tsx can be gutted in Phase 1 without breaking Phase 2 (paywall gates), because Phase 2 will redesign the modal anyway | Pitfall 1 | If Phase 2 relies on current PaywallModal structure, gutting it here forces Phase 2 to rebuild from scratch — may be acceptable given Phase 2 redesigns the gate anyway |
| A3 | The FAQ section copy ("billed monthly via LemonSqueezy") must be replaced — not just the tier grid | Pitfall 4 | If left, stale copy is user-visible on /pricing |

---

## Open Questions

1. **PaywallModal fate after gutting**
   - What we know: D-10 says "remove or simplify." analyze/page.tsx dynamically imports it twice. Phase 2 (GATE-01/02/03) will need some kind of gate/prompt for anonymous users.
   - What's unclear: Should Phase 1 delete the file entirely (forcing Phase 2 to create a new one) or leave a stripped shell (maintaining the import contract)?
   - Recommendation: Simplify to a minimal "sign up to get full access" modal shell — remove all pricing tiers/checkout logic, keep the Modal component and auth flow. This preserves the import contract for analyze/page.tsx so Phase 2 can evolve it without a breaking change.

2. **STARTER_DIMENSIONS after PlanTier change**
   - What we know: The constant is exported from conversion-model.ts and imported in analyze/page.tsx (used for `unlockedCount`).
   - What's unclear: Should it be deleted now (creating a dead import error in analyze/page) or kept for Phase 2?
   - Recommendation: Remove STARTER_DIMENSIONS in the same task as the PlanTier type change. Update analyze/page.tsx to remove the `unlockedCount` derivation based on it simultaneously.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/config changes. No external services, CLIs, or runtimes beyond the existing Next.js/Vitest stack are required.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (vitest run) |
| Config file | `webapp/vitest.config.ts` |
| Quick run command | `cd webapp && npx vitest run src/lib/analysis/__tests__/tier-gating.test.ts` |
| Full suite command | `cd webapp && npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICE-01 | Free plan card renders with correct features | manual / visual | — | N/A |
| PRICE-02 | Pro waitlist card renders; "Join Waitlist" triggers auth modal for unauthenticated user | manual / visual | — | N/A |
| PRICE-03 (PlanTier) | `getDimensionAccess("free", dim)` returns `"locked"` for all dims; `getDimensionAccess("pro", dim)` returns `"unlocked"` | unit | `cd webapp && npx vitest run src/lib/analysis/__tests__/tier-gating.test.ts` | Exists — needs rewrite |
| PRICE-03 (visual) | No $79, "Starter", "Growth", or "LemonSqueezy" text on /pricing | manual / visual | — | N/A |

### Sampling Rate
- **Per task commit:** `cd webapp && npx vitest run src/lib/analysis/__tests__/tier-gating.test.ts`
- **Per wave merge:** `cd webapp && npm run test`
- **Phase gate:** Full suite green before marking phase complete

### Wave 0 Gaps
- The existing `tier-gating.test.ts` must be **rewritten** (not created) to match the new 2-tier model. It currently asserts `starter` and `growth` behavior that will no longer exist. This is a required pre-task, not optional.

---

## Security Domain

The pricing page has no authentication requirements (public route). The waitlist CTA performs an auth check via `useSession()` — using the existing next-auth session mechanism, which is already hardened. No new security surface is introduced.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no (reads existing session only) | next-auth |
| V4 Access Control | no | — |
| V5 Input Validation | no | — |
| V6 Cryptography | no | — |

---

## Sources

### Primary (HIGH confidence — verified by direct code inspection)
- `webapp/src/app/pricing/page.tsx` — full file read; verified 4-tier structure, badge pattern, FAQ section copy
- `webapp/src/app/pricing/_components/PricingActions.tsx` — full file read; verified LemonSqueezy env vars, auth modal pattern
- `webapp/src/lib/analysis/types.ts` — full file read; confirmed `PlanTier = "free" | "starter" | "growth" | "pro"` at line 9
- `webapp/src/lib/analysis/conversion-model.ts` — full file read; confirmed `getDimensionAccess()` and `STARTER_DIMENSIONS`
- `webapp/src/lib/analysis/helpers.ts` — full file read; confirmed re-exports
- `webapp/src/lib/analysis/__tests__/tier-gating.test.ts` — full file read; confirmed test coverage of starter/growth/pro/free
- `webapp/src/components/PaywallModal.tsx` — lines 1-150 read; confirmed $29/$79/$149 pricing, LemonSqueezy vars, `isStarter` branch
- `webapp/src/app/analyze/page.tsx` — lines 1-140 read + PaywallModal grep; confirmed `planTier` derivation, `isStarter`/`hasFullAccess`, two PaywallModal usages
- `webapp/src/app/admin/users/[id]/page.tsx` — lines 1-60 read; confirmed `PLAN_TIERS` array
- `webapp/src/lib/format.ts` — full file read; confirmed `planBadgeStyle` with `growth`/`starter` cases
- `webapp/vitest.config.ts` — full file read; confirmed `vitest run` / `src/**/*.{test,spec}.ts` config

### Secondary (MEDIUM confidence)
- None required — all claims derive from direct code inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new packages
- Architecture: HIGH — verified from live source files
- Pitfalls: HIGH — derived from actual code paths found in codebase
- Consumer inventory: HIGH — derived from grep across all 8 affected files

**Research date:** 2026-04-15
**Valid until:** Stable — only changes if the codebase diverges before planning begins
