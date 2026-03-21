#!/usr/bin/env bash
# L402 API Smoke Tests — run every heartbeat
# Usage: ./tests/smoke.sh [--external]
# Exit code: 0 = all pass, 1 = failures detected

set -euo pipefail

BASE="http://localhost:9090"
EXTERNAL=false
FAILURES=0
PASSES=0
RESULTS=""

if [[ "${1:-}" == "--external" ]]; then
  BASE="https://nautdev.com"
  EXTERNAL=true
fi

pass() { PASSES=$((PASSES + 1)); RESULTS+="✅ $1\n"; }
fail() { FAILURES=$((FAILURES + 1)); RESULTS+="❌ $1 — $2\n"; }

# Test helper: check HTTP status and optional JSON field
test_endpoint() {
  local name="$1" method="$2" path="$3" expected_status="$4" json_check="${5:-}"
  
  local response status body
  if [[ "$method" == "POST" ]]; then
    local post_data="${6:-{}}"
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE$path" \
      -H "Content-Type: application/json" -d "$post_data" --max-time 30 2>&1)
  else
    response=$(curl -s -w "\n%{http_code}" "$BASE$path" --max-time 10 2>&1)
  fi
  
  status=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
  
  if [[ "$status" != "$expected_status" ]]; then
    fail "$name" "expected HTTP $expected_status, got $status"
    return
  fi
  
  if [[ -n "$json_check" ]]; then
    local check_result
    check_result=$(echo "$body" | jq -r "$json_check" 2>/dev/null)
    if [[ -z "$check_result" || "$check_result" == "null" || "$check_result" == "false" ]]; then
      fail "$name" "JSON check failed: $json_check"
      return
    fi
  fi
  
  pass "$name"
}

echo "🧪 L402 API Smoke Tests — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Base: $BASE"
echo "---"

# Health
test_endpoint "Health" GET "/api/v1/health" 200 '.status == "ok"'

# Sanctions
test_endpoint "Sanctions Check" GET "/api/v1/sanctions/check?name=test" 200 '.results | type == "array"'
test_endpoint "Sanctions Lists" GET "/api/v1/sanctions/lists" 200 '.lists | length > 0'
test_endpoint "Sanctions Status" GET "/api/v1/sanctions/status" 200 '.total_entries > 0'

# Company
test_endpoint "Company Search" GET "/api/v1/company/search?jurisdiction=US&name=test" 200 '.results | type == "array"'
test_endpoint "Company Jurisdictions" GET "/api/v1/company/jurisdictions" 200 '.jurisdictions | length > 0'

# Domain
test_endpoint "Domain Lookup" GET "/api/v1/domain/lookup?domain=google.com" 200 '.domain'
test_endpoint "Domain Available" GET "/api/v1/domain/available?domain=xyznotreal99999.com" 200 '.available'

# Aviation Weather
test_endpoint "METAR" GET "/api/v1/weather/aviation/metar?station=KJFK" 200
test_endpoint "TAF" GET "/api/v1/weather/aviation/taf?station=KJFK" 200
test_endpoint "Aviation Stations" GET "/api/v1/weather/aviation/stations?lat=40.6&lon=-73.8&radius=30" 200

# Marine Weather — KNOWN ISSUE: NOAA marine forecast API returns 404 for many coordinates
# Testing with 200 expectation but marking as known flaky
test_endpoint "Marine Weather" GET "/api/v1/weather/marine?lat=18.4&lon=-64.6" 200 || true
# TODO: Find valid NOAA marine zone coordinates or handle 404 gracefully in the endpoint

# LLM
test_endpoint "LLM Models" GET "/api/v1/llm/models" 200 '.models | length > 0'

# Input validation (should return 400)
test_endpoint "Missing sanctions name" GET "/api/v1/sanctions/check" 400
test_endpoint "Missing domain" GET "/api/v1/domain/lookup" 400
test_endpoint "Missing company name" GET "/api/v1/company/search?jurisdiction=US" 400

echo ""
echo "---"
printf "$RESULTS"
echo "---"
echo "Results: $PASSES passed, $FAILURES failed"

if [[ $FAILURES -gt 0 ]]; then
  echo "⚠️  SMOKE TEST FAILURES DETECTED"
  exit 1
else
  echo "✅ All smoke tests passed"
  exit 0
fi
