# Architecture

**Analysis Date:** 2026-04-11

## Pattern Overview

**Overall:** Full-stack deterministic scoring system with strict separation between frontend UI (Next.js), scoring orchestration (FastAPI), and concurrent detector services.

**Key Characteristics:**
- Detector-Rubric pattern: 18 specialized detector services extract signals → specialized rubric services score 0-100 → categorized results combined into weighted overall score
- Concurrent processing: All 18 category scoring chains run in parallel via `asyncio.gather()` (threads for sync detectors, async for API calls)
- Multi-tier caching: StoreAnalysis cache (7-day TTL for store-wide dimensions) + ProductAnalysis cache (per-URL per-user)
- Deterministic scoring only: No LLM inference in main scoring loop (removed OpenRouter AI calls) — all signals extracted from DOM
- Cross-domain isolation: Frontend never calls detector services directly; all backend routing through FastAPI gateway with JWT auth, rate limiting, credit checks

## Layers

**Presentation Layer (Next.js Frontend):**
- Purpose: User interface for URL submission, score visualization, tier-gated feature access, billing/auth flows
- Location: `webapp/src/app/`, `webapp/src/components/`
- Contains: Server/client components, pages, layout, auth modals, analysis UI, sidebar, pricing
- Depends on: NextAuth (v5 beta), PostHog analytics, Tailwind CSS, Radix UI, Phosphor icons
- Used by: End users via HTTP (port 3000)

**API Gateway Layer (FastAPI):**
- Purpose: Route requests, validate inputs (SSRF-safe URL validation), enforce authentication, implement rate limiting, manage session state, orchestrate detector chains
- Location: `api/app/main.py`, `api/app/routers/`
- Contains: Router definitions for /analyze, /health, /auth_routes, /admin_*, /webhook, /user_*, /store, /discover_products
- Depends on: SQLAlchemy ORM, PostgreSQL, detector/rubric services, Playwright renderer, OpenRouter SDK (backup)
- Used by: Next.js frontend, webhooks (LemonSqueezy)

**Scoring Orchestration Layer (Service Layer):**
- Purpose: Coordinate detector → rubric → score → tips chains for all 18 categories; implement caching logic; compute weighted final score
- Location: `api/app/routers/analyze.py` (main orchestration), `api/app/services/scoring.py` (weighted score logic)
- Contains: `_run_chain()` helper (runs detect → score → tips in thread pool), `_do_analyze()` async orchestration
- Depends on: All 18 detector/rubric service pairs, page renderer, optional async API callers (PageSpeed, AI Discoverability, Content Freshness)
- Used by: POST /analyze endpoint

**Detector Services (Signal Extraction):**
- Purpose: Extract domain-specific signals from HTML via DOM parsing, Playwright measurements, external API calls, or regex analysis
- Location: `api/app/services/*_detector.py` (18 files: title, images, pricing, social_proof, checkout, shipping, description, trust, mobile_cta, page_speed, cross_sell, variant_ux, size_guide, ai_discoverability, content_freshness, accessibility, social_commerce, structured_data)
- Contains: One `@dataclass` Signals class per detector + pure detection function `detect_*()` that returns Signals
- Examples: `title_detector.py` extracts H1, meta title, brand, keyword stuffing flags; `images_detector.py` counts images, detects zoom, lifestyle shots; `social_proof_detector.py` finds review count, rating, UGC, testimonials
- Depends on: BeautifulSoup (DOM parsing), Playwright (page rendering), regex patterns, JSON-LD schema extraction
- Used by: Rubric services and orchestration layer

**Rubric Services (Signal → Score → Tips):**
- Purpose: Convert detector signals into 0-100 scores via weighted criteria + generate up to 3 actionable tips ordered by impact
- Location: `api/app/services/*_rubric.py` (18 files, one per detector)
- Contains: `score_*()` function (sums weighted criteria), `get_*_tips()` function (returns tips from ordered rule list)
- Example: `title_rubric.py` awards 20pts for H1 present, 10pts for single H1, 10pts for H1 length ≤ 80 chars, 10pts for meta title ≤ 60, 15pts for brand in title, etc. Tips are triggered by signal conditions.
- Pattern: All scoring is additive with min/max clamping to [0, 100]
- Depends on: Corresponding detector Signals dataclass
- Used by: Scoring orchestration layer

**Data Persistence Layer:**
- Purpose: Store user accounts, subscription state, analysis results, reports, scan history
- Location: `api/app/models.py` (SQLAlchemy ORM), `api/app/database.py` (connection)
- Contains: User, ProductAnalysis, StoreAnalysis, Scan, Report, Store, StoreProduct models
- Key relationships: User → ProductAnalysis (many), User → StoreAnalysis (many), User → Scan (many), Store → StoreProduct (many)
- Key features: UUID primary keys, JSONB columns for categories/tips/signals, unique constraints for cache keys (product_url+user_id, store_domain+user_id)
- Depends on: PostgreSQL 16, Alembic migrations (`api/alembic/versions/`)
- Used by: All routers and services

**Authentication & Authorization Layer:**
- Purpose: Manage user registration, JWT validation, email verification, password reset, OAuth (Google), role-based access control
- Location: `api/app/auth.py`, `api/app/routers/auth_routes.py`, `webapp/src/app/api/auth/`
- Contains: NextAuth v5 middleware on frontend, JWT token generation/validation on backend, email verification tokens, password reset tokens
- Features: Google OAuth, email/password signup, email verification required before analysis, password hashing (argon2)
- Depends on: NextAuth, jsonwebtoken library, Resend (email), PostgreSQL for user storage
- Used by: Protected endpoints (require current_user dependency)

**External Integrations Layer:**
- Purpose: Call third-party services for enrichment data, billing, email, analytics
- Location: `api/app/services/openrouter.py`, `api/app/services/page_speed_api.py`, `api/app/services/ai_discoverability_api.py`, `api/app/services/content_freshness_api.py`, `api/app/services/email_sender.py`
- Services: PageSpeed Insights API, AI Discoverability API, Content Freshness API, OpenRouter (LLM backup), Resend (email), LemonSqueezy (billing), PostHog (analytics)
- Used by: Detector layer, auth layer, webhook handlers

## Data Flow

**Synchronous User Scan (Happy Path):**

1. User pastes URL in `/analyze` page
2. Frontend POSTs to `/analyze` with `{url}`
3. FastAPI validates URL (SSRF checks), checks auth/credits, acquires dedup lock
4. Renders page HTML with Playwright (375×812 mobile viewport for CTA)
5. Launches parallel async/sync chains:
   - `render_page()` → HTML
   - `measure_mobile_cta()` → CTA metrics (above-fold, sticky)
   - `run_axe_scan()` → A11y violations (if store_cache miss)
   - `fetch_ai_discoverability_data()` → external API call (if store_cache miss)
   - `fetch_content_freshness_data()` → external API call
   - `fetch_pagespeed_insights()` → external API call (if configured, if store_cache miss)
6. For each of 18 detectors: `asyncio.to_thread(_run_chain)` calls `detect_fn()` → `score_fn()` → `tips_fn()`
7. Store-wide dimensions (checkout, shipping, trust, page_speed, accessibility, ai_discoverability, social_commerce) cached in `StoreAnalysis` table (7-day TTL per store_domain + user_id)
8. All 18 categories scored, weighted via `compute_weighted_score()` using IMPACT_WEIGHTS (total weight 48.5)
9. ProductAnalysis row inserted/updated, StoreAnalysis cached
10. JSON response returned with: `{score, summary, categories, tips, signals, analysisId, productPrice, productCategory}`

**State Management:**

- **Request-scoped:** URL validation, HTML rendering, signal extraction, scoring (all ephemeral during request)
- **Session-scoped:** User credits (reset monthly), cache freshness (7-day StoreAnalysis TTL)
- **Persistent:** User profile, subscription plan, ProductAnalysis history, StoreAnalysis cache, Scan log

## Key Abstractions

**Detector Signals Dataclass:**
- Purpose: Immutable container for extracted signals (H1 text, meta title, brand name, flags for keyword stuffing, ALL CAPS, promo text, etc.)
- Examples: `TitleSignals`, `ImageSignals`, `SocialProofSignals`
- Pattern: `@dataclass` with optional fields and boolean flags; no methods (pure data)

**Scoring Rubric Function Pair:**
- Purpose: Convert signals → score (0-100) and generate tips
- Pattern: `score_*()` adds up weighted criteria; `get_*_tips()` returns triggered tips from ordered rule list
- Example: Title rubric awards 20pts for H1, deducts if all_caps, if_no_brand_in_title, etc.; tips are ordered by impact

**Cache Keys:**
- `ProductAnalysis`: unique on (`product_url`, `user_id`)
- `StoreAnalysis`: unique on (`store_domain`, `user_id`); checked via 7-day TTL

**Detector-Rubric Pattern:**
- One detector file per category (extracts signals)
- One rubric file per category (scores + tips)
- Both run in parallel via `asyncio.to_thread()` in the orchestration layer

## Entry Points

**Next.js Frontend:**
- Location: `webapp/src/app/page.tsx` (home), `webapp/src/app/layout.tsx` (root layout)
- Triggers: User visits alpo.ai
- Responsibilities: Render Sidebar, route to pages, load session auth, display PostHog analytics

**FastAPI Backend:**
- Location: `api/app/main.py`
- Triggers: API requests from frontend or webhooks
- Responsibilities: Set up middleware (CORS, rate limit, gzip), register routers, handle exceptions, return JSON responses

**POST /analyze:**
- Location: `api/app/routers/analyze.py` → `analyze()` → `_do_analyze()`
- Triggers: User submits URL from frontend
- Responsibilities: Validate URL, check credits, render page, run 18 detector chains in parallel, cache results, persist ProductAnalysis, return score + tips

**POST /auth/register:**
- Location: `api/app/routers/auth_routes.py`
- Triggers: User signs up
- Responsibilities: Validate email, hash password, create User row, send verification email

**GET /user/plan:**
- Location: `api/app/routers/user_plan.py`
- Triggers: Frontend checks plan tier + credit limits after login
- Responsibilities: Look up User, return plan_tier + credits_used + credits_limit

**Webhooks:**
- LemonSqueezy subscription webhooks → `api/app/routers/webhook.py`: sync subscription state, set plan_tier, reset credits
- Google OAuth callback → NextAuth middleware: exchange code for ID token, lookup/create user

## Error Handling

**Strategy:** Graceful degradation with explicit error responses. No stack trace leaks. Unauthenticated requests get 401, rate-limited requests get 429, credit exhaustion gets 403, bad URLs get 400, server errors get 500 with generic message.

**Patterns:**

- **URL Validation:** `validate_url()` in `url_validator.py` checks SSRF-unsafe patterns (localhost, private IPs, file://, non-http schemes). Returns `(url, error)` tuple.
- **Missing HTML:** If `render_page()` fails (network error, blocked by site), return 400 with "Could not fetch that URL" message. All signal extraction gracefully handles missing DOM elements.
- **Rate Limiting (slowapi):** Returns 429 with `Retry-After: 60` header.
- **Credit Exhaustion:** Returns 403 with `{error: "Credit limit reached", plan, creditsUsed, creditsLimit}`.
- **Unhandled Exceptions:** Caught by `@app.exception_handler(Exception)`, logged, returned as 500 with generic message (stack trace only in logs).
- **Optional Async Calls:** If external API calls fail (PageSpeed, AI Discoverability), graceful degradation — analysis continues without that signal. Exceptions logged as warnings.

## Cross-Cutting Concerns

**Logging:** Python logging module (configured at module level). Request/response logging in routers. Detector execution timing logged in `_run_chain()`. Cache hits/misses logged in `_do_analyze()`.

**Validation:** Pydantic models for request bodies (`AnalyzeRequest`). URL validation via `validate_url()` SSRF checker. Database constraints (unique, not null, foreign key).

**Authentication:** NextAuth v5 for session management on frontend (stores JWT in secure httpOnly cookie). FastAPI dependencies `get_current_user_required()` and `get_current_user_optional()` validate JWT and populate `current_user: User | None`.

**Rate Limiting:** slowapi middleware on `/analyze` endpoint: `@limiter.limit("5/minute")` per IP. Returns 429 with backoff header.

**Dedup (D091):** For authenticated users, `try_acquire_scan(url, user_id)` acquires Redis-like lock (in-memory for dev, Redis in production). Released in try/finally to prevent stuck scans.

---

*Architecture analysis: 2026-04-11*
