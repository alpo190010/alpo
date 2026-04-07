#!/usr/bin/env bash
set -euo pipefail

# Post-cutover verification script for alpo.ai
# Run after DNS propagation to verify the full production stack.
# Exit 0 = all checks pass. Exit 1 = one or more failures.

DOMAIN="alpo.ai"
EXPECTED_IP="134.199.142.211"
FAILURES=0

pass() { printf "  \033[32m✓ PASS\033[0m  %s\n" "$1"; }
fail() { printf "  \033[31m✗ FAIL\033[0m  %s\n" "$1"; FAILURES=$((FAILURES + 1)); }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   alpo.ai — Post-Cutover Verification        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── 1. DNS Resolution ──────────────────────────────────────────────────────
echo "1. DNS Resolution"
RESOLVED_IP=$(dig +short "$DOMAIN" A | tail -1)
if [ "$RESOLVED_IP" = "$EXPECTED_IP" ]; then
  pass "dig $DOMAIN A → $RESOLVED_IP"
else
  fail "dig $DOMAIN A → '${RESOLVED_IP:-<empty>}' (expected $EXPECTED_IP)"
fi

# ─── 2. HTTPS & TLS ─────────────────────────────────────────────────────────
echo "2. HTTPS & TLS"
HTTP_STATUS=$(curl -sI --max-time 10 "https://$DOMAIN" -o /dev/null -w '%{http_code}' 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  pass "https://$DOMAIN returned $HTTP_STATUS"
else
  fail "https://$DOMAIN returned $HTTP_STATUS (expected 200)"
fi

# ─── 3. Health Endpoint ─────────────────────────────────────────────────────
echo "3. Health Endpoint"
HEALTH_BODY=$(curl -sf --max-time 10 "https://$DOMAIN/api/health" 2>/dev/null || echo "")
if echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
  pass "/api/health → $HEALTH_BODY"
else
  fail "/api/health → '${HEALTH_BODY:-<no response>}' (expected {\"status\":\"ok\",...})"
fi

# ─── 4. www Redirect ────────────────────────────────────────────────────────
echo "4. www → apex Redirect"
WWW_STATUS=$(curl -sI --max-time 10 "https://www.alpo.ai" -o /dev/null -w '%{http_code}' 2>/dev/null || echo "000")
WWW_LOCATION=$(curl -sI --max-time 10 "https://www.alpo.ai" 2>/dev/null | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
if [ "$WWW_STATUS" = "301" ] && echo "$WWW_LOCATION" | grep -q "https://$DOMAIN"; then
  pass "https://www.alpo.ai → $WWW_STATUS Location: $WWW_LOCATION"
else
  fail "https://www.alpo.ai → $WWW_STATUS Location: '${WWW_LOCATION:-<none>}' (expected 301 → https://$DOMAIN)"
fi

# ─── 5. Webhook Reachability ────────────────────────────────────────────────
echo "5. Webhook Reachability"
WEBHOOK_STATUS=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' -X POST "https://$DOMAIN/api/webhook" 2>/dev/null || echo "000")
if [ "$WEBHOOK_STATUS" = "401" ]; then
  pass "POST /api/webhook → $WEBHOOK_STATUS (HMAC gate active)"
else
  fail "POST /api/webhook → $WEBHOOK_STATUS (expected 401 — endpoint unreachable or misconfigured)"
fi

# ─── 6. Compression ─────────────────────────────────────────────────────────
echo "6. Compression"
ENCODING=$(curl -sI -H 'Accept-Encoding: gzip, br, zstd' --max-time 10 "https://$DOMAIN" 2>/dev/null | grep -i '^content-encoding:' | tr -d '\r' | awk '{print $2}')
if [ -n "$ENCODING" ]; then
  pass "Content-Encoding: $ENCODING"
else
  fail "No Content-Encoding header (expected gzip, br, or zstd)"
fi

# ─── 7. Cloudflare Active ──────────────────────────────────────────────────
echo "7. Cloudflare Active"
CF_RAY=$(curl -sI --max-time 10 "https://$DOMAIN" 2>/dev/null | grep -i '^cf-ray:' | tr -d '\r' | awk '{print $2}')
if [ -n "$CF_RAY" ]; then
  pass "cf-ray: $CF_RAY"
else
  fail "No cf-ray header (Cloudflare not proxying traffic)"
fi

# ─── 8. Static Asset Caching ───────────────────────────────────────────────
echo "8. Static Asset Caching"
# Find a real _next/static asset URL from the page source
STATIC_ASSET=$(curl -sf --max-time 10 "https://$DOMAIN" 2>/dev/null | grep -oP '/_next/static/[^"]+\.js' | head -1)
if [ -n "$STATIC_ASSET" ]; then
  CF_CACHE=$(curl -sI --max-time 10 "https://${DOMAIN}${STATIC_ASSET}" 2>/dev/null | grep -i '^cf-cache-status:' | tr -d '\r' | awk '{print $2}')
  if [ -n "$CF_CACHE" ]; then
    pass "cf-cache-status: $CF_CACHE on $STATIC_ASSET"
  else
    fail "No cf-cache-status header on $STATIC_ASSET"
  fi
else
  fail "Could not find a /_next/static/ asset to test caching"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "══════════════════════════════════════════════"
  printf "\033[32m  All 8 checks passed. Production is live.\033[0m\n"
  echo "══════════════════════════════════════════════"
  exit 0
else
  echo "══════════════════════════════════════════════"
  printf "\033[31m  %d check(s) failed. See above for details.\033[0m\n" "$FAILURES"
  echo "══════════════════════════════════════════════"
  exit 1
fi
