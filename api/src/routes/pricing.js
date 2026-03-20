import { Router } from "express";

const router = Router();

const PRICING = {
  version: "1.0.0",
  currency: "sats",
  payment_method: "Lightning Network (L402)",
  last_updated: "2026-03-20",

  data_apis: {
    "sanctions/check": {
      price_sats: 10,
      unit: "per request",
      description: "OFAC SDN sanctions screening — real-time match against 18,000+ entries",
    },
    "company/search": {
      price_sats: 10,
      unit: "per request",
      description: "Business entity search across 62 jurisdictions (US, UK, Canada)",
    },
    "weather/marine": {
      price_sats: 5,
      unit: "per request",
      description: "NOAA marine weather forecasts by coordinates",
    },
    "predictions/weather": {
      price_sats: 5,
      unit: "per request",
      description: "Structured weather data for prediction markets",
    },
    "crypto/price": {
      price_sats: 2,
      unit: "per request",
      description: "Live BTC/ETH/SOL prices with sats-per-dollar",
    },
    "crypto/fees": {
      price_sats: 2,
      unit: "per request",
      description: "Real-time Bitcoin fee estimates from mempool.space",
    },
    "crypto/lightning/stats": {
      price_sats: 2,
      unit: "per request",
      description: "Lightning Network node/channel/capacity metrics",
    },
  },

  llm_inference: {
    description: "Private LLM inference — no prompt logging, no accounts, pay per request",
    tiers: {
      small: {
        max_params_b: 14,
        price_sats_per_1k_tokens: 50,
        usd_approx_per_1k_tokens: 0.045,
        models: [],
      },
      medium: {
        max_params_b: 35,
        price_sats_per_1k_tokens: 100,
        usd_approx_per_1k_tokens: 0.091,
        models: ["qwen3:32b", "devstral:24b", "qwen2.5-coder:32b", "command-r:35b"],
      },
      large: {
        max_params_b: 80,
        price_sats_per_1k_tokens: 200,
        usd_approx_per_1k_tokens: 0.182,
        models: ["llama3.1:70b", "deepseek-r1:70b"],
      },
    },
    limits: {
      max_prompt_tokens: 8192,
      max_output_tokens: 4096,
      max_concurrent_requests: 3,
      rate_limit: "20 requests per 15 minutes per IP",
      timeout_seconds: 120,
    },
  },

  free_endpoints: [
    "GET /api/v1/health",
    "GET /api/v1/pricing",
    "GET /api/v1/llm/models",
    "GET /docs",
    "GET /openapi.json",
  ],

  policies: {
    terms_of_service: "/docs/terms-of-service",
    acceptable_use: "/docs/acceptable-use-policy",
    privacy_policy: "/docs/privacy-policy",
  },

  contact: "velocitybotholemu@gmail.com",
};

/**
 * GET /api/v1/pricing
 * Machine-readable pricing for all services
 */
router.get("/", (_req, res) => {
  res.json(PRICING);
});

export default router;
