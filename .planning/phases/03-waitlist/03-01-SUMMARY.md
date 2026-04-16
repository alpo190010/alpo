---
phase: 03-waitlist
plan: "01"
subsystem: backend
tags: [waitlist, migration, api, fastapi, postgresql]
dependency_graph:
  requires: []
  provides: [pro_waitlist_column, POST /user/waitlist, proWaitlist in GET /user/plan]
  affects: [api/app/models.py, api/app/main.py, api/app/routers/user_plan.py]
tech_stack:
  added: []
  patterns: [alembic-column-migration, fastapi-idempotent-endpoint, sqlalchemy-boolean-column]
key_files:
  created:
    - api/alembic/versions/0011_add_pro_waitlist.py
    - api/app/routers/user_waitlist.py
  modified:
    - api/app/models.py
    - api/app/main.py
    - api/app/routers/user_plan.py
decisions:
  - "Idempotent guard via `if not current_user.pro_waitlist` — duplicate calls are no-ops, not 409s"
  - "proWaitlist uses camelCase to match existing /user/plan response convention"
  - "No request body on POST /user/waitlist — only sets a boolean flag, nothing to validate"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-16T11:01:37Z"
  tasks_completed: 2
  files_changed: 5
---

# Phase 03 Plan 01: Backend foundation for Pro waitlist — SUMMARY

## One-liner

Boolean pro_waitlist column added to users table via Alembic migration 0011, with idempotent POST /user/waitlist endpoint and proWaitlist field in GET /user/plan response.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Alembic migration and User model column | 083a00a | api/alembic/versions/0011_add_pro_waitlist.py, api/app/models.py |
| 2 | POST /user/waitlist endpoint, router registration, /user/plan augmentation | 25553c7 | api/app/routers/user_waitlist.py, api/app/main.py, api/app/routers/user_plan.py |

## What Was Built

**Migration (0011_add_pro_waitlist.py):** Adds `pro_waitlist` column to `users` table — Boolean, NOT NULL, server_default false. Migration applied: `0010 -> 0011`. `alembic heads` returns `0011 (head)`.

**User model (models.py):** `pro_waitlist = Column(Boolean, nullable=False, server_default=text("false"))` inserted after the `role` column under a `# --- Waitlist ---` section comment.

**POST /user/waitlist (user_waitlist.py):** Idempotent endpoint that sets `current_user.pro_waitlist = True` only when not already set. Uses `get_current_user_required` so unauthenticated requests receive 401. Returns `{"waitlisted": True}` on success.

**Router registration (main.py):** Import and `app.include_router(user_waitlist_router)` added after `user_scans_router` (2 references confirmed by grep).

**GET /user/plan augmentation (user_plan.py):** `"proWaitlist": current_user.pro_waitlist` appended to response dict using camelCase consistent with existing keys (userId, creditsUsed, hasCreditsRemaining, etc.).

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Compliance

All mitigate-disposition threats addressed:

- **T-03-01 (Spoofing):** `get_current_user_required` on POST /user/waitlist — raises 401 if no valid JWT.
- **T-03-04 (Information Disclosure):** `get_current_user_required` on GET /user/plan — only the owning user sees their own proWaitlist status.
- **T-03-06 (Elevation of Privilege):** Endpoint only sets `pro_waitlist = True`, no modification to `plan_tier`, `role`, or other privilege fields.

## Known Stubs

None — all data is wired to real DB columns.

## Threat Flags

None — no new security surface beyond what is documented in the plan's threat model.

## Self-Check: PASSED

- api/alembic/versions/0011_add_pro_waitlist.py: FOUND
- api/app/routers/user_waitlist.py: FOUND
- api/app/models.py contains pro_waitlist: FOUND
- api/app/main.py contains user_waitlist_router (2 occurrences): FOUND
- api/app/routers/user_plan.py contains proWaitlist: FOUND
- alembic heads returns 0011 (head): CONFIRMED
- Python import of user_waitlist router: CONFIRMED (OK)
