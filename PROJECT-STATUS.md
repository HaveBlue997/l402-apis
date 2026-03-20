# Velocibot Agent Services — Project Status

**Last Updated:** 2026-03-20 ~midnight EDT
**Built by:** Velocibot 🦖

---

## What Was Built Tonight

### 1. Lightning Network Infrastructure ⚡
- **LND v0.20.1-beta** with Neutrino light client
- Fully synced to Bitcoin mainnet
- Node alias: `Velocibot`
- Node pubkey: `035636fc55da438ecbaecbc0c52c2452020a74927ded6e0249c87308a63c48d288`
- On-chain wallet address: `bc1qgc2x3hmwtvgx8dkdh9hwh9zeg0nux7n9r64ps3`
- Auto-start via launchd configured
- Wallet credentials stored in macOS Keychain

### 2. Aperture L402 Reverse Proxy
- Compiled from source
- Configured to proxy to API server on port 9090
- Will activate once Lightning channels are open

### 3. L402 Data API Server (7 Endpoints)
**Location:** `/Users/Shared/openclaw/l402-apis/api/`
**Port:** 9090
**Docs:** http://localhost:9090/docs

| # | Endpoint | Description | Status | Price |
|---|----------|-------------|--------|-------|
| 1 | `/api/v1/sanctions/check` | OFAC SDN sanctions screening (18,706 entries) | ✅ Live, real data | 100 sats |
| 2 | `/api/v1/company/search` | US business entity search (DE/CA/NY) | ✅ Live, mock data | 75 sats |
| 3 | `/api/v1/weather/marine` | NOAA marine weather forecasts | ✅ Live, real data | 50 sats |
| 4 | `/api/v1/predictions/weather` | Prediction market weather data | ✅ Live, real data | 50 sats |
| 5 | `/api/v1/crypto/price` | BTC/ETH/SOL price data | ✅ Live, real data | 25 sats |
| 6 | `/api/v1/crypto/fees` | Bitcoin fee estimates | ✅ Live, real data | 25 sats |
| 7 | `/api/v1/crypto/lightning/stats` | Lightning Network stats | ✅ Live, real data | 25 sats |

**Features:** Rate limiting, Helmet security, OpenAPI/Swagger, input validation, ESM modules

### 4. MCP Server
**Location:** `/Users/Shared/openclaw/l402-apis/api/src/mcp-server.js`

Wraps all 7 API endpoints as MCP tools. Any agent using Claude Desktop, OpenClaw, or any MCP client can discover and call our services.

### 5. MCP Skills Marketplace (3 Skills)
**Location:** `/Users/Shared/openclaw/agent-skills-market/skills/`

| Package | Tool | Description |
|---------|------|-------------|
| `@velocibot/mcp-sanctions-check` | `check_sanctions` | OFAC sanctions screening |
| `@velocibot/mcp-marine-weather` | `marine_forecast` | NOAA marine weather |
| `@velocibot/mcp-charter-planner` | `plan_charter` | BVI charter planning (14 real anchorages!) |

TypeScript, zod validation, MCP SDK, ready for npm publish.

### 6. Landing Page
**Location:** `/Users/Shared/openclaw/l402-apis/landing/`

Dark-themed marketing/docs site with:
- Animated particle background
- Service descriptions with pricing
- L402 payment flow diagram
- curl code examples
- Responsive design

### 7. Operations
- Stack management script: `/Users/Shared/openclaw/l402-apis/scripts/start-stack.sh`
- launchd plists for auto-start (LND + API server)
- Git repos initialized and committed
- Gmail API access configured for Velocibot

---

## What's Needed Next

### Immediate (When BTC Arrives)
1. **Fund the Lightning wallet** — ~$98 BTC pending from Cash App
2. **Open 2-3 channels** to well-connected routing nodes
3. **Test Aperture end-to-end** — verify L402 payment flow works
4. **Get a domain** — `velocibot.services` or similar
5. **Deploy publicly** — either directly from UltraThor with a tunnel, or to a VPS

### This Week
6. **Replace company search mock data** with real scrapers
7. **Publish MCP skills to npm** — make them discoverable
8. **Submit to ClawHub** — marketplace listing
9. **Add more API endpoints** — expand the data menu
10. **Marketing** — Tweet about it, post in agent communities

### Architecture Decision Needed
- **How to expose publicly?** Options:
  - Cloudflare Tunnel from UltraThor (simplest, keeps everything local)
  - Deploy to a VPS (DigitalOcean/Hetzner) with LND
  - Hybrid: VPS fronts traffic, LND stays on UltraThor

---

## File Map

```
/Users/Shared/openclaw/
├── l402-apis/
│   ├── api/                    # L402 Data API server
│   │   ├── src/
│   │   │   ├── server.js       # Express server (port 9090)
│   │   │   ├── mcp-server.js   # MCP wrapper for all tools
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Business logic
│   │   │   └── middleware/     # Validation, etc.
│   │   ├── package.json
│   │   └── MCP_CONFIG.md       # MCP client configuration
│   ├── config/
│   │   └── aperture.yaml       # Aperture L402 proxy config
│   ├── landing/                # Marketing/docs site
│   │   ├── index.html
│   │   ├── style.css
│   │   └── main.js
│   ├── scripts/
│   │   └── start-stack.sh      # Stack management
│   └── PROJECT-STATUS.md       # This file
├── agent-skills-market/
│   └── skills/                 # MCP skills monorepo
│       └── packages/
│           ├── mcp-sanctions-check/
│           ├── mcp-marine-weather/
│           └── mcp-charter-planner/
├── config/
│   ├── gmail-venv/             # Gmail API virtualenv
│   ├── gmail_token.json        # OAuth token
│   └── client_secret_*.json    # OAuth credentials
├── scripts/
│   └── gmail.py                # Gmail CLI tool
└── research/                   # Earlier research output
```

---

*Built in one evening. The robots are working.* 🦖⚡
