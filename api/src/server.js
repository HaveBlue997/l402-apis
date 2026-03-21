import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi.js";
import sanctionsRouter from "./routes/sanctions.js";
import companyRouter from "./routes/company.js";
import marineRouter from "./routes/marine.js";
import predictionsRouter from "./routes/predictions.js";
import cryptoRouter from "./routes/crypto.js";
import llmRouter from "./routes/llm.js";
import pricingRouter from "./routes/pricing.js";
import whoisRouter from "./routes/whois.js";
import aviationRouter from "./routes/aviation.js";
import analyticsRouter from "./routes/analytics.js";
import { apiAudit } from "./middleware/api-audit.js";
import { loadAllLists, startRefreshTimer, getStatus } from "./services/sanctions.js";
import { randomBytes } from "node:crypto";
import { healthCheck } from "./services/llm.js";
import { getActiveRequests, getMaxConcurrent } from "./middleware/llm-concurrency.js";

const PORT = parseInt(process.env.PORT || "9090", 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "100", 10);
const SDN_REFRESH_HOURS = parseInt(process.env.SDN_REFRESH_HOURS || "24", 10);

import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const landingPath = join(__dirname, "..", "..", "landing");

const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow Swagger UI inline scripts
  })
);

// Rate limiting
app.use(
  "/api/",
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many requests, please try again later",
      retry_after_ms: RATE_LIMIT_WINDOW,
    },
  })
);

// LLM-specific rate limiter (tighter: 20 req / 15 min per IP)
app.use(
  "/api/v1/llm",
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many LLM requests, please try again later",
      retry_after_ms: RATE_LIMIT_WINDOW,
    },
  })
);

// Parse JSON bodies (512KB limit for LLM safety)
app.use(express.json({ limit: "512kb" }));

// --- Audit logging (all API requests) ---
app.use("/api/", apiAudit);

// --- Admin routes (before Aperture, no L402) ---
app.use("/api/v1/admin/analytics", analyticsRouter);
app.get("/admin/dashboard", (_req, res) => res.sendFile(join(landingPath, "dashboard.html")));

// --- Swagger docs ---
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get("/openapi.json", (_req, res) => res.json(openApiSpec));

// --- Health check (not paywalled) ---
app.get("/api/v1/health", async (_req, res) => {
  const sdnStatus = getStatus();
  const ollamaReachable = await healthCheck();
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      sanctions: {
        total_entries: sdnStatus.total_entries,
        lists: Object.fromEntries(
          Object.entries(sdnStatus.lists).map(([k, v]) => [
            k,
            { loaded: v.loaded, entry_count: v.entry_count },
          ])
        ),
      },
    },
    llm: {
      ollama_reachable: ollamaReachable,
      active_requests: getActiveRequests(),
      max_concurrent: getMaxConcurrent(),
    },
  });
});

// --- API routes ---
app.use("/api/v1/sanctions", sanctionsRouter);
app.use("/api/v1/company", companyRouter);
app.use("/api/v1/weather/marine", marineRouter);
app.use("/api/v1/predictions", predictionsRouter);
app.use("/api/v1/crypto", cryptoRouter);
app.use("/api/v1/llm", llmRouter);
app.use("/api/v1/pricing", pricingRouter);
app.use("/api/v1/domain", whoisRouter);
app.use("/api/v1/weather/aviation", aviationRouter);

// --- Landing page (static) ---
app.use("/landing", express.static(landingPath));
app.use(express.static(landingPath)); // Serve static assets (style.css, main.js) from root
app.get("/", (_req, res) => res.sendFile(join(landingPath, "index.html")));

// --- 404 handler ---
app.use((_req, res) => {
  res.status(404).json({
    error: "Not found",
    docs: "/docs",
    endpoints: [
      "GET /api/v1/sanctions/check?name=<name>&country=<country>&lists=ofac,eu,uk,un",
      "GET /api/v1/sanctions/lists",
      "GET /api/v1/company/search?jurisdiction=<US|GB|UK>&name=<name>",
      "GET /api/v1/weather/marine?lat=<lat>&lon=<lon>",
      "GET /api/v1/predictions/weather?lat=<lat>&lon=<lon>",
      "GET /api/v1/crypto/price?coin=bitcoin",
      "GET /api/v1/crypto/fees",
      "GET /api/v1/crypto/lightning/stats",
      "GET /api/v1/llm/models",
      "POST /api/v1/llm/chat",
      "POST /api/v1/llm/generate",
      "GET /api/v1/weather/aviation/metar?station=KJFK",
      "GET /api/v1/weather/aviation/taf?station=KJFK",
      "GET /api/v1/weather/aviation/stations?lat=40.6&lon=-73.8&radius=30",
      "GET /api/v1/domain/lookup?domain=example.com",
      "GET /api/v1/domain/available?domain=example.com",
      "GET /api/v1/pricing",
      "GET /api/v1/health",
    ],
  });
});

// --- Global error handler ---
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({
    error: "Internal server error",
  });
});

// --- Start ---
async function start() {
  console.log("[startup] Loading sanctions lists (OFAC, EU, UK, UN)...");
  const { loaded, failed } = await loadAllLists();
  if (loaded.length > 0) {
    console.log(`[startup] Sanctions lists ready: ${loaded.join(", ")}`);
  }
  if (failed.length > 0) {
    console.error(`[startup] WARNING: Failed to load: ${failed.join(", ")}`);
    console.error("[startup] Failed lists will return partial results until loaded");
  }

  startRefreshTimer(SDN_REFRESH_HOURS);

  // Generate admin token if not set
  if (!process.env.ADMIN_TOKEN) {
    process.env.ADMIN_TOKEN = randomBytes(24).toString("hex");
    console.log(`[startup] Generated ADMIN_TOKEN: ${process.env.ADMIN_TOKEN}`);
    console.log(`[startup] Set ADMIN_TOKEN env var to persist across restarts`);
  }

  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`[startup] L402 Agent API listening on 127.0.0.1:${PORT} (localhost only)`);
    console.log(`[startup] Swagger docs: http://localhost:${PORT}/docs`);
    console.log(`[startup] Dashboard: http://localhost:${PORT}/admin/dashboard`);
    console.log(`[startup] OpenAPI spec: http://localhost:${PORT}/openapi.json`);
  });

  // Graceful shutdown — release port before exit so launchd respawn doesn't hit EADDRINUSE
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return; // prevent double-shutdown
    shuttingDown = true;
    console.log(`[shutdown] Received ${signal}, closing server...`);
    server.close(() => {
      console.log(`[shutdown] Server closed cleanly.`);
      process.exit(0);
    });
    // Force exit after 5s if connections hang
    setTimeout(() => {
      console.log(`[shutdown] Forced exit after timeout.`);
      process.exit(1);
    }, 5000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle port-in-use gracefully — retry once, then exit so launchd can respawn cleanly
  let retried = false;
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      if (retried) {
        console.log(`[startup] Port ${PORT} still in use after retry. Exiting for launchd respawn.`);
        process.exit(1);
      }
      retried = true;
      console.log(`[startup] Port ${PORT} in use, retrying in 3s...`);
      setTimeout(() => {
        server.listen(PORT, "127.0.0.1");
      }, 3000);
    } else {
      throw err;
    }
  });
}

start();
