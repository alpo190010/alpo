# Phase 2: Paywall Gates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 02-paywall-gates
**Areas discussed:** Anonymous scan behavior, Locked card presentation, Signup prompt placement, PaywallModal repurpose

---

## Anonymous scan behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Real scan | Anonymous users hit real backend, see actual scores for their URL. Costs ~$0.01/scan. | ✓ |
| Keep sample data | Anonymous users still see SAMPLE_SCAN fake results. Cheaper but meaningless. | |
| Real scan, limited dimensions | Run real scan but only show subset of dimensions. | |

**User's choice:** Real scan
**Notes:** Strongest conversion hook — user sees their actual problems.

| Option | Description | Selected |
|--------|-------------|----------|
| IP-based, 3/day | 3 scans per day per IP for unauthenticated users. | ✓ |
| IP-based, 1/day | Stricter — one free anonymous scan per day. | |
| No limit for anonymous | Rely on general rate limiting only. | |
| You decide | Claude picks. | |

**User's choice:** IP-based, 3/day

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show dollar loss | Anonymous users see revenue leak estimates. Strongest urgency hook. | ✓ |
| Scores only, no dollar loss | Hide revenue estimates behind signup. | |
| You decide | Claude picks. | |

**User's choice:** Yes, show dollar loss

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, full ScoreRing | Animated score ring with overall score, summary, leak count. | ✓ |
| Score number only | Score number without summary text or category breakdown. | |
| You decide | Claude picks. | |

**User's choice:** Yes, full ScoreRing

---

## Locked card presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Blurred recommendations | Card shows score normally, recommendation text blurred with CSS filter. | |
| Collapsed with score only | Card shows dimension name, score, impact badge only. No recommendation text. | ✓ |
| Teaser line + lock | Score + one truncated line of recommendation then lock overlay. | |

**User's choice:** Collapsed with score only
**Notes:** Cleaner, less cluttered. Lock icon + "Sign up to see fixes" text.

| Option | Description | Selected |
|--------|-------------|----------|
| Clickable, opens signup | Clicking locked card opens AuthModal. Every card is a conversion point. | ✓ |
| Static, not clickable | Display-only locked cards. | |
| You decide | Claude picks. | |

**User's choice:** Clickable, opens signup

| Option | Description | Selected |
|--------|-------------|----------|
| Expand inline | Free authenticated users get full inline expansion with signal checklists. | ✓ |
| Keep current modal behavior | Clicking opens a detail modal instead. | |
| You decide | Claude picks. | |

**User's choice:** Expand inline

---

## Signup prompt placement

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom banner (keep current) | Full-width gradient banner below issue cards. | |
| Inline card in grid | CTA card as last item in issue grid. Feels native. | ✓ |
| Both: inline + bottom | Double signup touchpoints. | |

**User's choice:** Inline card in grid

| Option | Description | Selected |
|--------|-------------|----------|
| Problem-aware | Dynamic copy: "Your page has {N} issues. Sign up free to see how to fix them." | ✓ |
| Generic value prop | Static copy about value proposition. | |
| You decide | Claude picks. | |

**User's choice:** Problem-aware

| Option | Description | Selected |
|--------|-------------|----------|
| Remove bottom banner | Only inline CTA card. Single conversion point. | ✓ |
| Keep but simplify | Simplified single-line banner alongside inline CTA. | |
| You decide | Claude picks. | |

**User's choice:** Remove bottom banner

---

## PaywallModal repurpose

| Option | Description | Selected |
|--------|-------------|----------|
| Open AuthModal directly | Skip PaywallModal, open AuthModal on locked card click. | ✓ |
| Keep PaywallModal as value pitch | Two-step: PaywallModal value pitch → AuthModal signup. | |
| You decide | Claude picks. | |

**User's choice:** Open AuthModal directly

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Remove PaywallModal.tsx and all references. No paywall exists. | ✓ |
| Keep as empty shell | Gut content but keep file for future Pro flows. | |
| You decide | Claude decides based on import count. | |

**User's choice:** Delete it

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-refresh results | Page detects new session and re-fetches with auth. Seamless. | ✓ |
| Success toast, then refresh | Brief "Welcome!" toast before refresh. | |
| You decide | Claude picks. | |

**User's choice:** Auto-refresh results

| Option | Description | Selected |
|--------|-------------|----------|
| "Join Pro Waitlist" | Credit exhaustion CTA links to /pricing for waitlist. | ✓ |
| Remove credit exhaustion screen | Simpler "check back next month" message. | |
| You decide | Claude picks. | |

**User's choice:** "Join Pro Waitlist"

---

## Claude's Discretion

- Exact locked card styling (colors, spacing, lock icon placement)
- AuthModal callbackUrl configuration
- Rate limiting implementation details
- SAMPLE_SCAN / sample-data.ts retention decision
- "Scan Another" CTA for anonymous users

## Deferred Ideas

None — discussion stayed within phase scope
