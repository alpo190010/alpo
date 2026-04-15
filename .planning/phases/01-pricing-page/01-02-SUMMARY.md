---
phase: 01-pricing-page
plan: "02"
subsystem: pricing-ui
tags: [pricing-page, 2-card-layout, waitlist, auth-gate, lemon-squeezy-removal]
dependency_graph:
  requires: ["01-01"]
  provides: [pricing-page-2-card, PricingActions-waitlist-gate]
  affects: [pricing-page, pricing-actions]
tech_stack:
  added: []
  patterns: [auth-gated-cta, client-island, waitlist-local-state]
key_files:
  created: []
  modified:
    - webapp/src/app/pricing/page.tsx
    - webapp/src/app/pricing/_components/PricingActions.tsx
decisions:
  - "2-card layout over 4-tier grid: Free (active) + Pro teaser (muted) — no price shown on either card"
  - "waitlistConfirmed is local React state only in Phase 1 — Phase 3 replaces with POST /user/waitlist"
  - "All features use CheckCircle (green) — no XCircle — per D-01 (all checkmarks, no X marks)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-16"
  tasks_completed: 2
  tasks_checkpointed: 1
  files_modified: 2
  commits: 2
---

# Phase 1 Plan 02: Pricing Page 2-Card Layout — Summary

**One-liner:** Pricing page rewritten from 4-tier LemonSqueezy grid to 2-card layout (Free active + Pro waitlist teaser) with auth-gated "Join Waitlist" CTA and all stale payment references removed.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Rewrite pricing page to 2-card layout | 0762811 | Done |
| 2 | Rewrite PricingActions with waitlist auth gate | d357f01 | Done |
| 3 | Visual verification of pricing page | — | Checkpoint — awaiting human verify |

## Verification Results

- `npx tsc --noEmit` — zero errors in plan files (pre-existing next-auth/radix-ui/vitest missing-module errors are environmental, identical to Plan 01 baseline)
- `grep starter|growth|\$29|\$79|\$149|LemonSqueezy webapp/src/app/pricing/page.tsx` — 0 matches
- `grep LS_STORE_URL|LS_VARIANT|buildCheckoutUrl|VARIANT_MAP webapp/src/app/pricing/_components/PricingActions.tsx` — 0 matches
- "Coming Soon" appears in page.tsx (JSX comment + badge text — both in the Pro card conditional block)
- `waitlistConfirmed` state present in PricingActions.tsx (state declaration + render branch)

## Checkpoint: Task 3 — Visual Verification

**Type:** checkpoint:human-verify
**Status:** Awaiting human

### What was built

- `/pricing` page rewritten from 4-tier grid (`lg:grid-cols-4`) to 2-card layout (`sm:grid-cols-2`, `max-w-3xl`)
- **Free card:** active styling (`border-[var(--brand)] ring-2 ring-[var(--brand)]/20 shadow-[var(--shadow-brand-md)]`), Sparkle icon, 4 green-checkmark features, "Get Started" button linking to `/`
- **Pro card:** muted styling (`border-[var(--outline-variant)] opacity-70`), RocketLaunch icon, "Coming Soon" badge, 4 future features, "Join Waitlist" button
- **Join Waitlist — unauthenticated:** opens `AuthModal` with `callbackUrl="/pricing"`
- **Join Waitlist — authenticated:** sets `waitlistConfirmed = true`, renders inline "You're on the list!" confirmation in `--success` color
- **FAQ section:** heading changed to "Free, with more on the way." — body removes all LemonSqueezy/billing references
- Hero subheading changed to "Find your conversion leaks. Fix what matters. Start free."

### Verification steps for human

1. Start the dev server: `cd webapp && npm run dev`
2. Visit http://localhost:3000/pricing
3. Verify layout: exactly 2 cards side-by-side on desktop, stacked on mobile
4. Left card: "Free" with Sparkle icon, active brand border, 4 green-checkmark features, "Get Started" button
5. Right card: "Pro" with RocketLaunch icon, "Coming Soon" badge, muted/grayed styling
6. Click "Get Started" — should navigate to homepage (/)
7. Click "Join Waitlist" signed out — should open AuthModal
8. Click "Join Waitlist" signed in — should show inline "You're on the list!" confirmation
9. Check FAQ section: heading "Free, with more on the way." — no LemonSqueezy reference
10. Ctrl+F for "$79", "$29", "$149", "LemonSqueezy", "Starter", "Growth" — none should appear

## Deviations from Plan

None — plan executed exactly as written. Both files were full rewrites as specified. The TypeScript `price` missing error that appeared after Task 1 (before Task 2 resolved it) is expected sequencing, not a deviation.

## Known Stubs

**PricingActions.tsx — waitlist backend call (intentional, Phase 1 design):**
- File: `webapp/src/app/pricing/_components/PricingActions.tsx`, line 63
- Stub: `// Phase 3: replace with POST /user/waitlist` — `setWaitlistConfirmed(true)` without backend persistence
- Reason: Phase 1 design decision (D-07, RESEARCH.md Pitfall 5). Waitlist confirmation is local state only. Phase 3 will wire the actual DB write. The plan explicitly documents this as intentional.
- This stub does NOT prevent the plan's goal — the auth gate and visual confirmation work correctly.

## Threat Surface

T-01-05 mitigated: All `NEXT_PUBLIC_LS_*` env var reads deleted from `PricingActions.tsx`. `LS_STORE_URL`, `LS_VARIANT_STARTER`, `LS_VARIANT_GROWTH`, `LS_VARIANT_PRO` constants and `VARIANT_MAP` record fully removed — no checkout URLs constructed or leaked to client bundle from this component.

T-01-04 accepted: `useSession()` reads existing next-auth cookie. No new auth surface introduced.

T-01-06 accepted: `waitlistConfirmed` local state resets on navigation. No rate limiting needed (no backend call in Phase 1).

## Self-Check: PASSED

- `webapp/src/app/pricing/page.tsx` — FOUND on disk
- `webapp/src/app/pricing/_components/PricingActions.tsx` — FOUND on disk
- Commit 0762811 — verified in git log
- Commit d357f01 — verified in git log
