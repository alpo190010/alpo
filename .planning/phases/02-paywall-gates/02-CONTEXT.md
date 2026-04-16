# Phase 2: Paywall Gates - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Gate recommendations on the results page behind signup. Anonymous users run a real scan and see dimension scores, revenue loss estimates, and overall score — but recommendation text is hidden behind collapsed locked cards. Signing up (free account) unlocks everything. There is no paid tier — the gate is signup, not payment.

</domain>

<decisions>
## Implementation Decisions

### Anonymous scan behavior
- **D-01:** Anonymous users trigger a real backend scan of their actual URL — no more fake SAMPLE_SCAN data. They see their real scores for their real page.
- **D-02:** IP-based rate limiting for unauthenticated scans: 3 scans per day. Uses existing rate limiting infra.
- **D-03:** Anonymous users see full revenue loss estimates (PluginCTACard with dollar loss calculation). Not hidden behind signup.
- **D-04:** Anonymous users see full ScoreRing (animated score, summary text, category breakdown, leak count). Not hidden behind signup.

### Locked card presentation
- **D-05:** Locked IssueCards show dimension name, score number, and impact badge only. No recommendation text, no blur, no teaser line. Clean collapsed card with a lock icon and "Sign up to see fixes" text.
- **D-06:** Locked cards are clickable — clicking opens AuthModal directly (signup flow). Every locked card is a conversion point.
- **D-07:** Authenticated free users see full inline expansion with signal checklists when clicking cards. `getDimensionAccess()` returns "unlocked" for all dimensions when authenticated (flip current behavior: free = unlocked, not locked).

### Signup prompt placement
- **D-08:** Inline CTA card as the last item in the issue cards grid for anonymous users. Replaces/adapts existing CTACard component. Feels native to the layout.
- **D-09:** Problem-aware copy using dynamic data: "Your page has {N} issues. Sign up free to see how to fix them." Personalized to their actual scan.
- **D-10:** Remove the bottom gradient banner section for anonymous users. Single conversion point via the inline CTA card in the grid. Less repetitive, cleaner.

### PaywallModal removal
- **D-11:** Clicking locked cards or inline CTA opens AuthModal directly — no intermediate PaywallModal step. AuthModal already handles email/password + Google OAuth.
- **D-12:** Delete PaywallModal.tsx entirely and remove all imports/references across the codebase. There is no paywall — it's a signup gate.
- **D-13:** After signup, the page auto-refreshes to show unlocked results. useSession already watches auth status changes, so the existing effect re-runs with `status === "authenticated"`.
- **D-14:** Credit exhaustion screen changes "Upgrade Plan" to "Join Pro Waitlist" with a link to /pricing. No PaywallModal needed.

### Claude's Discretion
- Exact locked card styling (colors, spacing, lock icon size/placement within the collapsed card)
- AuthModal callbackUrl configuration for returning to the results page post-signup
- Rate limiting implementation approach (backend middleware vs. frontend check vs. both)
- Whether SAMPLE_SCAN / sample-data.ts should be removed or kept for dev/test purposes
- How the "Scan Another" CTA section works for anonymous users after removing the bottom banner

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Results page
- `webapp/src/app/analyze/page.tsx` — Main results page with all gating logic, session checks, scan flow, and card rendering. Primary file to modify.

### Tier gating system
- `webapp/src/lib/analysis/conversion-model.ts` — `getDimensionAccess()` function (line 51). Must flip: free = unlocked (currently free = locked).
- `webapp/src/lib/analysis/types.ts` — `PlanTier` type definition (line 9). Already correct: `"free" | "pro"`.
- `webapp/src/lib/analysis/helpers.ts` — Re-exports PlanTier and getDimensionAccess.
- `webapp/src/lib/analysis/__tests__/tier-gating.test.ts` — Tier gating tests. Must be updated to match new behavior.

### Components to modify
- `webapp/src/components/analysis/IssueCard.tsx` — Locked/expandable card. Locked state needs redesign to collapsed score-only view.
- `webapp/src/components/analysis/CTACard.tsx` — Inline CTA card. Needs anonymous-specific problem-aware copy.
- `webapp/src/components/analysis/ScoreRing.tsx` — Score display. No changes needed — stays visible for anonymous.
- `webapp/src/components/analysis/PluginCTACard.tsx` — Revenue loss card. No changes needed — stays visible for anonymous.

### Components to delete
- `webapp/src/components/PaywallModal.tsx` — To be deleted entirely. All references must be removed.

### Auth system
- `webapp/src/components/AuthModal.tsx` — Signup/signin modal. Becomes the sole gate for anonymous users.

### Sample data
- `webapp/src/lib/sample-data.ts` — SAMPLE_SCAN constant. May become unused after anonymous users get real scans.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **AuthModal**: Already built with dynamic import, handles email/password + Google OAuth. Currently used for teaser sign-in.
- **IssueCard `locked` prop**: Already exists and renders a lock icon. Needs visual redesign but the prop/logic infrastructure is in place.
- **CTACard component**: Already renders an inline card in the grid for free/teaser users. Needs copy changes for anonymous mode.
- **useSession hook**: Already used in analyze page to distinguish authenticated vs anonymous. Re-runs effects on status change.
- **`getDimensionAccess()` function**: Already exists with plan-based gating logic. Just needs the return values flipped for free tier.
- **Rate limiting**: Backend already returns 429 for rate limit violations. Frontend already handles 429 errors with user-friendly messages.

### Established Patterns
- Server-driven scan with client-side session checks (useSession + authFetch)
- Dynamic imports for modals (`dynamic(() => import(...), { ssr: false })`)
- CSS custom properties for theming (--brand, --surface, --gradient-primary)
- Reveal animation sequence (showCard → showRevenue → showLeaks with staggered timeouts)
- `captureEvent()` for analytics tracking on user interactions

### Integration Points
- `analyze/page.tsx` useEffect (line 89): Session-aware scan flow — needs to allow unauthenticated backend calls
- `analyze/page.tsx` leaks grid (line 350): dimAccess calculation — needs to use auth status, not plan tier
- Backend `/analyze` endpoint: Currently requires auth (authFetch). Needs unauthenticated path with IP rate limiting.
- Backend `/analysis` cache endpoint: Currently public (fetch without auth). May already work for anonymous cache hits.

</code_context>

<specifics>
## Specific Ideas

- Anonymous users should see their real scan results — the hook is showing them their actual problems, not fake data
- Locked cards should feel clean and minimal, not cluttered — score + impact + lock, nothing else
- The inline CTA card should reference the user's actual issue count for personalization
- After signup, the experience should feel seamless — page just "unlocks" without a full reload feel

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-paywall-gates*
*Context gathered: 2026-04-16*
