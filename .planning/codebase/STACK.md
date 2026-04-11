# Technology Stack

**Analysis Date:** 2026-04-11

## Languages

**Primary:**
- TypeScript 5.8.3 - Frontend (Next.js, React)
- Python 3.11 - Backend (FastAPI, analysis services)

**Secondary:**
- JavaScript - Package/build scripts

## Runtime

**Environment:**
- Node.js 22-alpine - Frontend runtime (Docker)
- Python 3.11-slim - Backend runtime (Docker)

**Package Managers:**
- npm - Node.js packages (lockfile: package-lock.json present)
- pip - Python packages (requirements.txt)

## Frameworks

**Core:**
- Next.js 16.2.1 - Full-stack React framework with API routes
  - Output: standalone (Docker-optimized build)
  - Turbopack enabled for faster builds
- FastAPI 0.115.0+ - Async Python web framework for analysis API
- React 19.2.4 - UI component library
- Uvicorn 0.34.0+ - ASGI application server for FastAPI

**Testing:**
- Vitest 4.1.2 - Fast unit test runner (JavaScript)
- pytest 8.0.0+ - Python test framework

**Build/Dev:**
- TypeScript 5.8.3 - Type checking
- Tailwind CSS 4.2.2 - Utility-first CSS
- PostCSS 8.5.5 - CSS transformation
- Alembic 1.14.0+ - Database migrations (SQLAlchemy)

## Key Dependencies

**Critical:**
- next-auth 5.0.0-beta.30 - Authentication (JWT, Google OAuth, Credentials)
- SQLAlchemy 2.0.0+ - Python ORM for database queries
- psycopg2-binary 2.9.0+ - PostgreSQL adapter for Python
- playwright 1.40.0+ - Headless browser automation (Chromium rendering)
- axe-playwright-python 0.1.7+ - Accessibility scanning (WCAG 2.1 AA)
- BeautifulSoup4 4.12.0+ - HTML parsing for page analysis
- pydantic-settings 2.0.0+ - Environment variable management

**Infrastructure:**
- httpx 0.28.0+ - Async HTTP client (API calls, webhooks)
- PyJWT 2.8.0+ - JWT encoding/decoding
- bcrypt 4.0.0+ - Password hashing
- resend 2.0.0+ - Email delivery SDK
- slowapi 0.1.9+ - Rate limiting middleware
- posthog-js 1.363.1 - Analytics instrumentation
- @radix-ui/react-dialog 1.1.15 - Headless UI components
- @radix-ui/react-tooltip 1.2.8 - Tooltip components
- @tailwindcss/postcss 4.2.2 - Tailwind CSS plugin
- @phosphor-icons/react 2.1.10 - Icon library
- jsonwebtoken 9.0.3 - JWT handling (Node.js)

## Configuration

**Environment:**
- `.env` file (symlinked to `.env.local` in development)
- Environment variables required:
  - `DATABASE_URL` - PostgreSQL connection string
  - `OPENAI_API_KEY` - OpenRouter API key (misnamed, actually points to openrouter.ai)
  - `RESEND_API_KEY` - Email delivery service
  - `LEMONSQUEEZY_WEBHOOK_SECRET` - Payment webhook verification
  - `AUTH_SECRET` - JWT signing secret
  - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` - Google OAuth credentials
  - `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` - Analytics (build-time)
  - `NEXT_PUBLIC_API_URL` - Backend API URL (build-time)
  - `NEXT_PUBLIC_LS_*` - LemonSqueezy variant IDs (build-time)
- See `.env.production.template` for all required variables
- Secrets never committed; `.env*` in `.gitignore`

**Build:**
- `next.config.ts` - Next.js configuration
  - Image optimization (AVIF, WebP)
  - Remote image patterns (cdn.shopify.com, lh3.googleusercontent.com)
  - Standalone output for Docker
- `tsconfig.json` - TypeScript compiler options
- `api/alembic.ini`, `api/alembic/` - Database migration configuration

## Platform Requirements

**Development:**
- Node.js 22 (Docker) or system Node.js
- Python 3.11 (Docker) or system Python
- PostgreSQL 16 (Docker Compose)
- Docker & Docker Compose

**Production:**
- Docker containers (Next.js + Uvicorn + PostgreSQL)
- Caddy reverse proxy (SSL, CORS, CSP headers)
- Linux host with Docker runtime
- 256MB shared memory (`shm_size`) for Playwright/Chromium
- PostgreSQL 16+ (external or containerized)

**Deployment Architecture:**
- Frontend: `node:22-alpine` → Next.js standalone build
- API: `python:3.11-slim` → FastAPI + Uvicorn
- Database: `postgres:16-alpine`
- Reverse Proxy: `caddy:latest`
- All services connected via Docker internal network

---

*Stack analysis: 2026-04-11*
