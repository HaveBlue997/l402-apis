/**
 * L402 Gateway — Routes requests to either the free API server or Aperture paywall.
 * 
 * Free endpoints → localhost:9090 (direct)
 * Paid endpoints → localhost:8443 (Aperture → LND → API server)
 * 
 * This is the public-facing entry point. Cloudflare tunnel points here.
 */

import http from "node:http";
import https from "node:https";

const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || "9080", 10);
const API_SERVER = { host: "127.0.0.1", port: 9090 };
const APERTURE = { host: "127.0.0.1", port: 8443 };

// Service key for internal callers (e.g., promo proxy) to bypass L402 payment.
// Set via GATEWAY_SERVICE_KEY env var. When a request includes a matching
// X-Service-Key header, it routes directly to the API server, skipping Aperture.
const SERVICE_KEY = process.env.GATEWAY_SERVICE_KEY || "";

// Free tier: allow N requests/day per IP before requiring L402 payment
const FREE_TIER_ENABLED = (process.env.FREE_TIER_ENABLED || "true") === "true";
const FREE_TIER_DAILY_LIMIT = parseInt(process.env.FREE_TIER_DAILY_LIMIT || "50", 10);

// Map<string, { count: number, resetDate: string }>
const freeTierUsage = new Map();

// Endpoints that should be free (no L402 payment required)
const FREE_PATTERNS = [
  /^\/$/,
  /^\/landing/,
  /^\/docs/,
  /^\/promo$/,
  /^\/openapi\.json$/,
  /^\/api\/v1\/health$/,
  /^\/api\/v1\/pricing$/,
  /^\/api\/v1\/llm\/models$/,
  /^\/api\/v1\/company\/(states|jurisdictions)$/,
  /^\/api\/v1\/sanctions\/status$/,
  /^\/api\/v1\/free-tier\/status$/,
  /^\/api\/v1\/weather\/aviation\/stations$/,
  /^\/admin\//,
  /^\/api\/v1\/admin\//,
  /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)$/,  // Static assets
];

function isFree(url) {
  const path = url.split("?")[0];
  return FREE_PATTERNS.some((re) => re.test(path));
}

function getClientIP(req) {
  // Cloudflare sets CF-Connecting-IP; fall back through X-Forwarded-For
  return req.headers["cf-connecting-ip"]
    || (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket.remoteAddress;
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function getFreeTierBucket(ip) {
  const today = todayUTC();
  let bucket = freeTierUsage.get(ip);
  if (!bucket || bucket.resetDate !== today) {
    bucket = { count: 0, resetDate: today };
    freeTierUsage.set(ip, bucket);
  }
  return bucket;
}

function freeTierRemaining(ip) {
  const bucket = getFreeTierBucket(ip);
  return Math.max(0, FREE_TIER_DAILY_LIMIT - bucket.count);
}

function midnightUTCTimestamp() {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

function proxyRequest(req, res, target, useTLS, extraHeaders) {
  const options = {
    hostname: target.host,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${target.host}:${target.port}` },
  };

  // For Aperture (TLS), skip cert verification (self-signed)
  if (useTLS) {
    options.rejectUnauthorized = false;
  }

  const transport = useTLS ? https : http;
  const proxyReq = transport.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers, ...extraHeaders };
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error(`[gateway] Proxy error to ${target.host}:${target.port}: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: "Bad gateway", details: err.message }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

function hasValidServiceKey(req) {
  if (!SERVICE_KEY) return false;
  const key = req.headers["x-service-key"];
  return key === SERVICE_KEY;
}

const server = http.createServer((req, res) => {
  const path = req.url.split("?")[0];

  // Free tier status endpoint
  if (path === "/api/v1/free-tier/status") {
    const ip = getClientIP(req);
    const remaining = FREE_TIER_ENABLED ? freeTierRemaining(ip) : 0;
    const body = JSON.stringify({
      enabled: FREE_TIER_ENABLED,
      daily_limit: FREE_TIER_DAILY_LIMIT,
      remaining,
      reset: midnightUTCTimestamp(),
      ip,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }

  if (hasValidServiceKey(req)) {
    // Authenticated internal caller → direct to API server, skip L402
    proxyRequest(req, res, API_SERVER, false);
  } else if (isFree(req.url)) {
    // FREE_PATTERNS endpoints → always free, no quota deduction
    proxyRequest(req, res, API_SERVER, false);
  } else if (FREE_TIER_ENABLED && freeTierRemaining(getClientIP(req)) > 0) {
    // Free tier: route to API server, decrement quota
    const ip = getClientIP(req);
    const bucket = getFreeTierBucket(ip);
    bucket.count++;
    const remaining = Math.max(0, FREE_TIER_DAILY_LIMIT - bucket.count);
    const freeTierHeaders = {
      "X-Free-Tier-Remaining": String(remaining),
      "X-Free-Tier-Reset": midnightUTCTimestamp(),
    };
    proxyRequest(req, res, API_SERVER, false, freeTierHeaders);
  } else {
    // Quota exhausted or free tier disabled → Aperture/L402 payment
    proxyRequest(req, res, APERTURE, true);
  }
});

server.listen(GATEWAY_PORT, "127.0.0.1", () => {
  console.log(`[gateway] L402 Gateway listening on 127.0.0.1:${GATEWAY_PORT} (localhost only)`);
  console.log(`[gateway] Free endpoints → localhost:${API_SERVER.port}`);
  console.log(`[gateway] Paid endpoints → localhost:${APERTURE.port} (Aperture/L402)`);
  console.log(`[gateway] Service key bypass: ${SERVICE_KEY ? "enabled" : "disabled (set GATEWAY_SERVICE_KEY to enable)"}`);
  console.log(`[gateway] Free tier: ${FREE_TIER_ENABLED ? `enabled (${FREE_TIER_DAILY_LIMIT} requests/day per IP)` : "disabled"}`);
});
