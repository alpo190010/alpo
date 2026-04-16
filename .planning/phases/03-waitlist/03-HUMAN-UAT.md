---
status: partial
phase: 03-waitlist
source: [03-VERIFICATION.md]
started: 2026-04-16T15:20:00+04:00
updated: 2026-04-16T15:20:00+04:00
---

## Current Test

[awaiting human testing]

## Tests

### 1. Anonymous User Auth Gate Flow
expected: Clicking "Join Pro Waitlist" as an anonymous user opens AuthModal with callbackUrl=/pricing?waitlist=1. After signup, redirect back auto-enrolls user and shows confirmation.
result: [pending]

### 2. Authenticated User Click-to-Confirm
expected: Clicking "Join Pro Waitlist" as a signed-in user shows loading state on button, fires POST /user/waitlist, then displays "You're on the list!" confirmation with fade-in animation.
result: [pending]

### 3. Return Visit Status Persistence
expected: A previously-waitlisted user visiting /pricing sees the confirmation message immediately without needing to click again (on-mount GET /user/plan check).
result: [pending]

### 4. Admin Waitlist Badge and Filter
expected: Admin users table shows lime-green "Waitlisted" badge for waitlisted users. Filter dropdown can isolate only waitlisted users.
result: [pending]

### 5. Admin Analytics Stat Card
expected: Admin dashboard shows "Pro Waitlist" stat card with correct count of waitlisted users from the database.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
