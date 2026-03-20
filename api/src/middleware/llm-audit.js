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
  return join(LOG_DIR, `llm-audit-${date}.jsonl`);
}

export function llmAudit(req, res, next) {
  const startMs = Date.now();

  // Capture info before response sends
  const model = req.body?.model || "unknown";

  res.on("close", () => {
    const elapsedMs = Date.now() - startMs;

    // Pull token counts and pricing from response if available
    // We stored these in res.locals from the route handlers
    const entry = {
      timestamp: new Date().toISOString(),
      ip_hash: hashIp(req.ip),
      method: req.method,
      path: req.path,
      model,
      stream: !!req.body?.stream,
      status: res.statusCode,
      response_ms: elapsedMs,
      tokens: res.locals.tokenCounts || null,
      pricing: res.locals.pricingInfo || null,
      flagged: res.locals.outputFlagged || false,
    };

    // Fire-and-forget write
    writeAuditLog(entry).catch((err) => {
      console.error("[llm-audit] Failed to write log:", err.message);
    });
  });

  next();
}

async function writeAuditLog(entry) {
  await ensureLogDir();
  const line = JSON.stringify(entry) + "\n";
  await appendFile(getLogFile(), line, "utf8");
}
