#!/usr/bin/env node

/**
 * Velocibot MCP Server
 *
 * Exposes all L402 API endpoints as MCP tools.
 * Agents can discover and call these tools via the MCP protocol.
 * When running behind Aperture, payments are handled transparently.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = process.env.API_BASE || "http://localhost:9090";

const server = new Server(
  {
    name: "velocibot-agent-services",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- Tool Definitions ---

const TOOLS = [
  {
    name: "check_sanctions",
    description:
      "Check a person or entity name against the US Treasury OFAC Specially Designated Nationals (SDN) sanctions list. Returns matching entries with program details. Essential for agents conducting financial transactions.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name to check against the SDN list",
        },
        country: {
          type: "string",
          description: "Optional country filter (ISO 2-letter code)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "search_company",
    description:
      "Search for business entity registrations across US states (Delaware, California, New York). Returns entity name, number, status, type, and formation date.",
    inputSchema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          description: "US state code (DE, CA, NY)",
          enum: ["DE", "CA", "NY"],
        },
        name: {
          type: "string",
          description: "Company name to search for",
        },
      },
      required: ["state", "name"],
    },
  },
  {
    name: "marine_weather",
    description:
      "Get marine weather forecasts for US coastal locations from NOAA. Returns current conditions, wind, temperature, and extended forecast.",
    inputSchema: {
      type: "object",
      properties: {
        lat: {
          type: "number",
          description: "Latitude of the location",
        },
        lon: {
          type: "number",
          description: "Longitude of the location",
        },
      },
      required: ["lat", "lon"],
    },
  },
  {
    name: "prediction_weather",
    description:
      "Get structured weather prediction data useful for prediction markets. Includes hourly temperatures, precipitation probabilities, quantitative grid data, and auto-generated prediction market suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        lat: {
          type: "number",
          description: "Latitude of the location",
        },
        lon: {
          type: "number",
          description: "Longitude of the location",
        },
      },
      required: ["lat", "lon"],
    },
  },
  {
    name: "crypto_price",
    description:
      "Get current cryptocurrency price data including 24h change, market cap, volume, and sats-per-dollar conversion. Supports bitcoin, ethereum, and solana.",
    inputSchema: {
      type: "object",
      properties: {
        coin: {
          type: "string",
          description: "Cryptocurrency to query",
          enum: ["bitcoin", "ethereum", "solana"],
          default: "bitcoin",
        },
      },
    },
  },
  {
    name: "bitcoin_fees",
    description:
      "Get current Bitcoin network fee estimates in sat/vByte for different confirmation targets (fastest, 30min, 1hour, economy).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "lightning_stats",
    description:
      "Get Lightning Network statistics: node count, channel count, total capacity, average and median channel sizes.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// --- Handlers ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let url;
    switch (name) {
      case "check_sanctions": {
        const params = new URLSearchParams({ name: args.name });
        if (args.country) params.set("country", args.country);
        url = `${API_BASE}/api/v1/sanctions/check?${params}`;
        break;
      }
      case "search_company": {
        const params = new URLSearchParams({ state: args.state, name: args.name });
        url = `${API_BASE}/api/v1/company/search?${params}`;
        break;
      }
      case "marine_weather": {
        url = `${API_BASE}/api/v1/weather/marine?lat=${args.lat}&lon=${args.lon}`;
        break;
      }
      case "prediction_weather": {
        url = `${API_BASE}/api/v1/predictions/weather?lat=${args.lat}&lon=${args.lon}`;
        break;
      }
      case "crypto_price": {
        const coin = args.coin || "bitcoin";
        url = `${API_BASE}/api/v1/crypto/price?coin=${coin}`;
        break;
      }
      case "bitcoin_fees": {
        url = `${API_BASE}/api/v1/crypto/fees`;
        break;
      }
      case "lightning_stats": {
        url = `${API_BASE}/api/v1/crypto/lightning/stats`;
        break;
      }
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    const response = await fetch(url);
    const data = await response.json();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error calling ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Velocibot MCP Server running on stdio");
}

main().catch(console.error);
