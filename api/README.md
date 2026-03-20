# OpenClaw L402 Agent Data API

Production API server providing sanctions screening, company search, and marine weather data for AI agents. Designed to run behind an [L402](https://docs.lightning.engineering/the-lightning-network/l402) paywall via [Aperture](https://github.com/lightninglabs/aperture).

## Endpoints

| Endpoint | Description | Paywalled |
|---|---|---|
| `GET /api/v1/sanctions/check` | Check name against OFAC SDN list | Yes |
| `GET /api/v1/sanctions/status` | SDN list loading status | Yes |
| `GET /api/v1/company/search` | Search business entity registrations | Yes |
| `GET /api/v1/company/states` | List supported states | Yes |
| `GET /api/v1/weather/marine` | Marine weather from NOAA | Yes |
| `GET /api/v1/health` | Health check | No |
| `GET /docs` | Swagger UI | No |
| `GET /openapi.json` | OpenAPI spec | No |

## Quick Start

```bash
npm install
cp .env.example .env
npm start
```

The server starts on port 9090. On startup, it downloads the OFAC SDN list (~15MB CSV) from the US Treasury and refreshes it daily.

## API Usage

### Sanctions Check

```bash
# Check a name
curl "http://localhost:9090/api/v1/sanctions/check?name=John%20Smith"

# Check with country filter
curl "http://localhost:9090/api/v1/sanctions/check?name=Bank%20of&country=Iran"
```

### Company Search

```bash
# Search California
curl "http://localhost:9090/api/v1/company/search?state=CA&name=Acme"

# List supported states
curl "http://localhost:9090/api/v1/company/states"
```

**Note:** State Secretary of State offices generally don't offer free public JSON APIs. Company search currently returns mock data with the expected response shape. Production implementation will use scraping or paid data providers.

### Marine Weather

```bash
# San Francisco Bay
curl "http://localhost:9090/api/v1/weather/marine?lat=37.8&lon=-122.4"

# Chesapeake Bay
curl "http://localhost:9090/api/v1/weather/marine?lat=37.0&lon=-76.3"
```

Uses the NOAA National Weather Service API. Best for US coastal and near-shore locations.

## Aperture Integration

This server is designed to sit behind Aperture as a backend service. Aperture handles:
- L402 token creation and verification
- Lightning payment processing
- Per-request pricing

The `/api/v1/health` endpoint should be excluded from the paywall in Aperture's configuration.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `9090` | Server listen port |
| `NODE_ENV` | `production` | Environment |
| `SDN_REFRESH_HOURS` | `24` | Hours between SDN list refreshes |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |

## Architecture

```
src/
├── server.js              # Express app setup and startup
├── openapi.js             # OpenAPI 3.0 specification
├── middleware/
│   └── validate.js        # Input validation middleware
├── routes/
│   ├── sanctions.js       # /api/v1/sanctions/*
│   ├── company.js         # /api/v1/company/*
│   └── marine.js          # /api/v1/weather/marine
└── services/
    ├── sanctions.js       # OFAC SDN list download, parse, search
    ├── company.js         # State business entity search
    └── marine.js          # NOAA weather API client
```
