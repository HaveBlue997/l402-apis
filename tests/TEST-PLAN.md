# L402 APIs — Testing Infrastructure Plan

## Overview

Three layers of testing to ensure customers never hit a broken endpoint:

1. **Automated Smoke Tests** — run on every heartbeat, catch regressions fast
2. **Integration Tests** — full request/response validation per endpoint
3. **External E2E Tests** — validate the full chain (DNS → CloudFront → API Gateway → Lambda → Cloudflare tunnel → Gateway → API server)

---

## Layer 1: Smoke Tests (Every Heartbeat)

**Script:** `tests/smoke.sh`
**Frequency:** Every 2h heartbeat + every 5min fast healthcheck
**What it tests:** Every endpoint returns a valid HTTP status code with expected shape

| Endpoint | Method | Expected Status | Validates |
|----------|--------|----------------|-----------|
| `/api/v1/health` | GET | 200 | uptime > 0, sanctions loaded, ollama reachable |
| `/api/v1/sanctions/check?name=test` | GET | 200 | returns results array |
| `/api/v1/sanctions/lists` | GET | 200 | returns lists with counts |
| `/api/v1/sanctions/status` | GET | 200 | returns loaded list info |
| `/api/v1/company/search?jurisdiction=US&name=test` | GET | 200 | returns results array |
| `/api/v1/company/jurisdictions` | GET | 200 | returns jurisdictions array |
| `/api/v1/domain/lookup?domain=google.com` | GET | 200 | returns domain + registrar |
| `/api/v1/domain/available?domain=xyznotreal99999.com` | GET | 200 | returns available: true |
| `/api/v1/weather/aviation/metar?station=KJFK` | GET | 200 | returns station data |
| `/api/v1/weather/aviation/taf?station=KJFK` | GET | 200 | returns forecast |
| `/api/v1/weather/aviation/stations?lat=40.6&lon=-73.8&radius=30` | GET | 200 | returns stations array |
| `/api/v1/weather/marine?lat=18.4&lon=-64.6` | GET | 200 | returns forecast data |
| `/api/v1/llm/models` | GET | 200 | returns models array with count > 0 |
| `/api/v1/llm/generate` | POST | 200 | returns response text (short prompt) |
| `/api/v1/llm/chat` | POST | 200 | returns message content |

**Pass criteria:** All endpoints return expected status. Any failure → P1 incident.

---

## Layer 2: Integration Tests (Per Endpoint)

**Script:** `tests/integration.sh`
**Frequency:** After every code change, before any deployment
**What it tests:** Full request/response validation with realistic inputs

### Sanctions
- Search known SDN entry (e.g., "Vladimir Putin") → expect matches > 0
- Search clean name (e.g., "John Smith Xylophone") → expect matches = 0
- Search with country filter → expect filtered results
- Search with specific list filter (ofac, eu, uk, un) → expect only that list
- Empty name → expect 400 error
- Verify all 4 lists loaded with expected counts (OFAC ~18k, EU ~5.8k, UK ~19.7k, UN ~1k)

### Company Search
- Search "Apple" in US → expect results with SEC EDGAR data
- Search in GB → expect Companies House results
- List jurisdictions → expect US and GB
- Invalid jurisdiction → expect 400 error
- Missing name → expect 400 error

### Domain Intel
- Lookup known domain (google.com) → expect registrar, dates, nameservers
- Lookup our domain (nautdev.com) → expect Amazon Registrar
- Check available domain → expect available: true
- Check taken domain (google.com) → expect available: false
- Invalid domain format → expect 400 error

### Aviation Weather
- METAR for major airport (KJFK) → expect raw_text, temperature, wind
- TAF for major airport → expect forecast periods
- Stations near coordinates → expect station list with identifiers
- Invalid station code → expect appropriate error
- Invalid lat/lon → expect 400 error

### Marine Weather
- Valid coordinates (BVI area: 18.4, -64.6) → expect forecast data
- US coastal coordinates → expect NOAA data
- Missing lat/lon → expect 400 error
- Out-of-range coordinates → expect 400 error

### LLM Inference
- List models → expect 7 models (qwen3, llama3.1, devstral, deepseek-r1, command-r, qwen2.5-coder, nomic-embed-text)
- Generate with short prompt → expect response text
- Chat with simple message → expect assistant reply
- Streaming generate → expect SSE events
- Missing model → expect appropriate error
- Prompt too long (>512KB) → expect 413 error

### L402 Paywall (External Only)
- Hit paid endpoint without payment → expect 402 with Lightning invoice
- Verify invoice is valid and parseable
- Verify macaroon is returned with payment

---

## Layer 3: External E2E Tests

**Script:** `tests/e2e-external.sh`
**Frequency:** Every heartbeat
**What it tests:** Full chain from customer's perspective

- `https://nautdev.com/` → 200, HTML landing page with CSS/JS
- `https://nautdev.com/api/v1/health` → 200, valid JSON
- `https://api.nautdev.com/api/v1/health` → 200, valid JSON
- `https://nautdev.com/docs` → 200, Swagger UI
- `https://nautdev.com/openapi.json` → 200, valid OpenAPI spec
- Paid endpoint → 402 with L402 challenge header
- DNS resolution for both domains
- TLS certificate validity
- Response time < 500ms for health endpoint

---

## Layer 4: MCP Package Tests

**Script:** `tests/mcp-packages.sh`
**Frequency:** After any package publish
**What it tests:** npm packages are installable and functional

For each of the 8 `@vbotholemu/mcp-*` packages:
- `npm install` succeeds
- Package exports expected MCP tool definitions
- Tool execution returns valid response (against live API)

---

## Implementation Priority

1. **smoke.sh** — build first, integrate into heartbeat immediately
2. **e2e-external.sh** — build second, catches DNS/proxy/gateway issues
3. **integration.sh** — build third, comprehensive regression suite
4. **mcp-packages.sh** — build fourth, validates customer-facing npm packages

---

## Alerting

- Smoke test failure → post to #ai-services immediately, P1
- E2E failure → post to #ai-services + #general, P1
- Integration test failure → post to #ai-services, P2 (investigate before deploy)
- MCP test failure → post to #ai-services + #agent-skills-market, P2
