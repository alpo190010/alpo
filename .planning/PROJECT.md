# alpo.ai

## What This Is

AI-powered Shopify product page analyzer that scores 18 conversion dimensions and estimates revenue leaks. Merchants paste a product URL, get a score out of 100, and see prioritized recommendations to improve their page. Free to use, targeting small solo Shopify merchants.

## Core Value

Merchants can instantly see what's costing them sales on their product pages — with clear, actionable recommendations they can act on today.

## Current Milestone: v1.0 Minimum Launch

**Goal:** Get first users by simplifying the product to a generous free tier with a Pro waitlist, and clean up stale positioning.

**Target features:**
- Simplified pricing page (single free plan + Pro waitlist)
- Paywall gates (unauthorized = scores only, signed up = full recommendations)
- Waitlist email capture for Pro interest
- Clean up stale docs referencing old positioning

## Requirements

### Validated

<!-- Shipped and confirmed working from milestones M020-M023 -->

- ✓ AUTH-V01: User can sign up with email/password — M020
- ✓ AUTH-V02: User can sign in with Google OAuth — M020
- ✓ AUTH-V03: User can verify email and reset password — M020
- ✓ SCAN-V01: User can paste a Shopify product URL and receive a score — M020
- ✓ SCAN-V02: System scores 18 conversion dimensions in parallel — M021
- ✓ SCAN-V03: System estimates monthly revenue loss per dimension — M020
- ✓ SCAN-V04: User sees prioritized recommendations per dimension — M020
- ✓ SCAN-V05: System caches store-level data for 7 days — M021
- ✓ PERF-V01: 18 detector chains parallelized with asyncio — M021
- ✓ PERF-V02: Server components for landing and pricing pages — M021
- ✓ UI-V01: Design system extracted with consistent tokens — M022
- ✓ INFRA-V01: Rate limiting, GZip compression, error handling — M020

### Active

<!-- Current scope for v1.0 Minimum Launch -->

- [x] Simplified pricing page — Phase 1 complete (2026-04-16)
- [x] Paywall gates for unauthorized vs signed-up users — Phase 2 complete (2026-04-16)
- [ ] Waitlist email capture for Pro
- [ ] Stale docs cleanup

### Out of Scope

<!-- Explicit boundaries with reasoning -->

- AI-generated rewrites/fixes — validate demand via waitlist first, don't build before users exist
- Subscription pricing tiers — learn from usage before committing to prices
- Monitoring/alerts — future retention feature, not needed for first users
- Competitor tracking — future feature, validate core value first
- Shopify App Store integration — standalone web app first
- Multiple pricing tiers — single free tier until we understand what people pay for

## Context

- **Tech stack:** Next.js 16 + React 19 frontend (Vercel), FastAPI + PostgreSQL backend, Playwright for page rendering
- **Scan cost:** ~$0.01/scan (all rule-based, no LLM API calls). Playwright headless browser is the main cost, amortized over a VPS.
- **Business model direction:** Free scan = hook, AI fixes = future paid product. Waitlist validates demand before building.
- **Target customer:** Small solo Shopify merchants (1-50 products), graduating to growing brands later.
- **Stale artifacts:** README.md, MARKETING.md, DASHBOARD.md, status.json still reference old "PageScore landing page analyzer" with $7 one-time pricing.

## Constraints

- **Budget**: Solo founder, minimize infrastructure spend — keep free tier costs near zero
- **Speed**: Ship minimum to get users, learn before building more
- **Tech stack**: Existing Next.js + FastAPI stack, no major changes this milestone

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Free scan as hook, AI fix as product | Market research: free graders everywhere, nobody pays for diagnosis alone | — Pending |
| Start with small Shopify merchants | Massive market, lowest quality bar, fastest feedback loops | — Pending |
| Waitlist before building Pro | Validate demand with real signal before committing engineering time | — Pending |
| Unauthorized = scores only, free = full recs | Creates natural signup motivation without crippling the experience | — Pending |
| No pricing commitment at launch | Learn from usage + waitlist interest, price based on evidence | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-16 after Phase 1 (Pricing Page) completion*
