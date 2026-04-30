#!/usr/bin/env bash
# scripts/check_staging.sh
#
# Quick smoke-test script to run after a staging deploy.
# Exits 0 if staging is healthy, 1 if any check fails.
#
# Usage:
#   ./scripts/check_staging.sh
#   ./scripts/check_staging.sh https://custom-staging-url.railway.app
#
# Called automatically by the deploy-staging GitHub Actions workflow.

set -euo pipefail

BASE_URL="${1:-${STAGING_API_URL:-https://reelroutes-api-staging.railway.app}}"
TIMEOUT=15
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local body_contains="${4:-}"

  response=$(curl -s -o /tmp/rr_check_body.txt -w "%{http_code}" \
    --max-time "$TIMEOUT" \
    -H "Accept: application/json" \
    "$url" 2>/dev/null) || response="000"

  if [[ "$response" != "$expected_status" ]]; then
    echo -e "${RED}✗ FAIL${NC}  $name"
    echo -e "         Expected HTTP $expected_status, got $response"
    echo -e "         URL: $url"
    ((FAIL++))
    return
  fi

  if [[ -n "$body_contains" ]]; then
    if ! grep -q "$body_contains" /tmp/rr_check_body.txt 2>/dev/null; then
      echo -e "${RED}✗ FAIL${NC}  $name"
      echo -e "         Expected body to contain: '$body_contains'"
      echo -e "         Actual body: $(cat /tmp/rr_check_body.txt | head -c 200)"
      ((FAIL++))
      return
    fi
  fi

  echo -e "${GREEN}✓ PASS${NC}  $name"
  ((PASS++))
}

echo ""
echo -e "${YELLOW}━━━ ReelRoutes Staging Health Check ━━━${NC}"
echo -e "    Target: $BASE_URL"
echo -e "    Time:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# ── Core health ───────────────────────────────────────────────────────────────
check "GET /health                     → 200" \
  "$BASE_URL/health" "200" "ok"

check "GET /health/ready               → 200" \
  "$BASE_URL/health/ready" "200"

# ── Docs (should be present in staging, not in production) ───────────────────
check "GET /docs                       → 200" \
  "$BASE_URL/docs" "200" "swagger"

# ── Auth guard — no user_id should get 401 or 422 ────────────────────────────
check "GET /api/trips (no auth)        → 422" \
  "$BASE_URL/api/trips" "422"

# ── Process endpoint exists ────────────────────────────────────────────────────
check "POST /api/process (bad url)     → 422" \
  "$BASE_URL/api/process" "422"  # POST with no body → validation error

# ── Explore feed (public, no auth) ────────────────────────────────────────────
check "GET /api/explore                → 200" \
  "$BASE_URL/api/explore" "200" "items"

# ── Jobs endpoint ─────────────────────────────────────────────────────────────
check "GET /api/jobs/nonexistent       → 404" \
  "$BASE_URL/api/jobs/000000000000000000000000" "404"

# ── CORS header check ─────────────────────────────────────────────────────────
cors_header=$(curl -s -I --max-time "$TIMEOUT" \
  -H "Origin: https://reelroutes-staging.vercel.app" \
  "$BASE_URL/health" 2>/dev/null | grep -i "access-control-allow-origin" || true)

if [[ -n "$cors_header" ]]; then
  echo -e "${GREEN}✓ PASS${NC}  CORS header present"
  ((PASS++))
else
  echo -e "${YELLOW}⚠ WARN${NC}  CORS header missing — may need CORS_ORIGINS env var update"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}━━━ Results ━━━${NC}"
echo -e "    ${GREEN}Passed: $PASS${NC}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "    ${RED}Failed: $FAIL${NC}"
  echo ""
  echo -e "${RED}❌ Staging is NOT healthy — check Railway logs${NC}"
  exit 1
else
  echo -e "    ${RED}Failed: 0${NC}"
  echo ""
  echo -e "${GREEN}✅ Staging is healthy${NC}"
  exit 0
fi
