# External Integrations

**Analysis Date:** 2026-04-11

## APIs & External Services

**Email:**
- Resend - Email delivery service
  - SDK: `resend` (Python package)
  - Implementation: `api/app/services/email_sender.py`
  - Auth: `RESEND_API_KEY` environment variable
  - Used for: Sending analysis reports and transactional emails

**Analytics:**
- PostHog - Product analytics and feature flags
  - SDK: `posthog-js` (JavaScript)
  - Implementation: `webapp/src/app/PostHogWrapper.tsx`
  - Auth: `NEXT_PUBLIC_POSTHOG_KEY` (public), `NEXT_PUBLIC_POSTHOG_HOST`
  - Setup: Initialized on client-side; captures pageview, pageleave events

**Performance Monitoring:**
- Google PageSpeed Insights API - Lighthouse metrics
  - HTTP client: httpx (async)
  - Implementation: `api/app/services/page_speed_api.py`
  - Auth: `GOOGLE_PAGESPEED_API_KEY` (configured but currently unused in main flow)
  - Metrics: LCP, CLS, TBT, FCP, Speed Index (lab + Chrome UX Report field data)
  - Used by: Page speed detector service

**AI/LLM:**
- OpenRouter - LLM API (accessed via API key)
  - HTTP client: httpx (async)
  - Implementation: `api/app/services/openrouter.py`
  - Auth: `OPENAI_API_KEY` environment variable (misleading name; actually OpenRouter)
  - Endpoint: `https://openrouter.ai/api/v1/chat/completions`
  - Model: `openai/gpt-5.4-nano` (configurable)
  - Used for: AI-powered landing page analysis in webhook report generation
  - Note: Competitor analysis disabled; all scoring is now deterministic

**Web Scraping/Rendering:**
- Playwright - Headless browser automation
  - SDK: `playwright` (Python async)
  - Implementation:
    - `api/app/services/page_renderer.py` - DOM rendering with network-idle
    - `api/app/services/accessibility_scanner.py` - Axe-core WCAG scanning
  - Features:
    - Chromium headless browser (launched with `--no-sandbox`, `--disable-gpu`)
    - Timeout: 30 seconds (configurable)
    - Mobile viewport: 375×812 (iPhone 13/14)
    - Desktop rendering with network-idle wait
  - Used for: Page DOM analysis, JavaScript-rendered content, accessibility audit

**Accessibility Scanning:**
- axe-core (via axe-playwright-python) - WCAG 2.1 AA scanning
  - SDK: `axe-playwright-python`
  - Implementation: `api/app/services/accessibility_scanner.py`
  - Fallback: Direct CDN injection of `axe.min.js` if native library unavailable
  - Tags: Run WCAG 2.1 AA violations scan
  - Used for: Accessibility violation detection

**HTML Parsing:**
- BeautifulSoup4 - DOM parsing and extraction
  - Implementation: Various detector services
  - Used for: Structured data extraction, DOM analysis

## Data Storage

**Primary Database:**
- PostgreSQL 16 (Alpine Docker image)
  - Connection: `DATABASE_URL` environment variable
  - Client: SQLAlchemy 2.0.0+ ORM
  - SSL: Controlled by `DB_SSL` environment variable
  - Migrations: Alembic (in `api/alembic/` directory)
  - Models defined in: `api/app/models.py`

**Database Tables:**
- `users` - User accounts (UUID primary key, Google OAuth, Credentials)
- `product_analyses` - Per-product SKU page analysis results
- `store_analyses` - Per-store aggregated analysis
- `scans` - URL scan history (deduplication tracking)
- `reports` - Email report records (unauthenticated requests)
- `stores` - Store metadata and domain tracking

**Data Types:**
- JSONB columns for flexible scoring data (categories, tips, signals)
- UUID for all primary keys (server-generated)
- Numeric/Decimal for pricing data
- Timestamps with server-side defaults

## Authentication & Identity

**Auth Provider:**
- NextAuth.js 5.0.0-beta.30 - Session management
  - Strategy: JWT (signed with `AUTH_SECRET`)
  - Providers: Google OAuth, Credentials (email/password)

**Google OAuth:**
- Google Sign-In
  - Auth endpoint: `accounts.google.com`
  - Credentials: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
  - JWT callback: `webapp/src/auth.ts` → `GET /auth/google-signin` endpoint
  - Creates/links user in PostgreSQL on first login

**Credentials (Email/Password):**
- Custom implementation
  - Endpoint: `POST /auth/login` (FastAPI)
  - Password hashing: bcrypt 4.0.0+
  - JWT encoding: PyJWT 2.8.0+ (backend), jsonwebtoken 9.0.3 (client)

**JWT Architecture:**
- Signing secret: `AUTH_SECRET` (HS256 algorithm)
- Token claims:
  - `sub` - Postgres UUID (new sessions) or google_sub (legacy)
  - `email`, `name`, `picture` - User profile
  - `role` - "user" or "admin"
- Verification:
  - Frontend: NextAuth.js + jsonwebtoken
  - Backend: `api/app/auth.py` (PyJWT)

**User Auto-Provisioning:**
- First authenticated request auto-creates user row
- Google OAuth → uuid lookup, then google_sub fallback (legacy)
- Credentials → uuid lookup only

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry/Rollbar/Honeycomb integration

**Logging:**
- Python: Standard `logging` module (FastAPI/Uvicorn)
- JavaScript: `console` (Next.js)
- Production: Docker container logs (stdout)

**Application Health:**
- `GET /health` endpoint (FastAPI)
- Used by Docker Compose healthchecks
- Verifies database connectivity

## CI/CD & Deployment

**Hosting:**
- Self-hosted Docker (implied from Caddyfile, docker-compose config)
- Domain: alpo.ai, api.alpo.ai, www.alpo.ai
- Reverse proxy: Caddy (TLS, CSP headers, gzip compression)

**CI Pipeline:**
- Not detected (no GitHub Actions, GitLab CI config found)
- Manual deployment via Docker Compose

**Container Orchestration:**
- Docker Compose (multi-service: db, app, api, caddy)
- `docker-compose.yml` (development)
- `docker-compose.prod.yml` (production variant)
- `docker-compose.dev.yml` (development-specific overrides)

## Environment Configuration

**Required env vars (Backend API):**
```
DATABASE_URL              # PostgreSQL connection string
CORS_ORIGINS              # Comma-separated allowed origins
OPENAI_API_KEY            # OpenRouter API key (misleading name)
RESEND_API_KEY            # Resend email API key
LEMONSQUEEZY_WEBHOOK_SECRET  # Payment webhook HMAC secret
LEMONSQUEEZY_VARIANT_STARTER # LemonSqueezy variant ID (plan mapping)
LEMONSQUEEZY_VARIANT_GROWTH  # LemonSqueezy variant ID
LEMONSQUEEZY_VARIANT_PRO     # LemonSqueezy variant ID
AUTH_SECRET               # JWT signing secret (min 32 bytes recommended)
GOOGLE_PAGESPEED_API_KEY  # Google PSI API key (optional, currently unused)
WEBAPP_URL                # Frontend URL for redirect links
DB_SSL                    # Enable SSL for Postgres ("true"/"false")
```

**Required env vars (Frontend Build):**
```
NEXT_PUBLIC_POSTHOG_KEY   # PostHog API key (build-time)
NEXT_PUBLIC_POSTHOG_HOST  # PostHog endpoint (build-time)
NEXT_PUBLIC_BASE_URL      # Frontend base URL (build-time)
NEXT_PUBLIC_API_URL       # Backend API URL (build-time)
NEXT_PUBLIC_LS_STORE_URL  # LemonSqueezy store URL (build-time)
NEXT_PUBLIC_LS_VARIANT_STARTER  # Variant IDs (build-time)
NEXT_PUBLIC_LS_VARIANT_GROWTH
NEXT_PUBLIC_LS_VARIANT_PRO
```

**Required env vars (NextAuth.js):**
```
AUTH_SECRET               # JWT signing secret
AUTH_GOOGLE_ID            # Google OAuth client ID
AUTH_GOOGLE_SECRET        # Google OAuth client secret
AUTH_URL                  # Canonical frontend URL (for CSRF/redirect)
AUTH_TRUST_HOST           # Trust X-Forwarded-* headers ("true"/"false")
```

**Secrets location:**
- Development: `.env` file (symlinked to `.env.local`)
- Production: Environment variables injected at runtime
- Template: `.env.production.template` (for reference)

## Webhooks & Callbacks

**Incoming:**
- `POST /webhook` - LemonSqueezy payment webhook
  - Verification: HMAC-SHA256 signature (header: `x-signature`)
  - Payload: Order created, order updated, subscription created, etc.
  - Triggers: Generate AI-powered landing page report, send email
  - Implementation: `api/app/routers/webhook.py`

**Outgoing:**
- Email reports - Sent via Resend API (not a webhook, direct API call)
- No outbound webhooks detected

## Rate Limiting

**Framework:**
- SlowAPI - Rate limiting middleware for FastAPI
- Implemented: `api/app/rate_limit.py`
- Response: 429 (Too Many Requests) with `Retry-After: 60` header

## Security Headers & CSP

**Caddy Reverse Proxy:**
- Strict-Transport-Security: max-age=63072000 (2 years)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Content-Security-Policy (frontend domain):
  - script-src: 'self', PostHog CDN (us.i.posthog.com), Google accounts
  - img-src: 'self', cdn.shopify.com, lh3.googleusercontent.com
  - form-action: 'self', accounts.google.com
- Content-Security-Policy (API domain): default-src 'none'

## Image Remoting

**Allowed Remote Image Domains:**
- `lh3.googleusercontent.com` - Google profile pictures
- `cdn.shopify.com` - Shopify store images

---

*Integration audit: 2026-04-11*
