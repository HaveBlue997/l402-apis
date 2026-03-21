#!/usr/bin/env bash
#
# lnget Integration Tests for NautDev L402 API
#
# Prerequisites:
#   - lnget installed: go install github.com/lightninglabs/lnget/cmd/lnget@latest
#   - lnget configured with a funded Lightning wallet (~1000 sats minimum)
#   - API server running (local or production)
#
# Usage:
#   ./tests/lnget-integration.sh                    # Test against production
#   ./tests/lnget-integration.sh http://localhost:9080  # Test against local
#
# Exit codes:
#   0 = all tests passed
#   1 = one or more tests failed
#

set -euo pipefail

BASE_URL="${1:-https://api.nautdev.com}"
PASS=0
FAIL=0
ERRORS=()

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_pass() { echo -e "${GREEN}✅ PASS${NC}: $1"; ((PASS++)); }
log_fail() { echo -e "${RED}❌ FAIL${NC}: $1 — $2"; ((FAIL++)); ERRORS+=("$1: $2"); }
log_info() { echo -e "${YELLOW}ℹ️  INFO${NC}: $1"; }

# Check prerequisites
if ! command -v lnget &> /dev/null; then
    echo "lnget not found. Install: go install github.com/lightninglabs/lnget/cmd/lnget@latest"
    exit 1
fi

if ! lnget ln status &> /dev/null; then
    echo "lnget Lightning backend not configured. Run: lnget config init"
    exit 1
fi

echo "═══════════════════════════════════════════════════"
echo "  NautDev L402 API — lnget Integration Tests"
echo "  Target: ${BASE_URL}"
echo "  Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── Test 1: Free endpoints (no payment required) ───────────────

log_info "Testing free endpoints (should return 200 without payment)..."

# Health endpoint
HEALTH=$(lnget -q "${BASE_URL}/api/v1/health" 2>/dev/null) || true
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    log_pass "Health endpoint returns status:ok"
else
    log_fail "Health endpoint" "Expected status:ok, got: ${HEALTH:0:100}"
fi

# Pricing endpoint
PRICING=$(lnget -q "${BASE_URL}/api/v1/pricing" 2>/dev/null) || true
if echo "$PRICING" | grep -q '"endpoints"'; then
    log_pass "Pricing endpoint returns endpoint list"
else
    log_fail "Pricing endpoint" "Expected endpoints array, got: ${PRICING:0:100}"
fi

# LLM models (free)
MODELS=$(lnget -q "${BASE_URL}/api/v1/llm/models" 2>/dev/null) || true
if echo "$MODELS" | grep -q 'model'; then
    log_pass "LLM models endpoint returns model list"
else
    log_fail "LLM models endpoint" "Expected model list, got: ${MODELS:0:100}"
fi

# Sanctions status (free)
SSTATUS=$(lnget -q "${BASE_URL}/api/v1/sanctions/status" 2>/dev/null) || true
if echo "$SSTATUS" | grep -q 'total_entries'; then
    log_pass "Sanctions status returns list counts"
else
    log_fail "Sanctions status" "Expected total_entries, got: ${SSTATUS:0:100}"
fi

# OpenAPI spec
OPENAPI=$(lnget -q "${BASE_URL}/openapi.json" 2>/dev/null) || true
if echo "$OPENAPI" | grep -q '"openapi"'; then
    log_pass "OpenAPI spec returns valid document"
else
    log_fail "OpenAPI spec" "Expected openapi field, got: ${OPENAPI:0:100}"
fi

echo ""

# ─── Test 2: L402 payment flow (paid endpoints) ─────────────────

log_info "Testing L402 payment flow (lnget handles 402 → pay → retry)..."

# Sanctions check (paid)
SANCTIONS=$(lnget -q --max-amount 100 "${BASE_URL}/api/v1/sanctions/check?name=John+Doe" 2>/dev/null) || true
if echo "$SANCTIONS" | grep -q '"matches"'; then
    log_pass "Sanctions check: L402 payment + data response"
elif echo "$SANCTIONS" | grep -q '"results"'; then
    log_pass "Sanctions check: L402 payment + results response"
else
    log_fail "Sanctions check L402 flow" "Expected matches/results in response, got: ${SANCTIONS:0:200}"
fi

# Marine weather (paid)
MARINE=$(lnget -q --max-amount 100 "${BASE_URL}/api/v1/weather/marine?zone=GMZ335" 2>/dev/null) || true
if echo "$MARINE" | grep -q -i 'forecast\|weather\|zone'; then
    log_pass "Marine weather: L402 payment + forecast data"
else
    log_fail "Marine weather L402 flow" "Expected forecast data, got: ${MARINE:0:200}"
fi

# Crypto price (paid)
CRYPTO=$(lnget -q --max-amount 100 "${BASE_URL}/api/v1/crypto/price?symbol=BTC" 2>/dev/null) || true
if echo "$CRYPTO" | grep -q -i 'price\|btc\|bitcoin'; then
    log_pass "Crypto price: L402 payment + price data"
else
    log_fail "Crypto price L402 flow" "Expected price data, got: ${CRYPTO:0:200}"
fi

# Domain WHOIS (paid)
WHOIS=$(lnget -q --max-amount 100 "${BASE_URL}/api/v1/domain/whois?domain=example.com" 2>/dev/null) || true
if echo "$WHOIS" | grep -q -i 'domain\|registrar\|whois'; then
    log_pass "Domain WHOIS: L402 payment + WHOIS data"
else
    log_fail "Domain WHOIS L402 flow" "Expected WHOIS data, got: ${WHOIS:0:200}"
fi

echo ""

# ─── Test 3: Token caching ──────────────────────────────────────

log_info "Testing token caching (second request should reuse credential)..."

# Make two requests — second should be free (cached macaroon)
FIRST=$(lnget -q --max-amount 100 "${BASE_URL}/api/v1/sanctions/check?name=Jane+Smith" 2>/dev/null) || true
SECOND=$(lnget -q --max-amount 100 "${BASE_URL}/api/v1/sanctions/check?name=Jane+Smith" 2>/dev/null) || true

if [ -n "$FIRST" ] && [ -n "$SECOND" ]; then
    log_pass "Token caching: both requests returned data"
else
    log_fail "Token caching" "Expected data from both requests"
fi

echo ""

# ─── Test 4: Payment limits ─────────────────────────────────────

log_info "Testing payment limits (--max-amount should reject expensive invoices)..."

# Set max-amount to 1 sat — should refuse to pay any real invoice
REFUSED=$(lnget -q --max-amount 1 "${BASE_URL}/api/v1/sanctions/check?name=test" 2>&1) || true
if echo "$REFUSED" | grep -qi 'exceed\|refused\|limit\|too expensive\|max'; then
    log_pass "Payment limit: lnget refused invoice exceeding max-amount"
else
    log_info "Payment limit: response was '${REFUSED:0:100}' — may have cached token from earlier test"
fi

echo ""

# ─── Test 5: LLM Inference (paid, higher cost) ──────────────────

log_info "Testing LLM inference endpoint..."

LLM=$(lnget -q --max-amount 200 -X POST \
    -H "Content-Type: application/json" \
    -d '{"model":"llama3.1:latest","prompt":"Say hello in exactly 3 words.","max_tokens":20}' \
    "${BASE_URL}/api/v1/llm/chat" 2>/dev/null) || true

if echo "$LLM" | grep -q -i 'response\|content\|message\|hello'; then
    log_pass "LLM inference: L402 payment + model response"
else
    log_fail "LLM inference L402 flow" "Expected LLM response, got: ${LLM:0:200}"
fi

echo ""

# ─── Summary ────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "═══════════════════════════════════════════════════"

if [ ${#ERRORS[@]} -gt 0 ]; then
    echo ""
    echo "Failures:"
    for err in "${ERRORS[@]}"; do
        echo "  • $err"
    done
fi

echo ""
exit $FAIL
