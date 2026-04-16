# alpo.ai -- Shopify Product Page Analyzer

AI-powered Shopify product page analyzer that scores 18 conversion dimensions and estimates revenue leaks. Merchants paste a product URL, get a score out of 100, and see prioritized recommendations to improve their page. Free to use, targeting small solo Shopify merchants.

---

## What It Does

- Paste any Shopify product URL
- Get a score out of 100 across 18 conversion dimensions
- See revenue leak estimates per dimension
- Get prioritized recommendations to improve your page

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + React 19 (Vercel) |
| Backend API | FastAPI + Python |
| Database | PostgreSQL |
| Page rendering | Playwright (headless browser) |
| Auth | NextAuth.js (email/password + Google OAuth) |
| Analytics | PostHog |
| Reverse proxy | Caddy |
| Containerization | Docker Compose |

---

## Project Structure

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

---

## Getting Started

### Prerequisites

- Node.js (for webapp)
- Python 3.11+ (for API)
- Docker and Docker Compose
- PostgreSQL (or use Docker Compose)

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `POSTGRES_USER` | Yes | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `POSTGRES_DB` | Yes | PostgreSQL database name |
| `DATABASE_URL` | Yes | Full PostgreSQL connection string |
| `AUTH_SECRET` | Yes | NextAuth.js signing secret |
| `AUTH_GOOGLE_ID` | Yes | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth client secret |
| `NEXT_PUBLIC_API_URL` | Yes | URL the webapp uses to reach the FastAPI backend |
| `NEXT_PUBLIC_BASE_URL` | Yes | Public base URL for the webapp |

> **Dormant (not required to run core product):** `OPENAI_API_KEY` (OpenRouter key for optional AI features), `RESEND_API_KEY` (email, unused at launch), `LEMONSQUEEZY_WEBHOOK_SECRET` and `LEMONSQUEEZY_VARIANT_*` (payments, no paid tier yet).

### Installation

```bash
git clone <repo-url>
cp .env.production.template .env
# Edit .env with your values
```

---

## Development

### Running Locally

```bash
# Frontend (webapp/)
cd webapp && npm install && npm run dev    # starts Next.js on port 3005

# Backend (api/) -- start Postgres first
docker compose -f docker-compose.dev.yml up db
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Full stack (all services via Docker Compose)
docker compose up
```
