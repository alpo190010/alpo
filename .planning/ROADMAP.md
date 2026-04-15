# Roadmap: alpo.ai

## Overview

v1.0 Minimum Launch takes an already-working analyzer and shapes it into a product ready for first users. The pricing page gets simplified to a single free plan, the results page gets gated so anonymous users have a reason to sign up, the Pro waitlist captures early demand, and stale docs get updated to reflect current positioning. All four changes are brownfield modifications — the platform exists, this milestone makes it launch-ready.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Pricing Page** - Simplify /pricing to single free plan with Pro waitlist CTA
- [ ] **Phase 2: Paywall Gates** - Gate recommendations on results page behind signup
- [ ] **Phase 3: Waitlist** - Backend + flow for Pro interest capture
- [ ] **Phase 4: Doc Cleanup** - Update stale docs to current positioning

## Phase Details

### Phase 1: Pricing Page
**Goal**: Visitors see accurate, current pricing — one free plan and a Pro waitlist signal — with no stale tier references
**Depends on**: Nothing (first phase)
**Requirements**: PRICE-01, PRICE-02, PRICE-03
**Success Criteria** (what must be TRUE):
  1. User visiting /pricing sees exactly one plan card describing the free tier (unlimited scans, full scoring, recommendations, revenue leak estimates)
  2. User sees a Pro waitlist CTA below the free plan card
  3. No mention of $79, old pricing tiers, or any paid plan is visible anywhere on /pricing
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Narrow PlanTier type to free|pro and update all 8 consumer files
- [ ] 01-02-PLAN.md — Rewrite pricing page to 2-card layout with waitlist auth gate

### Phase 2: Paywall Gates
**Goal**: Anonymous users have a clear, non-blocking reason to sign up after running a scan
**Depends on**: Phase 1
**Requirements**: GATE-01, GATE-02, GATE-03
**Success Criteria** (what must be TRUE):
  1. An anonymous user who runs a scan sees dimension scores for all 18 dimensions but no recommendation text
  2. A signed-in user who runs a scan sees all 18 dimensions with full recommendation text
  3. The results page displays a signup prompt to anonymous users explaining what they unlock by creating an account
**Plans**: TBD
**UI hint**: yes

### Phase 3: Waitlist
**Goal**: Pro interest is captured in the database and users receive immediate confirmation
**Depends on**: Phase 1
**Requirements**: WAIT-01, WAIT-02, WAIT-03
**Success Criteria** (what must be TRUE):
  1. An anonymous user clicking the Pro CTA is directed to sign up (not silently ignored)
  2. An authenticated user clicking the Pro CTA is recorded in the database with a waitlist flag on their user record
  3. After clicking the Pro CTA, a signed-in user sees a confirmation that they are on the waitlist
**Plans**: TBD

### Phase 4: Doc Cleanup
**Goal**: All stale documentation reflects current product positioning with no references to old branding or pricing
**Depends on**: Phase 3
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. README.md describes alpo.ai as a Shopify product page analyzer with a free tier, not "PageScore" or any $7 pricing
  2. MARKETING.md frames the product around conversion analysis and free access, not one-time reports
  3. DASHBOARD.md contains no references to the $7 report flow
  4. status.json contains no stale feature flags from the old positioning
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pricing Page | 0/2 | Planned | - |
| 2. Paywall Gates | 0/TBD | Not started | - |
| 3. Waitlist | 0/TBD | Not started | - |
| 4. Doc Cleanup | 0/TBD | Not started | - |
