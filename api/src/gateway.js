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
  /^\/api\/v1\/weather\/aviation\/stations$/,
  /^\/admin\//,
  /^\/api\/v1\/admin\//,
  /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)$/,  // Static assets
];

function isFree(url) {
  const path = url.split("?")[0];
  return FREE_PATTERNS.some((re) => re.test(path));
}

function proxyRequest(req, res, target, useTLS) {
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
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
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
  if (hasValidServiceKey(req)) {
    // Authenticated internal caller → direct to API server, skip L402
    proxyRequest(req, res, API_SERVER, false);
  } else if (isFree(req.url)) {
    // Free → direct to API server
    proxyRequest(req, res, API_SERVER, false);
  } else {
    // Paid → through Aperture (TLS)
    proxyRequest(req, res, APERTURE, true);
  }
});

server.listen(GATEWAY_PORT, "127.0.0.1", () => {
  console.log(`[gateway] L402 Gateway listening on 127.0.0.1:${GATEWAY_PORT} (localhost only)`);
  console.log(`[gateway] Free endpoints → localhost:${API_SERVER.port}`);
  console.log(`[gateway] Paid endpoints → localhost:${APERTURE.port} (Aperture/L402)`);
  console.log(`[gateway] Service key bypass: ${SERVICE_KEY ? "enabled" : "disabled (set GATEWAY_SERVICE_KEY to enable)"}`);
});
