#!/usr/bin/env bash
# Local LLM Health Check — runs via qwen2.5-coder:32b on Ollama
# Gathers system data, sends to local LLM, validates JSON output
# Output: /Users/Shared/openclaw/data/status/ops-local-check.json

set -uo pipefail

STATUS_DIR="/Users/Shared/openclaw/data/status"
OUTPUT_FILE="$STATUS_DIR/ops-local-check.json"
OLLAMA_URL="http://localhost:11434/api/generate"
MODEL="qwen2.5-coder:32b"

mkdir -p "$STATUS_DIR"

# --- Gather system data ---
API_HEALTH=$(curl -sf http://localhost:9090/api/v1/health --max-time 5 2>/dev/null || echo '{"status":"down"}')
LND_INFO=$(~/bin/lncli --lnddir="$HOME/Library/Application Support/Lnd" getinfo 2>/dev/null | jq '{synced_to_chain, num_active_channels, num_peers, block_height}' 2>/dev/null || echo '{"synced_to_chain":false,"num_active_channels":0,"num_peers":0}')
ERROR_COUNT=$(tail -20 /tmp/api-server.log 2>/dev/null | grep -ciE "error|crash|EADDRINUSE|fatal" || echo "0")
ERROR_LINES=$(tail -20 /tmp/api-server.log 2>/dev/null | grep -iE "error|crash|EADDRINUSE|fatal" | head -3 || echo "none")
DNS_NAUTDEV=$(dig nautdev.com A +short 2>/dev/null | head -1 || echo "FAIL")
DNS_API=$(dig api.nautdev.com A +short 2>/dev/null | head -1 || echo "FAIL")
EXTERNAL=$(curl -sf https://api.nautdev.com/api/v1/health --max-time 10 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unreachable")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# --- Build prompt ---
PROMPT="Return only valid JSON, no explanation, no markdown.

System check data collected at $TIMESTAMP:

1. API HEALTH ENDPOINT: $API_HEALTH
   Rules: status must be \"ok\", uptime > 0 (convert seconds to hours by dividing by 3600, round to 1 decimal), sanctions total_entries > 40000 = loaded, ollama_reachable must be true

2. LND NODE: $LND_INFO
   Rules: synced_to_chain must be true, num_active_channels >= 1, num_peers >= 1

3. ERROR LOG: $ERROR_COUNT errors in last 20 lines
   Error lines: $ERROR_LINES

4. DNS: nautdev.com=$DNS_NAUTDEV, api.nautdev.com=$DNS_API
   Rules: both must resolve to IP addresses (not empty, not FAIL)

5. EXTERNAL: api.nautdev.com/api/v1/health status=$EXTERNAL
   Rules: must be \"ok\"

Fill in this JSON schema with the correct values:
{\"timestamp\":\"$TIMESTAMP\",\"api_ok\":BOOL,\"api_uptime_hours\":NUM,\"lnd_synced\":BOOL,\"lnd_peers\":INT,\"lnd_channels\":INT,\"errors_found\":INT,\"error_details\":STRING_OR_NULL,\"action_needed\":BOOL,\"action_description\":STRING_OR_NULL,\"sanctions_loaded\":BOOL,\"sanctions_total\":INT,\"ollama_reachable\":BOOL,\"dns_ok\":BOOL,\"external_ok\":BOOL}

action_needed=true if ANY check failed. action_description explains what's wrong."

# --- Send to local LLM ---
RESPONSE=$(curl -s "$OLLAMA_URL" --max-time 120 -d "$(jq -n --arg model "$MODEL" --arg prompt "$PROMPT" '{model: $model, prompt: $prompt, stream: false, options: {temperature: 0.1, num_predict: 300}}')" 2>/dev/null | jq -r '.response' 2>/dev/null)

# --- Validate and save ---
if echo "$RESPONSE" | jq . > /dev/null 2>&1; then
  echo "$RESPONSE" | jq '.' > "$OUTPUT_FILE"
  echo "✅ Local health check saved to $OUTPUT_FILE"
  # Print summary
  echo "$RESPONSE" | jq '{api_ok, lnd_synced, errors_found, action_needed, sanctions_loaded, external_ok}'
else
  echo "❌ Local LLM returned invalid JSON:"
  echo "$RESPONSE" | head -5
  # Save error state
  echo "{\"timestamp\":\"$TIMESTAMP\",\"error\":\"Local LLM returned invalid JSON\",\"raw_response\":\"$(echo "$RESPONSE" | head -3 | tr -d '"')\"}" > "$OUTPUT_FILE"
  exit 1
fi
