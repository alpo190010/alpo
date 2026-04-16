# Phase 4: Doc Cleanup — Research

**Researched:** 2026-04-16
**Domain:** Documentation editing, file deletion, README authoring
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**README.md (DOCS-01)**
- D-01: Rewrite as product overview + dev setup guide. Not minimal, not just setup — describe what the product does and who it's for, then how to set it up locally.
- D-02: Describe current product only — free Shopify product page analyzer, 18 dimensions, revenue leak estimates. No mention of Pro waitlist, business model, or future plans.
- D-03: Update tech stack section to reflect actual stack: Next.js 16 + React 19, FastAPI + PostgreSQL, Playwright. Remove OpenAI, LemonSqueezy, Resend references.

**MARKETING.md (DOCS-02)**
- D-04: Delete the file entirely. All content is old PageScore/$7 copy-paste templates.

**DASHBOARD.md (DOCS-03)**
- D-05: Delete the file entirely. Contains plaintext account credentials (security concern), old $7 metrics, and irrelevant agent team tracking.
- D-06: Flag credential rotation as a follow-up action — passwords for Vercel, LemonSqueezy, Reddit, HN, PostHog are exposed in git history.

**status.json (DOCS-04)**
- D-07: Delete the file entirely from `webapp/public/`. Nothing consumes it — it was a manual tracking artifact.

### Claude's Discretion
- README env vars: read from codebase to determine which environment variables are currently needed and document those
- README structure/sections: organize product overview and setup in a clean, standard format
- Whether any other files reference the deleted files (imports, links) and need cleanup
- Git operations for file deletion (ensure clean removal)

### Deferred Ideas (OUT OF SCOPE)
- Rotate credentials exposed in git history (Vercel, LemonSqueezy, Reddit, HN, PostHog passwords from DASHBOARD.md)
- Consider git history rewrite to remove credential exposure if repo becomes public
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCS-01 | README.md updated with current positioning (Shopify product page analyzer, free tier) | Verified current README is stale (line 1: "PageScore — AI Landing Page Analyzer"). Accurate product content sourced from PROJECT.md and pricing page. Env var inventory complete. |
| DOCS-02 | MARKETING.md updated with current product framing | Decision D-04 locks this as a deletion, not an update. File confirmed stale (line 1: "PageScore Marketing — Ready-to-Post Content"). |
| DOCS-03 | DASHBOARD.md updated to remove $7 report flow references | Decision D-05 locks this as a deletion. File confirmed stale (line 1: "PageScore — Founder Dashboard"). Contains credential exposure risk. |
| DOCS-04 | status.json updated to remove old feature flags | Decision D-07 locks this as a deletion. File confirmed present at `webapp/public/status.json`. No code fetches it. |
</phase_requirements>

---

## Summary

Phase 4 is a pure documentation and file-management phase. No application code changes. The task set is: rewrite one file (README.md) and delete three files (MARKETING.md, DASHBOARD.md, webapp/public/status.json). All decisions are locked by CONTEXT.md — there are no architecture choices to make.

The primary execution risk is the README rewrite requiring accurate technical content. All source material has been verified from the live codebase: the correct tech stack, env var names, and product description are documented below so the implementing agent does not need to re-read source files.

The secondary risk is accidentally leaving the `.env.local.example` file with stale descriptions (it currently mentions "OpenAI - powers the AI analysis" and "LemonSqueezy - payment processing for paid reports" and "Resend - email delivery for paid reports"). This file is in scope as a discretionary call — the descriptions should be updated to match current reality, even though the var names remain the same.

**Primary recommendation:** Execute all four DOCS requirements as three deletion tasks + one rewrite task, with the rewrite sourcing content exclusively from verified codebase facts documented in this research.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| README rewrite | Repo root (docs) | — | README.md lives at root, consumed by developers and GitHub visitors |
| MARKETING.md deletion | Repo root (docs) | — | Flat file at root, no imports or links reference it |
| DASHBOARD.md deletion | Repo root (docs) | — | Flat file at root, no imports or links reference it |
| status.json deletion | webapp/public (static assets) | — | Verified: no frontend code fetches this file |

---

## Current State Inventory (Verified)

### Files to Delete

| File | Path | Confirmed Stale | Safe to Delete |
|------|------|-----------------|----------------|
| MARKETING.md | `/MARKETING.md` | Yes — line 1: "PageScore Marketing" | Yes — no code imports or links to it [VERIFIED: grep search] |
| DASHBOARD.md | `/DASHBOARD.md` | Yes — line 1: "PageScore — Founder Dashboard" | Yes — no code imports or links to it [VERIFIED: grep search] |
| status.json | `/webapp/public/status.json` | Yes — confirmed stale artifact | Yes — no webapp source file fetches `/status.json` [VERIFIED: grep of webapp/src for "status.json" returned no matches] |

### File to Rewrite

| File | Path | Current State |
|------|------|---------------|
| README.md | `/README.md` | Line 1: "PageScore — AI Landing Page Analyzer" — fully stale |

### File Needing Description Updates (Discretionary)

| File | Path | Issue |
|------|------|-------|
| .env.local.example | `/.env.local.example` | Comments describe OpenAI, LemonSqueezy, Resend as active services for "AI analysis", "payment processing", "email delivery for paid reports" — these descriptions are stale even though the var names remain |

---

## README Content: Verified Source Material

All content below was read directly from the codebase. [VERIFIED: PROJECT.md, pricing/page.tsx, api/app/config.py, docker-compose.yml, .env.production.template]

### Product Description (from PROJECT.md)

> AI-powered Shopify product page analyzer that scores 18 conversion dimensions and estimates revenue leaks. Merchants paste a product URL, get a score out of 100, and see prioritized recommendations to improve their page. Free to use, targeting small solo Shopify merchants.

**What it does:**
- User pastes a Shopify product URL
- Receives a score out of 100
- Sees 18 dimension scores with revenue leak estimates
- Gets prioritized recommendations (signed-in users only — free tier)

**Who it's for:** Small solo Shopify merchants (1–50 products)

**Scan cost:** ~$0.01/scan — all rule-based, no LLM API calls in the core scan path. Playwright headless browser is the main cost.

### Actual Tech Stack (from PROJECT.md + codebase)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + React 19 (deployed on Vercel) |
| Backend API | FastAPI + Python |
| Database | PostgreSQL |
| Page rendering | Playwright (headless browser for product page scraping) |
| Auth | NextAuth.js (email/password + Google OAuth) |
| Analytics | PostHog |
| Reverse proxy | Caddy |
| Containerization | Docker Compose |

**NOT in the tech stack (remove from README):**
- OpenAI — the env var `OPENAI_API_KEY` exists but it keys into OpenRouter, not OpenAI directly. The core scan is rule-based; LLM is used only for non-core competitor analysis features.
- LemonSqueezy — integration exists but is dormant (no paid tier at launch)
- Resend — email service exists in config but only used for dormant paid report flow

### Env Vars for Dev Setup

These are the env vars a developer actually needs for local development. [VERIFIED: .env.local (keys), webapp/.env.local (keys), docker-compose.yml, .env.production.template]

**Root `.env` (used by Docker Compose for all services):**

| Variable | Required | Purpose |
|----------|----------|---------|
| `POSTGRES_USER` | Yes | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `POSTGRES_DB` | Yes | PostgreSQL database name |
| `DATABASE_URL` | Yes | Full PostgreSQL connection string |
| `DB_SSL` | No (default: false) | SSL for DB connection |
| `AUTH_SECRET` | Yes | NextAuth.js signing secret |
| `AUTH_GOOGLE_ID` | Yes | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth client secret |
| `AUTH_TRUST_HOST` | No (default: true) | NextAuth host trust |
| `NEXT_PUBLIC_API_URL` | Yes | URL the webapp uses to reach the FastAPI backend |
| `NEXT_PUBLIC_BASE_URL` | Yes | Public base URL for the webapp |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | PostHog analytics key |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | PostHog host |
| `CORS_ORIGINS` | No (default: localhost:3000) | Allowed CORS origins for API |
| `WEBAPP_URL` | No (default: localhost:3000) | API uses this for redirect URLs |

**Dormant (present but not needed to run core product):**
- `OPENAI_API_KEY` — OpenRouter key for non-core LLM features
- `RESEND_API_KEY` — Email delivery (unused at launch)
- `LEMONSQUEEZY_WEBHOOK_SECRET` — Payment webhooks (no paid tier yet)
- `LEMONSQUEEZY_VARIANT_*` — Payment tier IDs (no paid tier yet)

### Project Structure (for README dev setup section)

```
alpo/
├── webapp/          # Next.js 16 + React 19 frontend
├── api/             # FastAPI Python backend
├── docs/            # Infrastructure setup guides
├── scripts/         # Provision and verify scripts
├── docker-compose.yml          # Local dev (all services)
├── docker-compose.prod.yml     # Production Docker Compose
├── Caddyfile        # Reverse proxy config
└── .env             # Environment variables (copy from .env.production.template)
```

**Local dev commands:** [ASSUMED — not verified against package.json / Makefile. Implementing agent should verify before writing to README.]

---

## Architecture Patterns

### README Structure (Claude's Discretion)

Standard open-source project README pattern for a SaaS tool:

```markdown
# Product Name — One-line description

Brief product description (2–3 sentences: what it does, who it's for)

## Features
- Bullet list of what's live today

## Tech Stack
| Layer | Technology |
...

## Getting Started
### Prerequisites
### Installation / Setup
### Environment Variables

## Development
### Running Locally
```

This is a dev-facing README (no marketing fluff), so the tone should be direct and factual.

### File Deletion Pattern

Use `git rm` not `rm` to ensure the deletion is staged properly for commit:

```bash
git rm MARKETING.md
git rm DASHBOARD.md
git rm webapp/public/status.json
```

This stages the removal in git so the commit reflects a proper tracked deletion rather than an untracked removal.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Verifying no code references deleted files | Manual inspection | `grep -r "status.json" webapp/src/` — already done, confirmed clean |
| Accurate product description | Guess or recall | Draw from PROJECT.md verbatim |
| Accurate env var list | Guess | Draw from the verified table in this RESEARCH.md |

---

## Runtime State Inventory

> This is a rename/cleanup phase — stale string "PageScore" and "$7" appear in documentation files, not in runtime systems.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — no database stores "PageScore" as a key or collection name | None |
| Live service config | None — no external service dashboard uses PageScore branding | None |
| OS-registered state | None — no Task Scheduler or systemd units reference PageScore | None |
| Secrets/env vars | None — env var names are product-neutral (`DATABASE_URL`, `AUTH_SECRET`, etc.) | None |
| Build artifacts | None — no compiled artifacts carry PageScore name | None |

**Result:** All stale branding is confined to flat documentation files. No runtime migration needed.

---

## Common Pitfalls

### Pitfall 1: Writing README Env Vars From Memory
**What goes wrong:** README documents env vars like `OPENAI_API_KEY` with the comment "OpenAI API key for AI analysis" — matching the stale `.env.local.example`. Developer sets up OpenAI account when they actually need an OpenRouter key (or nothing, for the core scan path).
**Why it happens:** The env var *name* is OPENAI_API_KEY, but the *service* is OpenRouter. Easy to copy-paste the misleading comment.
**How to avoid:** Use the verified env var table in this research. For the README, `OPENAI_API_KEY` should be described as "OpenRouter API key (used for optional AI features)" or omitted from the required list entirely since core scans are rule-based.
**Warning signs:** README says "OpenAI" anywhere in env var descriptions.

### Pitfall 2: Forgetting .env.local.example Is Also Stale
**What goes wrong:** README.md gets updated, but `.env.local.example` still says "OpenAI - powers the AI analysis", "Resend - email delivery for paid reports", "LemonSqueezy - payment processing". A developer following the example file gets a misleading picture.
**Why it happens:** `.env.local.example` was not listed in the canonical refs section of CONTEXT.md. It is easy to overlook.
**How to avoid:** Update the comments in `.env.local.example` as part of DOCS-01 execution to describe what these services actually do (or mark them as dormant).

### Pitfall 3: Using `rm` Instead of `git rm` for Deletions
**What goes wrong:** Files are deleted with `rm` but the deletion is not staged, so the subsequent commit misses the deletion or requires a separate `git add` step that is easy to forget.
**How to avoid:** Use `git rm MARKETING.md DASHBOARD.md webapp/public/status.json` — stages and removes in one step.

### Pitfall 4: Over-Describing Future Plans in README
**What goes wrong:** README mentions Pro waitlist, AI fixes, or business model — things D-02 explicitly excludes.
**Why it happens:** PROJECT.md includes future plans; an agent reading it broadly may include them.
**How to avoid:** CONTEXT.md D-02 is explicit: "No mention of Pro waitlist, business model, or future plans." README describes only what is live today.

---

## Environment Availability

> Step 2.6: SKIPPED — Phase 4 is purely documentation editing and file deletion. No external services, runtimes, databases, or CLI tools beyond standard git are required.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set to false in config.json (key absent) — validation section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None applicable — this is a documentation phase |
| Quick run command | Manual review: `grep -r "PageScore\|\$7\|LemonSqueezy\|OpenAI" README.md MARKETING.md DASHBOARD.md webapp/public/status.json 2>/dev/null` |
| Full check command | `ls MARKETING.md DASHBOARD.md webapp/public/status.json 2>/dev/null && echo "FILES STILL EXIST - DELETE FAILED" || echo "Files deleted successfully"` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Automatable? |
|--------|----------|-----------|-------------------|-------------|
| DOCS-01 | README describes alpo.ai as Shopify analyzer with free tier, no PageScore/$7 refs | Manual | `grep -i "pagescore\|\\\$7\|one-time" README.md` — expect 0 matches | Partial (grep) |
| DOCS-02 | MARKETING.md does not exist | Automated | `test ! -f MARKETING.md && echo PASS` | Yes |
| DOCS-03 | DASHBOARD.md does not exist | Automated | `test ! -f DASHBOARD.md && echo PASS` | Yes |
| DOCS-04 | webapp/public/status.json does not exist | Automated | `test ! -f webapp/public/status.json && echo PASS` | Yes |

### Wave 0 Gaps

None — no test framework installation required. Verification is via file existence checks and grep, both available in standard shell.

---

## Security Domain

### ASVS Categories

| ASVS Category | Applies | Notes |
|---------------|---------|-------|
| V2 Authentication | No | No auth code touched |
| V3 Session Management | No | No session code touched |
| V4 Access Control | No | No access control touched |
| V5 Input Validation | No | No user input processing |
| V6 Cryptography | No | No crypto touched |

### Credential Exposure (DASHBOARD.md Deletion)

**Risk:** DASHBOARD.md contains plaintext passwords for Vercel, LemonSqueezy, Reddit, HN, PostHog. Deleting the file removes the credentials from the working tree but NOT from git history.

**In scope:** Delete the file (removes from working tree and future clones once pushed).

**Out of scope (deferred):** Git history rewrite to remove credentials from past commits. This is explicitly deferred per CONTEXT.md.

**Planner note:** The commit message for DASHBOARD.md deletion should NOT quote or reference the credential values. A simple "delete stale founder dashboard (security cleanup)" is sufficient.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Local dev startup commands (e.g., `npm run dev`, `uvicorn`) are standard and don't require special flags | README Content | README would document wrong startup commands — implementing agent should verify against package.json and api startup scripts before writing |
| A2 | `.env.local.example` descriptions should be updated as part of DOCS-01 (Claude's Discretion) | Current State Inventory | If planner excludes this, a stale example file remains. Low risk since it's just comments. |

---

## Open Questions (RESOLVED)

1. **(RESOLVED)** **Does `.env.local.example` get updated?**
   - What we know: File has stale service descriptions matching old positioning (OpenAI, Resend, LemonSqueezy described as active).
   - What's unclear: CONTEXT.md did not explicitly include it in scope, but it falls under "Claude's Discretion — README env vars" since it is the env var template developers follow.
   - Recommendation: Include it. It is a 5-line comment update, not a structural change.
   - **Resolution:** Included as 04-02-PLAN Task 2. Comments updated to mark OpenAI/LemonSqueezy/Resend as dormant.

2. **(RESOLVED)** **What are the actual local dev startup commands?**
   - What we know: webapp is Next.js (likely `npm run dev`), api is FastAPI (likely `uvicorn` or similar).
   - What's unclear: Exact flags, whether a Makefile or script wraps them.
   - Recommendation: Implementing agent should read `webapp/package.json` scripts and `api/` startup config before writing the "Running Locally" section.
   - **Resolution:** Verified in PATTERNS.md. Startup commands confirmed: `npm run dev` (port 3005), `uvicorn app.main:app` (port 8000), `docker compose up` (full stack). 04-02-PLAN Task 1 `read_first` includes package.json and Dockerfile verification.

---

## Sources

### Primary (HIGH confidence)
- `/Users/aleksandrephatsatsia/projects/alpo/.planning/PROJECT.md` — product description, tech stack, constraints
- `/Users/aleksandrephatsatsia/projects/alpo/.planning/phases/04-doc-cleanup/04-CONTEXT.md` — locked decisions
- `/Users/aleksandrephatsatsia/projects/alpo/docker-compose.yml` — env var declarations for all services
- `/Users/aleksandrephatsatsia/projects/alpo/.env.production.template` — production env var reference
- `/Users/aleksandrephatsatsia/projects/alpo/api/app/config.py` — FastAPI settings model (source of truth for API env vars)
- `/Users/aleksandrephatsatsia/projects/alpo/webapp/src/app/pricing/page.tsx` — current free tier feature list

### Secondary (MEDIUM confidence)
- grep results confirming no webapp source references `status.json`, `MARKETING.md`, or `DASHBOARD.md`
- grep results confirming `OPENAI_API_KEY` points to OpenRouter, not OpenAI directly

### Tertiary (LOW confidence / Assumed)
- A1: Standard Next.js and FastAPI startup commands assumed — needs verification by implementing agent

---

## Metadata

**Confidence breakdown:**
- Deletion safety (no references): HIGH — verified via grep
- README content accuracy: HIGH — sourced from live codebase files
- Env var inventory: HIGH — cross-referenced against config.py, docker-compose.yml, .env.production.template, .env.local keys
- Local dev commands: LOW — not verified, flagged as open question

**Research date:** 2026-04-16
**Valid until:** Stable — documentation phases don't have version drift concerns
