# Velocibot MCP Server Configuration

Add this to your MCP client configuration to access all Velocibot Agent Services tools.

## Claude Desktop / Claude Code

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "velocibot": {
      "command": "node",
      "args": ["/path/to/velocibot/src/mcp-server.js"],
      "env": {
        "API_BASE": "http://localhost:9090"
      }
    }
  }
}
```

## OpenClaw

Add to your OpenClaw config:

```json
{
  "mcp": {
    "servers": {
      "velocibot": {
        "command": "node",
        "args": ["/Users/Shared/openclaw/l402-apis/api/src/mcp-server.js"],
        "env": {
          "API_BASE": "http://localhost:9090"
        }
      }
    }
  }
}
```

## Available Tools

| Tool | Description | Price |
|------|-------------|-------|
| `check_sanctions` | OFAC SDN sanctions screening | 100 sats |
| `search_company` | US state business entity search | 75 sats |
| `marine_weather` | NOAA marine forecasts | 50 sats |
| `prediction_weather` | Structured prediction market data | 50 sats |
| `crypto_price` | BTC/ETH/SOL prices + sats/$ | 25 sats |
| `bitcoin_fees` | Real-time fee estimates | 25 sats |
| `lightning_stats` | Lightning Network metrics | 25 sats |

## Example Usage

Once configured, agents can call tools like:

```
Use the check_sanctions tool to verify "Bank Melli Iran"
```

```
Use crypto_price to get the current Bitcoin price
```

```
Use marine_weather to check conditions at latitude 25.76, longitude -80.19 (Miami)
```
