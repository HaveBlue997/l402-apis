import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const LOG_DIR = "/Users/Shared/openclaw/l402-apis/logs";

let dirEnsured = false;

async function ensureLogDir() {
  if (dirEnsured) return;
  await mkdir(LOG_DIR, { recursive: true });
  dirEnsured = true;
}

function hashIp(ip) {
  return createHash("sha256").update(ip || "unknown").digest("hex").slice(0, 16);
}

function getLogFile() {
  const date = new Date().toISOString().slice(0, 10);
  return join(LOG_DIR, `api-audit-${date}.jsonl`);
}

function sanitizeQuery(query) {
  if (!query || typeof query !== "object") return {};
  const sanitized = {};
  const PII_KEYS = new Set(["email", "password", "token", "secret", "ssn", "phone", "address"]);
  for (const [key, value] of Object.entries(query)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = String(value).slice(0, 200);
    }
  }
  return sanitized;
}

export function apiAudit(req, res, next) {
  const startMs = Date.now();

  res.on("close", () => {
    const elapsedMs = Date.now() - startMs;

    const entry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      response_ms: elapsedMs,
      ip_hash: hashIp(req.ip),
      user_agent: req.get("user-agent") || null,
      query: sanitizeQuery(req.query),
      sats_charged: parseInt(req.get("x-aperture-price") || "0", 10) || (res.locals.pricingInfo?.total_sats ?? null),
      model: res.locals.llmModel || req.body?.model || null,
      tokens: res.locals.tokenCounts || null,
    };

    writeAuditLog(entry).catch((err) => {
      console.error("[api-audit] Failed to write log:", err.message);
    });
  });

  next();
}

async function writeAuditLog(entry) {
  await ensureLogDir();
  const line = JSON.stringify(entry) + "\n";
  await appendFile(getLogFile(), line, "utf8");
}
