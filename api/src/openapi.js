export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "OpenClaw L402 Agent Data API",
    version: "1.0.0",
    description:
      "AI agent services API providing sanctions screening, company search, and marine weather data. Designed to sit behind an L402 (Lightning) paywall via Aperture.",
    contact: {
      name: "OpenClaw",
      email: "support@openclaw.com",
    },
  },
  servers: [
    { url: "https://scholarship-managers-broad-epa.trycloudflare.com", description: "Production" },
    { url: "http://localhost:9090", description: "Local development" },
  ],
  paths: {
    "/api/v1/sanctions/check": {
      get: {
        tags: ["Sanctions"],
        summary: "Screen a name against multiple sanctions lists (OFAC, EU, UK, UN)",
        description:
          "Searches OFAC SDN, EU Consolidated, UK OFSI, and UN Security Council sanctions lists for matches. Specify which lists to search with the lists parameter, or omit to search all.",
        parameters: [
          {
            name: "name",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Name to screen against sanctions lists",
            example: "John Smith",
          },
          {
            name: "country",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Country to narrow the search",
            example: "Iran",
          },
          {
            name: "lists",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Comma-separated list codes to search (default: all). Valid: ofac, eu, uk, un",
            example: "ofac,eu",
          },
        ],
        responses: {
          200: {
            description: "Multi-list sanctions check result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    match: { type: "boolean", description: "True if any list had a match" },
                    results: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          list: { type: "string", enum: ["ofac", "eu", "uk", "un"] },
                          entries: { type: "array", items: { type: "object" } },
                        },
                      },
                    },
                    unavailable_lists: {
                      type: "array",
                      items: { type: "string" },
                      description: "Lists that were requested but not loaded",
                    },
                    checked_at: { type: "string", format: "date-time" },
                    lists_searched: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          400: { description: "Missing required parameters or invalid list code" },
          503: { description: "No sanctions lists loaded yet" },
        },
      },
    },
    "/api/v1/sanctions/lists": {
      get: {
        tags: ["Sanctions"],
        summary: "List available sanctions lists with entry counts and update times",
        responses: {
          200: {
            description: "Available sanctions lists",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    lists: { type: "object" },
                    valid_list_codes: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/sanctions/status": {
      get: {
        tags: ["Sanctions"],
        summary: "Get loading status for all sanctions lists",
        responses: {
          200: { description: "All sanctions list statuses" },
        },
      },
    },
    "/api/v1/company/search": {
      get: {
        tags: ["Company Search"],
        summary: "Search for business entities by jurisdiction (US via SEC EDGAR, UK via Companies House)",
        parameters: [
          {
            name: "jurisdiction",
            in: "query",
            required: false,
            schema: { type: "string", pattern: "^[A-Z]{2}$" },
            description: "Jurisdiction code: US, GB, UK, or any 2-letter US state code",
            example: "US",
          },
          {
            name: "state",
            in: "query",
            required: false,
            schema: { type: "string", pattern: "^[A-Z]{2}$" },
            description: "Alias for jurisdiction (backwards compat)",
            example: "CA",
          },
          {
            name: "name",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Company name to search for",
            example: "Apple",
          },
        ],
        responses: {
          200: {
            description: "Company search results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    results: { type: "array", items: { type: "object" } },
                    jurisdiction: { type: "string" },
                    source: { type: "string" },
                    source_name: { type: "string" },
                    data_source: {
                      type: "string",
                      enum: ["live", "error"],
                    },
                  },
                },
              },
            },
          },
          400: { description: "Invalid or unsupported jurisdiction" },
        },
      },
    },
    "/api/v1/company/jurisdictions": {
      get: {
        tags: ["Company Search"],
        summary: "List supported jurisdictions and data sources",
        responses: {
          200: { description: "List of supported jurisdictions" },
        },
      },
    },
    "/api/v1/weather/marine": {
      get: {
        tags: ["Marine Weather"],
        summary: "Get marine weather forecast for coordinates",
        description:
          "Returns wind, temperature, and forecast data from NOAA for the given coordinates. Best for US coastal and near-shore locations.",
        parameters: [
          {
            name: "lat",
            in: "query",
            required: true,
            schema: { type: "number", minimum: -90, maximum: 90 },
            description: "Latitude",
            example: 37.8,
          },
          {
            name: "lon",
            in: "query",
            required: true,
            schema: { type: "number", minimum: -180, maximum: 180 },
            description: "Longitude",
            example: -122.4,
          },
        ],
        responses: {
          200: { description: "Marine weather data" },
          404: {
            description: "No NOAA coverage for these coordinates",
          },
          502: { description: "NOAA API error" },
        },
      },
    },
    "/api/v1/llm/models": {
      get: {
        tags: ["LLM Inference"],
        summary: "List available LLM models",
        description: "Returns available models from the local Ollama instance with size and parameter info. Free discovery endpoint.",
        responses: {
          200: {
            description: "List of available models",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    models: { type: "array", items: { type: "object" } },
                    count: { type: "integer" },
                    source: { type: "string" },
                  },
                },
              },
            },
          },
          502: { description: "Ollama not reachable" },
        },
      },
    },
    "/api/v1/llm/chat": {
      post: {
        tags: ["LLM Inference"],
        summary: "Chat completion via Ollama",
        description: "Send a chat conversation to a local LLM. Supports streaming (SSE) and non-streaming responses. Pricing metadata included in response.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["model", "messages"],
                properties: {
                  model: { type: "string", example: "qwen3:32b" },
                  messages: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["role", "content"],
                      properties: {
                        role: { type: "string", enum: ["system", "user", "assistant"] },
                        content: { type: "string" },
                      },
                    },
                  },
                  stream: { type: "boolean", default: false },
                  options: {
                    type: "object",
                    properties: {
                      temperature: { type: "number" },
                      top_p: { type: "number" },
                      num_predict: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Chat completion response with token counts and pricing",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    model: { type: "string" },
                    message: { type: "object" },
                    tokens: {
                      type: "object",
                      properties: {
                        prompt: { type: "integer" },
                        completion: { type: "integer" },
                        total: { type: "integer" },
                      },
                    },
                    pricing: {
                      type: "object",
                      properties: {
                        tier: { type: "string" },
                        rate_per_1k_sats: { type: "integer" },
                        total_sats: { type: "integer" },
                        total_usd_approx: { type: "number" },
                      },
                    },
                    timing: {
                      type: "object",
                      properties: {
                        total_ms: { type: "integer" },
                        tokens_per_second: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Invalid request body" },
          502: { description: "Ollama error" },
          503: { description: "Ollama not running" },
          504: { description: "Request timed out" },
        },
      },
    },
    "/api/v1/llm/generate": {
      post: {
        tags: ["LLM Inference"],
        summary: "Raw text completion via Ollama",
        description: "Generate text from a prompt using a local LLM. Supports streaming (SSE) and non-streaming responses.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["model", "prompt"],
                properties: {
                  model: { type: "string", example: "qwen3:32b" },
                  prompt: { type: "string", example: "Explain Bitcoin's Lightning Network in one paragraph." },
                  stream: { type: "boolean", default: false },
                  options: {
                    type: "object",
                    properties: {
                      temperature: { type: "number" },
                      top_p: { type: "number" },
                      num_predict: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Text completion response with token counts and pricing",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    model: { type: "string" },
                    response: { type: "string" },
                    tokens: {
                      type: "object",
                      properties: {
                        prompt: { type: "integer" },
                        completion: { type: "integer" },
                        total: { type: "integer" },
                      },
                    },
                    pricing: {
                      type: "object",
                      properties: {
                        tier: { type: "string" },
                        rate_per_1k_sats: { type: "integer" },
                        total_sats: { type: "integer" },
                        total_usd_approx: { type: "number" },
                      },
                    },
                    timing: {
                      type: "object",
                      properties: {
                        total_ms: { type: "integer" },
                        tokens_per_second: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Invalid request body" },
          502: { description: "Ollama error" },
          503: { description: "Ollama not running" },
          504: { description: "Request timed out" },
        },
      },
    },
    "/api/v1/weather/aviation/metar": {
      get: {
        tags: ["Aviation Weather"],
        summary: "Get current METAR conditions for an airport",
        description:
          "Returns parsed METAR data including wind, visibility, ceiling, temperature, dewpoint, altimeter setting, and flight category (VFR/MVFR/IFR/LIFR) from NOAA Aviation Weather Center.",
        parameters: [
          {
            name: "station",
            in: "query",
            required: true,
            schema: { type: "string", pattern: "^[A-Z]{4}$" },
            description: "ICAO station code (4 uppercase letters)",
            example: "KJFK",
          },
        ],
        responses: {
          200: {
            description: "Current METAR observation",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    metar: { type: "object" },
                    station: { type: "string" },
                    source: { type: "string" },
                    fetched_at: { type: "string", format: "date-time" },
                    data_source: { type: "string", enum: ["live", "error"] },
                  },
                },
              },
            },
          },
          400: { description: "Invalid or missing station code" },
          502: { description: "NOAA API error or no data for station" },
        },
      },
    },
    "/api/v1/weather/aviation/taf": {
      get: {
        tags: ["Aviation Weather"],
        summary: "Get TAF forecast for an airport",
        description:
          "Returns parsed TAF (Terminal Aerodrome Forecast) data including forecast periods with wind, visibility, clouds, and weather conditions.",
        parameters: [
          {
            name: "station",
            in: "query",
            required: true,
            schema: { type: "string", pattern: "^[A-Z]{4}$" },
            description: "ICAO station code (4 uppercase letters)",
            example: "KJFK",
          },
        ],
        responses: {
          200: {
            description: "TAF forecast data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    taf: { type: "object" },
                    station: { type: "string" },
                    source: { type: "string" },
                    fetched_at: { type: "string", format: "date-time" },
                    data_source: { type: "string", enum: ["live", "error"] },
                  },
                },
              },
            },
          },
          400: { description: "Invalid or missing station code" },
          502: { description: "NOAA API error or no data for station" },
        },
      },
    },
    "/api/v1/weather/aviation/stations": {
      get: {
        tags: ["Aviation Weather"],
        summary: "Find nearby aviation weather stations (free)",
        description:
          "Search for airports/stations reporting METAR data within a radius of given coordinates. Returns station identifiers, names, and current flight categories.",
        parameters: [
          {
            name: "lat",
            in: "query",
            required: true,
            schema: { type: "number", minimum: -90, maximum: 90 },
            description: "Latitude",
            example: 40.6,
          },
          {
            name: "lon",
            in: "query",
            required: true,
            schema: { type: "number", minimum: -180, maximum: 180 },
            description: "Longitude",
            example: -73.8,
          },
          {
            name: "radius",
            in: "query",
            required: false,
            schema: { type: "number", minimum: 1, maximum: 200, default: 30 },
            description: "Search radius in nautical miles (default 30, max 200)",
            example: 30,
          },
        ],
        responses: {
          200: {
            description: "Nearby stations with flight categories",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    stations: { type: "array", items: { type: "object" } },
                    count: { type: "integer" },
                    search_center: { type: "object" },
                    radius_nm: { type: "number" },
                    source: { type: "string" },
                  },
                },
              },
            },
          },
          400: { description: "Invalid coordinates" },
          502: { description: "NOAA API error" },
        },
      },
    },
    "/api/v1/domain/lookup": {
      get: {
        tags: ["Domain Intelligence"],
        summary: "WHOIS/RDAP domain lookup",
        description:
          "Full RDAP lookup for a domain. Returns registrar, dates, nameservers, status codes, and DNSSEC info.",
        parameters: [
          {
            name: "domain",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Domain name to look up",
            example: "example.com",
          },
        ],
        responses: {
          200: {
            description: "Domain RDAP data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    domain: { type: "string" },
                    registrar: { type: "string" },
                    creation_date: { type: "string", format: "date-time" },
                    expiry_date: { type: "string", format: "date-time" },
                    updated_date: { type: "string", format: "date-time" },
                    nameservers: { type: "array", items: { type: "string" } },
                    status: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          code: { type: "string" },
                          description: { type: "string" },
                        },
                      },
                    },
                    dnssec: { type: "string", enum: ["signed", "unsigned", "unknown"] },
                    looked_up_at: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          400: { description: "Invalid domain format" },
          404: { description: "Domain not found in RDAP" },
          429: { description: "Rate limited by RDAP server" },
          502: { description: "RDAP server error or timeout" },
        },
      },
    },
    "/api/v1/domain/available": {
      get: {
        tags: ["Domain Intelligence"],
        summary: "Check domain availability",
        description:
          "Quick check whether a domain is registered. Uses RDAP — a 404 from the RDAP server means the domain is likely available.",
        parameters: [
          {
            name: "domain",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Domain name to check",
            example: "example.com",
          },
        ],
        responses: {
          200: {
            description: "Availability result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    domain: { type: "string" },
                    available: { type: "boolean" },
                    checked_at: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          400: { description: "Invalid domain format" },
          429: { description: "Rate limited by RDAP server" },
          502: { description: "RDAP server error or timeout" },
        },
      },
    },
    "/api/v1/health": {
      get: {
        tags: ["System"],
        summary: "Health check (not paywalled)",
        responses: {
          200: {
            description: "Service health status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    uptime: { type: "number" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
