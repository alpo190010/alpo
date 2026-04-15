# Requirements: alpo.ai

**Defined:** 2026-04-15
**Core Value:** Merchants can instantly see what's costing them sales on their product pages — with clear, actionable recommendations they can act on today.

## v1.0 Requirements

Requirements for minimum launch. Each maps to roadmap phases.

### Pricing Page

- [ ] **PRICE-01**: User sees a single free plan card (unlimited scans, full scoring, recommendations, revenue leak estimates)
- [ ] **PRICE-02**: User sees a Pro waitlist CTA below the free plan
- [ ] **PRICE-03**: Old pricing tiers and $79 references are removed

### Paywall Gates

- [ ] **GATE-01**: Unauthorized user sees dimension scores but not recommendations on results page
- [ ] **GATE-02**: Signed-in user sees all 18 dimensions with full recommendations
- [ ] **GATE-03**: Results page shows a signup prompt nudging anonymous users to create an account

### Waitlist

- [ ] **WAIT-01**: Clicking Pro CTA prompts user to sign up if not authenticated
- [ ] **WAIT-02**: System records in database which authenticated users clicked Pro (waitlist flag)
- [ ] **WAIT-03**: User sees confirmation that they're on the Pro waitlist after clicking

### Doc Cleanup

- [ ] **DOCS-01**: README.md updated with current positioning (Shopify product page analyzer, free tier)
- [ ] **DOCS-02**: MARKETING.md updated with current product framing
- [ ] **DOCS-03**: DASHBOARD.md updated to remove $7 report flow references
- [ ] **DOCS-04**: status.json updated to remove old feature flags

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### AI Fix Layer

- **FIX-01**: User receives AI-generated rewrite for product description
- **FIX-02**: User receives AI-generated title optimization
- **FIX-03**: User can copy/paste AI-generated fixes directly

### Monitoring

- **MON-01**: System automatically rescans products weekly
- **MON-02**: User receives alerts when scores drop
- **MON-03**: User sees score history over time

### Competitor Intelligence

- **COMP-01**: User can compare product page scores against competitors
- **COMP-02**: User receives alerts when competitor pages change

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI-generated rewrites/fixes | Validate demand via waitlist first — don't build before users exist |
| Subscription pricing tiers | Learn from usage before committing to prices |
| Monitoring/alerts | Future retention feature, not needed for first users |
| Competitor tracking | Future feature, validate core value first |
| Shopify App Store listing | Standalone web app first, app store later |
| Confirmation email for waitlist | Simple in-app confirmation is sufficient for now |
| Payment integration changes | No paid tier yet, Lemon Squeezy integration can stay dormant |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRICE-01 | — | Pending |
| PRICE-02 | — | Pending |
| PRICE-03 | — | Pending |
| GATE-01 | — | Pending |
| GATE-02 | — | Pending |
| GATE-03 | — | Pending |
| WAIT-01 | — | Pending |
| WAIT-02 | — | Pending |
| WAIT-03 | — | Pending |
| DOCS-01 | — | Pending |
| DOCS-02 | — | Pending |
| DOCS-03 | — | Pending |
| DOCS-04 | — | Pending |

**Coverage:**
- v1.0 requirements: 12 total
- Mapped to phases: 0
- Unmapped: 12

---
*Requirements defined: 2026-04-15*
*Last updated: 2026-04-15 after initial definition*
