# Codebase Concerns

**Analysis Date:** 2026-04-11

## Tech Debt

**Oversized Components (Frontend Complexity):**
- Issue: Multiple large React components exceed 500 lines, creating maintenance and performance challenges
- Files:
  - `webapp/src/components/analysis/IssueCard.tsx` (1604 lines) - Monolithic issue card with 20+ signal checklist types
  - `webapp/src/app/analyze/page.tsx` (546 lines) - Complex page with mixed concerns: plan data, caching, credit exhaustion, analysis state
  - `webapp/src/app/admin/users/[id]/page.tsx` (528 lines) - Heavy admin user detail page
  - `webapp/src/lib/analysis/helpers.ts` (512 lines) - Conversion model and utility logic bundled together
- Impact: Difficult to test, refactor, and reuse components; increased re-render surface area
- Fix approach: Split into smaller, focused components using compound component pattern; extract helpers to dedicated files

**Monolithic API Endpoints:**
- Issue: `/analyze` endpoint (`api/app/routers/analyze.py`, 833 lines) handles multiple concerns: validation, caching, concurrent async orchestration, DB persistence, error handling
- Files: `api/app/routers/analyze.py`
- Impact: Hard to test independently; error handling paths are complex; difficult to refactor caching strategy
- Fix approach: Extract cache lookup, async orchestration, and DB persistence into separate service functions; use dependency injection for cleaner error handling

**In-Memory Scan Dedup Without Persistence:**
- Issue: Scan deduplication lock (`api/app/services/scan_dedup.py`) uses a single module-level dict with TTL-based cleanup
- Files: `api/app/services/scan_dedup.py`
- Impact: Only works in single-process mode; doesn't survive process restarts; cleanup is O(n) on every acquire call
- Fix approach: Migrate to distributed lock using Redis or database-backed locks (e.g., advisory locks in PostgreSQL) for multi-process deployment

## Known Bugs

**Race Condition: Analyze Page Plan Data Fetch:**
- Symptoms: Plan data can arrive after analysis is fetched, potentially causing "free tier has full access" views if timing is off
- Files: `webapp/src/app/analyze/page.tsx` lines 100-147
- Trigger: User with authenticated session navigates to analyze page; plan API response delayed
- Detail: Two independent fetch chains — first `GET /user/plan`, then `GET /analysis` (cache check) or `POST /analyze`. If plan data hasn't loaded when showing results, plan state may not reflect correct tier
- Workaround: UI reads planData from state; if null, assumes free tier and shows paywalls; safe but UX could show wrong unlock status briefly
- Fix approach: Wait for plan data before initiating analysis fetch using promise sequencing or `Promise.all` with explicit dependency checks

**DB Credit Increment Silently Fails:**
- Symptoms: User may continue scanning beyond credit limit if `increment_credits()` fails after analysis completes
- Files: `api/app/routers/analyze.py` lines 741-745
- Trigger: Database connection failure, constraint violation, or transaction rollback during credit increment
- Detail: Credit increment is marked as "best-effort — analysis already succeeded" with try/except swallowing errors; no alert to admin
- Workaround: Credits reset monthly, so overages are bounded
- Fix approach: Implement compensating transaction logic; track failed increments in a separate table for manual reconciliation

**Stale Cache Timestamp Comparison Edge Case:**
- Symptoms: Timezone-naive Postgres timestamps compared with timezone-aware UTC times can cause cache freshness checks to fail
- Files: `api/app/routers/analyze.py` lines 196-200
- Trigger: Postgres returns timezone-naive datetime; code adds UTC timezone on-the-fly before comparing
- Detail: Fix is present (`if cache_updated.tzinfo is None: cache_updated = cache_updated.replace(tzinfo=timezone.utc)`) but defensive pattern indicates fragile handling
- Workaround: Works correctly due to explicit check
- Fix approach: Always store and retrieve timestamps as UTC in database; ensure ORM is configured for UTC-aware datetimes (`SQLALCHEMY_TIMEZONE_AWARE=True`)

## Security Considerations

**JWT Secret Handling:**
- Risk: Frontend uses hardcoded NEXTAUTH_SECRET for JWT signing/verification; no rotation mechanism
- Files: `webapp/src/auth.ts` lines 42-56
- Current mitigation: Secret stored in environment variable (.env), not in code
- Recommendations:
  - Implement JWT secret rotation strategy every 30-90 days
  - Use asymmetric signing (RS256) instead of HS256 for better separation of concerns
  - Add JWT `iat` (issued-at) and `exp` claim validation

**Impersonation Token Stored in localStorage:**
- Risk: Admin impersonation tokens stored in plaintext localStorage; vulnerable to XSS attacks
- Files:
  - `webapp/src/app/admin/users/[id]/page.tsx` lines 113, 132-133
  - `webapp/src/lib/auth-fetch.ts` lines 26-29
  - `webapp/src/components/ImpersonationBanner.tsx` lines 25, 31, 74-76
- Current mitigation: localStorage unavailable check tries/catches; not available in private browsing
- Recommendations:
  - Move impersonation token to memory-only state (not persisted)
  - Use HTTP-only cookies instead of localStorage
  - Add CSRF token validation to impersonation endpoints
  - Implement audit logging for all impersonation actions

**SSRF in URL Validator:**
- Risk: User-supplied URLs analyzed via Playwright; private IP ranges, localhost could be exploited
- Files: `api/app/services/url_validator.py` (validation check exists)
- Current mitigation: Validator checks against private IP ranges
- Recommendations:
  - Add rate limiting per domain to prevent abuse of internal service scanning
  - Block file:// protocol explicitly
  - Implement DNS rebinding protection

**Credentials in Error Messages:**
- Risk: Database or API errors may leak sensitive information in logs
- Files:
  - `api/app/routers/analyze.py` line 208 logs generic "cache lookup failed"
  - Error responses sanitized but worth auditing
- Current mitigation: Generic error messages returned to clients; detailed logs server-side
- Recommendations:
  - Implement centralized error logging with PII masking
  - Audit all logger.exception() calls for leaked credentials

## Performance Bottlenecks

**Page Render via Playwright (30s Timeout):**
- Problem: HTML rendering is slowest detector; 30s timeout per page
- Files: `api/app/services/page_renderer.py` line 34
- Cause: Playwright must fetch, parse, and execute all JavaScript; unavoidable but slow
- Numbers: Timings tracked in `api/app/routers/analyze.py` line 754
- Impact: Blocks entire analysis chain; client UI shows loading spinner for 10-20s on average
- Improvement path:
  - Cache rendered HTML per domain (invalidate weekly)
  - Use headless Chrome directly instead of Playwright wrapper
  - Implement request timeout for slow-loading pages (15s instead of 30s)
  - Stream partial results back to client while background processing continues

**Concurrent asyncio.gather() with Timeout Failures:**
- Problem: All 11 detector chains run in parallel; if one times out, entire analysis suffers
- Files: `api/app/routers/analyze.py` lines 300-336 (product-level detectors) and line 445 (store-level)
- Cause: Using `asyncio.gather(*coros, return_exceptions=True)` waits for all tasks; no timeout per task
- Impact: One slow detector (e.g., accessibility scan, page speed API) delays final response
- Improvement path:
  - Implement per-detector timeout using `asyncio.wait_for()`
  - Return partial results if timeout occurs (graceful degradation)
  - Track timeout frequency per detector; disable slow ones if hitting >20% timeout rate

**StoreAnalysis Cache Lookup Failure Fallback:**
- Problem: If cache lookup throws exception, full analysis runs (no partial cache reuse)
- Files: `api/app/routers/analyze.py` lines 188-208
- Cause: Try/except at cache level swallows exception; falls through to full analysis
- Impact: Transient DB errors cause unnecessary 30s page renders for already-analyzed domains
- Improvement path:
  - Implement fallback to in-memory "hot cache" for recently accessed domains
  - Return cached results even if slightly stale (1 day) during DB outages
  - Add metrics for cache hit/miss/stale rates

## Fragile Areas

**Analyze Page State Machine (Multiple useEffect, useState Interactions):**
- Files: `webapp/src/app/analyze/page.tsx`
- Why fragile: 10+ useState calls managing loading, result, plan data, paywall state, reveal animations
- State dependencies: plan data, URL params, session status, credit exhaustion, teaser mode all interact
- Possible issues:
  - Logout during analysis doesn't properly clean up abortRef, can trigger stale setState
  - Reveal sequence animations hardcoded with timeouts (1.5s, 1.8s, 2.8s); reordering breaks UX
  - Plan loading race condition: if setPlanLoading happens after abort, state stuck on "loading"
- Safe modification:
  - Extract plan fetch + analysis orchestration into custom hook with clear state machine
  - Use explicit state tags (LOADING, ERROR, SUCCESS, CREDIT_EXHAUSTED) instead of 4+ booleans
  - Test coverage: Add tests for abort signal cleanup, plan load order, and concurrent state updates
- Test coverage: Limited tests for interaction between plan data and analysis fetches

**Database Timestamp Handling (Timezone Mismatch):**
- Files:
  - `api/app/models.py` lines 37-38, 60 (created_at, updated_at)
  - `api/app/routers/analyze.py` lines 196-200
- Why fragile: Postgres may return naive datetimes depending on connection settings
- Possible issues:
  - Cache freshness checks fail silently if timezone isn't handled correctly
  - Alembic migrations may not set UTC on existing columns
  - DST transitions could cause off-by-one-hour cache misses
- Safe modification:
  - Explicitly set `DateTime(timezone=True)` on all timestamp columns in models
  - Migrate all existing rows to UTC: `ALTER TABLE table_name ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC'`
  - Configure SQLAlchemy: `SQLALCHEMY_ECHO_POOL=False` and ensure UTC enforcement in session
- Test coverage: No explicit tests for timezone edge cases

**IssueCard Component (1604 Lines with Nested Conditionals):**
- Files: `webapp/src/components/analysis/IssueCard.tsx`
- Why fragile: Massive switch/if tree matching leak keys to icon sets and signal checklists
- Possible issues:
  - New dimension added but icon not added — renders default instead of warning
  - Signal checklist types must match backend signals exactly; deserialization mismatch crashes
  - Expandable inline detail rendering uses same layout for all; custom dimensions break layout
- Safe modification:
  - Extract signal checklist renderers into separate components per dimension
  - Use a dimension registry object mapping key → { icon, component, signals }
  - Add runtime validation that incoming signals match expected schema
- Test coverage: Limited tests for individual signal renderers; no tests for expandable state

**Scan Dedup Lock (Single Process Assumption):**
- Files: `api/app/services/scan_dedup.py`
- Why fragile: Uses module-level dict; only safe with `processes=1` in Gunicorn/Uvicorn
- Possible issues:
  - Horizontal scaling (multiple processes) leads to duplicate concurrent scans (lock not shared)
  - Process crash leaves stale locks for 60 seconds
  - No observability into lock state; can't debug stuck scans
- Safe modification:
  - Switch to Redis-backed locks: `SET key NX EX 60`
  - Implement lock monitoring endpoint for ops
  - Test under concurrent load with integration tests
- Test coverage: Unit tests exist (`api/tests/test_scan_dedup.py`) but no multi-process tests

## Scaling Limits

**Playwright Browser Pool:**
- Current capacity: Single browser instance per request (creates/destroys on each analyze)
- Limit: ~10-15 concurrent pages at 30s timeout each = ~5-7 min response time under load
- Scaling path:
  - Implement persistent browser pool (launch once, reuse for 1000+ pages)
  - Use browser pool library like `puppeteer-cluster` or Playwright's internal pooling
  - Monitor memory: browsers leak memory after ~500 pages; implement periodic restart

**Database Connection Pool:**
- Current capacity: Default SQLAlchemy pool (5 connections)
- Limit: 5 concurrent database operations; rest queue up
- Scaling path:
  - Increase pool size to 10-20 for expected concurrent load
  - Set `pool_pre_ping=True` to detect stale connections early
  - Monitor with `SELECT count(*) FROM pg_stat_activity` during peak load

**In-Memory Lock Dictionary Growth:**
- Current capacity: Entries auto-expire after 60s; no hard limit
- Limit: ~100k+ entries before memory becomes significant (each entry ~100 bytes = ~10MB)
- Scaling path: Migrate to Redis (no memory impact on Python process)

**StoreAnalysis Cache (7-Day Invalidation):**
- Current capacity: One row per domain per user; unbounded growth
- Limit: Large customers with 1000+ domains see cache miss rate increase as table grows
- Scaling path:
  - Implement LRU eviction policy (keep latest 10k per user)
  - Add index on `(user_id, updated_at)` for fast stale-entry cleanup
  - Consider moving cache to Redis with automatic TTL

## Dependencies at Risk

**next-auth@5.0.0-beta.30 (Beta Version):**
- Risk: Beta version with potential breaking changes; not production-ready
- Impact: Major version release could require rewrite of auth callbacks
- Migration plan: Monitor `next-auth@5` release timeline; test release candidates early; have rollback plan to 4.x if needed

**Playwright (Pinned to Latest Minor):**
- Risk: Dependencies on internal Playwright APIs; browser compatibility changes
- Impact: New browser versions might break rendering; performance regressions
- Migration plan: Lock to specific Playwright version; implement version-locked browser docker image

**axe-playwright-python (Unmaintained):**
- Risk: Limited maintenance; alternative is `@axe-core/playwright` (JS)
- Impact: Security vulnerabilities not patched; incompatibility with new Playwright versions
- Migration plan: Consider switching to axe-core via Node.js integration; or maintain fork if critical

## Missing Critical Features

**Distributed Scan Dedup:**
- Problem: Dedup doesn't work with multiple API processes
- Blocks: Can't scale horizontally; duplicate expensive analyses run concurrently
- Current blocker: Blocks production deployment with Gunicorn processes > 1

**Observability for Detector Performance:**
- Problem: Timings tracked but not exposed; no dashboard showing which detectors are slow
- Blocks: Can't identify performance regression; operators blind to which dimension causes slowdown
- Current blocker: Reactive debugging only when users complain

**Streaming Analysis Results:**
- Problem: Client waits 20+ seconds for complete analysis; could show partial results early
- Blocks: Can't improve perceived performance; UX frozen during analysis
- Current blocker: No immediate urgency but impacts user experience

**Admin Dashboard for Cache Management:**
- Problem: No way to invalidate domain cache; expired analyses stay cached
- Blocks: Customer reports old data → admin has no recourse without direct DB access
- Current blocker: Rare but impacts user trust when encountered

## Test Coverage Gaps

**Plan Data Race Conditions:**
- What's not tested: Multiple simultaneous plan fetches; plan arriving after analysis completes; plan load failure during analysis
- Files: `webapp/src/app/analyze/page.tsx` lines 100-147
- Risk: Race conditions in prod if plan load is slow; state machine doesn't handle race
- Priority: High (directly impacts paywall gating accuracy)

**Timezone Edge Cases in Cache Freshness:**
- What's not tested: Timezone-aware vs naive datetime comparisons; DST transitions; migration from naive to UTC
- Files: `api/app/routers/analyze.py` lines 196-200
- Risk: Cache stale/fresh checks fail silently in prod; hard to debug
- Priority: High (data integrity)

**Multi-Process Scan Dedup Failures:**
- What's not tested: Multiple Gunicorn workers attempting concurrent scans; lock contention
- Files: `api/app/services/scan_dedup.py`
- Risk: Horizontal scaling breaks dedup; silent duplicate analyses
- Priority: High (critical for scaling)

**Error Recovery in Database Persistence:**
- What's not tested: DB failures during Scan/ProductAnalysis/StoreAnalysis insert; rollback behavior; stale transaction state
- Files:
  - `api/app/routers/analyze.py` lines 765-825
- Risk: Partial data written on failure; consistency violations
- Priority: Medium (fire-and-forget pattern has graceful fallback)

**IssueCard Expandable State Edge Cases:**
- What's not tested: Expand → collapse → re-expand; switching products while expanded; animation glitches
- Files: `webapp/src/components/analysis/IssueCard.tsx`
- Risk: UX breaks under rapid interaction
- Priority: Medium (low-impact visual glitch)

**Accessibility Scanner Timeout Handling:**
- What's not tested: Axe scan timeout on very large pages; recovery behavior; signal interpretation when partial results returned
- Files:
  - `api/app/services/accessibility_scanner.py` line 69 (20s timeout)
  - `api/app/routers/analyze.py` lines 276-281
- Risk: Accessibility scores inaccurate on complex pages; silently degrades
- Priority: Medium (affects score accuracy)

## Known Workarounds

**localStorage in Private Browsing:**
- Workaround: Try/catch on localStorage access; gracefully degrade to session-only state
- Files:
  - `webapp/src/lib/auth-fetch.ts` lines 24-30
  - `webapp/src/components/ImpersonationBanner.tsx` lines 35, 54

**Playwright HTML Fetcher Slow:**
- Workaround: 30s timeout catches most cases; slower pages (>30s) fail gracefully
- Files: `api/app/services/page_renderer.py` line 34

**DB Connection Errors During Cache Lookup:**
- Workaround: Exception caught; falls through to full analysis instead of returning error
- Files: `api/app/routers/analyze.py` lines 207-208

---

*Concerns audit: 2026-04-11*
