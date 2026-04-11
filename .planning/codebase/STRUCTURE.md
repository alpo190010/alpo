# Codebase Structure

**Analysis Date:** 2026-04-11

## Directory Layout

```
alpo/
├── api/                        # FastAPI backend — scoring orchestration & data persistence
│   ├── app/
│   │   ├── main.py            # FastAPI app setup, middleware, router registration
│   │   ├── config.py          # Settings/environment (database_url, api keys, cors_origins)
│   │   ├── models.py          # SQLAlchemy ORM (User, ProductAnalysis, StoreAnalysis, Scan, Report, Store, StoreProduct)
│   │   ├── database.py        # SQLAlchemy engine, SessionLocal, get_db dependency
│   │   ├── auth.py            # JWT token generation/validation, email verification
│   │   ├── rate_limit.py      # slowapi RateLimiter instance
│   │   ├── routers/           # Endpoint definitions (18 files)
│   │   │   ├── analyze.py                 # POST /analyze (main scoring endpoint)
│   │   │   ├── auth_routes.py             # POST /auth/register, /auth/login, /auth/verify-email, /auth/forgot-password, /auth/reset-password
│   │   │   ├── health.py                  # GET /health
│   │   │   ├── user_plan.py               # GET /user/plan
│   │   │   ├── user_scans.py              # GET /user/scans
│   │   │   ├── webhook.py                 # POST /webhook (LemonSqueezy subscription events)
│   │   │   ├── store.py                   # Store domain lookup
│   │   │   ├── discover_products.py       # Product discovery from store
│   │   │   ├── request_report.py          # POST /request-report (email report)
│   │   │   ├── send_report_now.py         # POST /send-report-now
│   │   │   ├── admin_users.py             # Admin user management
│   │   │   ├── admin_analytics.py         # Admin analytics queries
│   │   │   ├── admin_impersonate.py       # Admin impersonation
│   │   │   └── analyze_competitors.py     # (Disabled — AI calls removed)
│   │   └── services/          # Detector, rubric, and utility services (57 files)
│   │       ├── [*_detector.py]            # 18 signal extraction services (title, images, pricing, social_proof, checkout, shipping, description, trust, mobile_cta, page_speed, cross_sell, variant_ux, size_guide, ai_discoverability, content_freshness, accessibility, social_commerce, structured_data)
│   │       ├── [*_rubric.py]              # 18 scoring & tip generation services (mirror detector names)
│   │       ├── page_renderer.py           # Playwright headless browser, render_page(), measure_mobile_cta()
│   │       ├── html_fetcher.py            # (Legacy) fetch HTML via requests
│   │       ├── scoring.py                 # compute_weighted_score(), CATEGORY_KEYS, IMPACT_WEIGHTS, DIMENSION_SCOPE
│   │       ├── accessibility_scanner.py   # run_axe_scan() (Playwright + axe-core)
│   │       ├── url_validator.py           # validate_url() SSRF checker
│   │       ├── scan_dedup.py              # try_acquire_scan(), release_scan() (dedup locks)
│   │       ├── entitlement.py             # has_credits_remaining(), increment_credits(), get_credits_limit()
│   │       ├── auth_service.py            # hash_password(), verify_password()
│   │       ├── email_sender.py            # send_email() via Resend API
│   │       ├── email_templates.py         # Email HTML templates
│   │       ├── auth_email_templates.py    # Auth-specific email templates
│   │       ├── email_palette.py           # Email CSS color vars
│   │       ├── openrouter.py              # call_openrouter() (LLM fallback, disabled in main flow)
│   │       ├── page_speed_api.py          # fetch_pagespeed_insights() (Google API)
│   │       ├── ai_discoverability_api.py  # fetch_ai_discoverability_data() (external API)
│   │       ├── content_freshness_api.py   # fetch_content_freshness_data() (external API)
│   │       ├── price_extractor.py         # extract_price() from pricing signals
│   │       └── structured_data_detector.py # detect_structured_data() (JSON-LD parsing)
│   ├── alembic/               # Database migrations
│   │   ├── versions/          # Timestamped migration files (*.py)
│   │   ├── env.py             # Alembic configuration
│   │   └── alembic.ini        # Alembic init config
│   ├── tests/                 # Pytest test suite
│   ├── Dockerfile             # Build image: Python 3.11 + dependencies
│   └── pyproject.toml / requirements.txt  # Dependencies
├── webapp/                     # Next.js 16 frontend
│   ├── src/
│   │   ├── app/              # App Router pages & layouts (Next.js 13+ App Dir)
│   │   │   ├── layout.tsx              # Root layout (Sidebar, providers, fonts)
│   │   │   ├── page.tsx               # Home page (hero, CTA, pricing teaser)
│   │   │   ├── providers.tsx          # NextAuth & PostHog providers
│   │   │   ├── globals.css            # Tailwind imports, CSS vars, design tokens
│   │   │   ├── api/                   # API routes
│   │   │   │   ├── auth/              # NextAuth v5 route handlers
│   │   │   │   └── health/            # Health check endpoint
│   │   │   ├── app.tsx               # (App component — not used in App Router)
│   │   │   ├── error.tsx             # Global error boundary
│   │   │   ├── not-found.tsx         # 404 page
│   │   │   ├── analyze/               # GET /analyze?url=... page
│   │   │   ├── dashboard/             # Authenticated user dashboard
│   │   │   ├── admin/                 # Admin pages (users, analytics)
│   │   │   ├── settings/              # User settings page
│   │   │   ├── pricing/               # Pricing page
│   │   │   ├── scan/[domain]/         # Dynamic scan results page
│   │   │   ├── blog/                  # Blog articles
│   │   │   ├── forgot-password/       # Password reset flow
│   │   │   ├── reset-password/        # Password reset confirmation
│   │   │   ├── verify-email/          # Email verification
│   │   │   ├── _components/           # Shared layout components (Sidebar, Footer, etc.)
│   │   │   └── PostHogWrapper.tsx     # PostHog event tracking wrapper
│   │   ├── components/        # Reusable React components
│   │   │   ├── Sidebar.tsx           # Left sidebar nav
│   │   │   ├── Footer.tsx            # Footer
│   │   │   ├── AuthModal.tsx         # Auth signup/login modal
│   │   │   ├── PaywallModal.tsx      # Subscription tier gating modal
│   │   │   ├── AnalysisPane.tsx      # Left pane of /analyze page
│   │   │   ├── AnalysisResults.tsx   # Right pane with score card & leak cards
│   │   │   ├── AnalysisLoader.tsx    # Loading skeleton during scan
│   │   │   ├── ProductGrid.tsx       # Grid of discovered products
│   │   │   ├── ProductListings.tsx   # Table of store products
│   │   │   ├── StoreHealth.tsx       # Store-wide analytics card
│   │   │   ├── BottomSheet.tsx       # Mobile sheet component (Radix Dialog)
│   │   │   ├── ImpersonationBanner.tsx # Admin impersonation banner
│   │   │   ├── OfflineBanner.tsx     # Offline indicator
│   │   │   ├── NavAuthButton.tsx     # Auth button (sign up / sign in / my account)
│   │   │   ├── Nav.tsx               # Top navigation
│   │   │   ├── AlpoLogo.tsx          # Logo SVG
│   │   │   ├── ErrorCard.tsx         # Error display
│   │   │   ├── ErrorState.tsx        # Full-page error
│   │   │   ├── EmptyState.tsx        # Empty state placeholder
│   │   │   ├── analysis/             # Analysis-specific UI subcomponents
│   │   │   │   ├── ScoreRing.tsx     # Circular score display (0-100)
│   │   │   │   ├── FeaturedInsight.tsx # Top insight card
│   │   │   │   ├── IssueCard.tsx     # Individual "leak" category card
│   │   │   │   ├── PluginCTACard.tsx # Plugin/extension CTA card
│   │   │   │   └── CTACard.tsx       # Generic CTA card
│   │   │   └── ui/                  # Design system / shadcn-style components
│   │   │       ├── Button.tsx        # Button with variants
│   │   │       ├── Input.tsx         # Text input
│   │   │       ├── Dialog.tsx        # Modal (Radix Dialog)
│   │   │       ├── Card.tsx          # Card container
│   │   │       ├── Dropdown.tsx      # Dropdown menu
│   │   │       ├── Tabs.tsx          # Tab navigation
│   │   │       ├── Tooltip.tsx       # Tooltip (Radix)
│   │   │       └── [other UI primitives]
│   │   ├── hooks/              # Custom React hooks
│   │   │   ├── useAnalysis.ts       # (If exists) Hook for analysis data
│   │   │   ├── useAuth.ts           # (If exists) Hook for auth
│   │   │   └── [custom hooks]
│   │   ├── lib/                # Utilities & helpers
│   │   │   ├── api.ts               # API_URL constant
│   │   │   ├── auth-fetch.ts        # authFetch() wrapper (adds JWT to requests)
│   │   │   ├── errors.ts            # Error formatting
│   │   │   ├── format.ts            # Number/currency formatting
│   │   │   ├── validators.ts        # Input validation
│   │   │   ├── sample-data.ts       # SAMPLE_SCAN for demo
│   │   │   ├── analysis.ts          # Re-exports from analysis/ subdir
│   │   │   └── analysis/            # Analysis utilities
│   │   │       ├── types.ts         # TypeScript types (FreeResult, LeakCard, PlanTier, etc.)
│   │   │       ├── constants.ts     # CATEGORY_KEYS, IMPACT_WEIGHTS, STARTER_DIMENSIONS
│   │   │       ├── scoring.ts       # calculateDollarLossPerThousand(), parseAnalysisResponse()
│   │   │       ├── hooks.ts         # useCountUp() (animated number counter)
│   │   │       ├── gating.ts        # getDimensionAccess() (tier-based feature gates)
│   │   │       ├── events.ts        # captureEvent() (PostHog tracking)
│   │   │       └── __tests__/       # Vitest unit tests
│   │   └── types/              # Shared TypeScript types
│   │       ├── index.ts             # Export all types
│   │       └── [domain types]
│   ├── public/                # Static assets (favicon, robots.txt, open graph image, etc.)
│   ├── tsconfig.json          # TypeScript config (target ES2017, paths alias @/*, strict mode)
│   ├── tailwind.config.ts     # Tailwind CSS config (design tokens, colors, plugins)
│   ├── postcss.config.js      # PostCSS config (Tailwind + Autoprefixer)
│   ├── next.config.js         # Next.js config (redirects, headers, image optimization)
│   ├── package.json           # Dependencies (React 19, Next.js 16, NextAuth 5-beta, Tailwind 4, Vitest)
│   ├── Dockerfile             # Build image: Node.js + Next.js build
│   └── .env.example           # Example environment variables
├── docker-compose.yml         # Docker Compose for local dev (db, api, app, caddy)
├── docker-compose.prod.yml    # Production Docker Compose
├── Caddyfile                  # Caddy reverse proxy config (SSL, CSP headers, routing)
├── alembic.ini               # Alembic init config (shared root level — legacy)
├── .env.local.example        # Example env vars (secrets, API keys, URLs)
└── scripts/                   # Utility scripts (migrations, backups, deployments)
```

## Directory Purposes

**`api/app/`:**
- Purpose: FastAPI application core — routing, models, services
- Contains: Endpoint handlers (routers), ORM models, service functions
- Key files: `main.py` (app setup), `models.py` (DB schema), `routers/analyze.py` (main scoring endpoint)

**`api/app/routers/`:**
- Purpose: Endpoint definitions organized by feature (analyze, auth, admin, webhooks)
- Contains: Router instances with `@router.get()`, `@router.post()` decorators
- Key files: `analyze.py` (77 KB, main endpoint), `auth_routes.py`, `webhook.py`

**`api/app/services/`:**
- Purpose: Business logic — detector chains, rubric scoring, external API calls, utilities
- Contains: Pure functions and async functions (no shared state)
- Organized by concern: detector pairs (title_detector + title_rubric), API clients (page_speed_api, openrouter), utilities (url_validator, scan_dedup, entitlement)

**`api/alembic/versions/`:**
- Purpose: Database schema versioning
- Contains: Timestamped migration files (001_initial_schema.py, 002_add_user_plan_fields.py, etc.)
- Run via: `alembic upgrade head` (in Docker startup)

**`webapp/src/app/`:**
- Purpose: Next.js App Router pages and shared layouts
- Contains: Server components (layout.tsx, pages), client components (analyze/page.tsx uses "use client"), API route handlers
- Key files: `layout.tsx` (root layout with Sidebar), `page.tsx` (home), `analyze/page.tsx` (main UX), `api/auth/` (NextAuth routes)

**`webapp/src/components/`:**
- Purpose: Reusable React UI components
- Contains: Feature-specific components (AuthModal, PaywallModal, AnalysisResults), layout components (Sidebar, Footer), UI primitives (Button, Card, Input)
- Organized by: Feature (analysis, ui) or high-level concern (Sidebar, Nav)

**`webapp/src/lib/analysis/`:**
- Purpose: Analysis domain logic (types, scoring utils, tier gating, PostHog events)
- Contains: Type definitions (FreeResult, LeakCard, PlanTier), scoring helpers (calculateDollarLossPerThousand), access control (getDimensionAccess)
- Key files: `types.ts` (FreeResult union type), `constants.ts` (CATEGORY_KEYS, IMPACT_WEIGHTS, STARTER_DIMENSIONS)

**`webapp/src/lib/`:**
- Purpose: App-wide utilities (API fetch wrapper, auth, errors, formatting)
- Contains: Shared helpers not tied to a specific feature
- Key files: `api.ts` (API_URL), `auth-fetch.ts` (JWT request wrapper), `errors.ts` (error formatting)

## Key File Locations

**Entry Points:**
- `api/app/main.py`: FastAPI app initialization, middleware, router registration
- `webapp/src/app/layout.tsx`: Root layout (loads Sidebar, providers, applies global styles)
- `webapp/src/app/page.tsx`: Home page (hero section, CTA to /analyze)
- `webapp/src/app/analyze/page.tsx`: Main UX (URL input, loading, score display, leak cards)

**Configuration:**
- `api/app/config.py`: Environment variables (database_url, api keys, CORS origins)
- `api/app/database.py`: SQLAlchemy engine and session factory
- `webapp/tsconfig.json`: TypeScript compiler options (@ alias, strict mode)
- `webapp/tailwind.config.ts`: Design tokens (colors, spacing, typography)
- `docker-compose.yml`: Service definitions (db, api, app, caddy)
- `Caddyfile`: Reverse proxy routing and SSL configuration

**Core Logic:**
- `api/app/routers/analyze.py`: Main scoring endpoint — URL validation, caching, orchestration, concurrent detector execution
- `api/app/services/scoring.py`: Weighted score computation, category keys, dimension scope
- `api/app/services/*_detector.py`: 18 signal extraction services (pure functions returning @dataclass Signals)
- `api/app/services/*_rubric.py`: 18 scoring rubrics (convert Signals → 0-100 score + tips)
- `api/app/models.py`: SQLAlchemy ORM for User, ProductAnalysis, StoreAnalysis, Scan, Report

**Authentication:**
- `api/app/auth.py`: JWT generation, verification, email token generation
- `api/app/routers/auth_routes.py`: Register, login, verify-email, forgot-password, reset-password endpoints
- `webapp/src/app/api/auth/`: NextAuth v5 route handlers
- `api/app/services/auth_service.py`: Password hashing and verification

**Testing:**
- `api/tests/`: Pytest test suite (structure mirrors app/ layout)
- `webapp/src/lib/analysis/__tests__/`: Vitest unit tests for analysis utilities
- No E2E tests (Playwright used for page rendering, not test automation)

**UI Components:**
- `webapp/src/components/AnalysisResults.tsx`: Displays score, summary, category cards, leak cards
- `webapp/src/components/AnalysisPane.tsx`: Left pane (URL input, loading state, form controls)
- `webapp/src/components/analysis/ScoreRing.tsx`: Circular score visualization (0-100)
- `webapp/src/components/analysis/IssueCard.tsx`: Individual category leak card (category name, score, tips)
- `webapp/src/components/AuthModal.tsx`: Sign up / sign in modal
- `webapp/src/components/PaywallModal.tsx`: Subscription tier gating modal

**Email Templates:**
- `api/app/services/email_templates.py`: Account confirmation, password reset, report email templates (HTML)
- `api/app/services/auth_email_templates.py`: Auth-specific email HTML
- `api/app/services/email_sender.py`: Resend API client

**Database:**
- `api/app/models.py`: ORM models (User, ProductAnalysis, StoreAnalysis, Scan, Report, Store, StoreProduct)
- `api/alembic/versions/`: Migration files (source of truth for schema)
- `api/alembic/env.py`: Alembic configuration

## Naming Conventions

**Files:**
- `*_detector.py`: Signal extraction service (e.g., `title_detector.py`, `images_detector.py`)
- `*_rubric.py`: Scoring and tip generation service (mirrors detector name)
- `*.tsx`: React component (TypeScript + JSX)
- `*.ts`: TypeScript utility or type definition
- `page.tsx`: Next.js route component (auto-routed based on directory)
- `layout.tsx`: Next.js layout component
- `route.ts/route.js`: NextAuth or custom API route handler

**Directories:**
- `app/`: App Router pages (Next.js convention)
- `components/`: Reusable React components
- `lib/`: Non-React utilities (pure functions, helpers)
- `services/`: Backend business logic (detectors, rubrics, API clients)
- `routers/`: FastAPI router modules (one per feature)
- `types/`: TypeScript type definitions
- `hooks/`: Custom React hooks
- `__tests__/`: Test files (mirrors source directory structure)

**Functions:**
- `detect_*()`: Detector function (returns Signals @dataclass)
- `score_*()`: Rubric scoring function (returns 0-100 int)
- `get_*_tips()`: Rubric tip generation function (returns list[str])
- `fetch_*()`: Async API call function
- `validate_*()`: Validation function (returns bool or tuple)
- camelCase for JS/TS, snake_case for Python

**Variables:**
- `CATEGORY_KEYS`: Constant list of 18 category names (camelCase in list)
- `IMPACT_WEIGHTS`: Constant dict mapping category → weight
- `current_user`: FastAPI dependency-injected User or None
- `signals`: Detector output (Signals @dataclass)
- `score`: Integer 0-100
- `tips`: List of strings

## Where to Add New Code

**New Feature (e.g., new detector category):**
- Backend signal extraction: Create `api/app/services/[category]_detector.py` with `@dataclass [Category]Signals` and `detect_[category](html: str) -> [Category]Signals`
- Backend scoring: Create `api/app/services/[category]_rubric.py` with `score_[category]()` and `get_[category]_tips()`
- Update `api/app/routers/analyze.py`: Import both modules, add to detector chain via `asyncio.to_thread(_run_chain(...))`
- Update `api/app/services/scoring.py`: Add category to `CATEGORY_KEYS`, `DIMENSION_SCOPE`, `IMPACT_WEIGHTS`
- Frontend types: Add to `webapp/src/lib/analysis/types.ts` (LeakCard union type)
- Frontend UI: Add category card rendering in `webapp/src/components/AnalysisResults.tsx`
- Tests: Add `api/tests/test_[category]_detector.py` and `api/tests/test_[category]_rubric.py`

**New Endpoint:**
- FastAPI router: Create `api/app/routers/[feature].py` with `@router.get()` or `@router.post()`
- Register in `api/app/main.py`: `app.include_router([feature]_router)`
- Database model (if needed): Add to `api/app/models.py`, create migration in `api/alembic/versions/`
- Tests: Add `api/tests/test_routers_[feature].py`

**New UI Component/Page:**
- Component: Create `webapp/src/components/[ComponentName].tsx` (if reusable) or directly in page
- Page: Create `webapp/src/app/[route]/page.tsx` (auto-routed by Next.js)
- Styling: Use Tailwind classes (no CSS files in most cases). Design tokens in `tailwind.config.ts`
- Types: Add type definitions to `webapp/src/types/` if feature-specific, or `webapp/src/lib/analysis/types.ts` if analysis-related
- Tests: Add `webapp/src/lib/analysis/__tests__/[test-name].test.ts` or create if missing

**Utilities:**
- Backend helpers: `api/app/services/[concern].py` (pure functions, no side effects)
- Frontend helpers: `webapp/src/lib/[concern].ts` or `webapp/src/lib/analysis/[concern].ts`
- Shared types: `webapp/src/types/index.ts` or `webapp/src/lib/analysis/types.ts`

## Special Directories

**`api/alembic/versions/`:**
- Purpose: Database migrations (Alembic-managed)
- Generated: Yes (via `alembic revision --autogenerate -m "message"`)
- Committed: Yes (source control tracked)
- Pattern: Each file is a timestamped Python module with `upgrade()` and `downgrade()` functions

**`webapp/.next/`:**
- Purpose: Next.js build output (compiled JS, static assets)
- Generated: Yes (via `npm run build`)
- Committed: No (in `.gitignore`)
- Contains: Optimized bundles, ISR manifests, font subsets

**`api/.pytest_cache/`:**
- Purpose: Pytest caching (test discovery, previous runs)
- Generated: Yes (via `pytest`)
- Committed: No (in `.gitignore`)

**`api/__pycache__/`:**
- Purpose: Python bytecode cache
- Generated: Yes (by Python interpreter)
- Committed: No (in `.gitignore`)

**`node_modules/` and `.venv/`:**
- Purpose: Installed dependencies
- Generated: Yes (via `npm install` or `pip install`)
- Committed: No (in `.gitignore`)

**`scripts/`:**
- Purpose: Utility scripts (database backups, migrations, deployments)
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-04-11*
