import { Router } from "express";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const LOG_DIR = "/Users/Shared/openclaw/l402-apis/logs";
const router = Router();

// --- Auth middleware ---
function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return res.status(403).json({
      error: "Admin token not configured",
      setup: "Set ADMIN_TOKEN environment variable to enable admin access",
    });
  }
  const auth = req.get("authorization");
  if (!auth || auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: "Invalid or missing admin token" });
  }
  next();
}

router.use(requireAdmin);

// --- Helpers ---

function getDateRange(period) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (period === "today") return [today];

  const days = period === "month" ? 30 : 7;
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function readLogEntries(dates, prefix = "api-audit") {
  const entries = [];
  for (const date of dates) {
    const file = join(LOG_DIR, `${prefix}-${date}.jsonl`);
    try {
      const content = await readFile(file, "utf8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch { /* skip malformed */ }
      }
    } catch (err) {
      if (err.code !== "ENOENT") console.error(`[analytics] Error reading ${file}:`, err.message);
    }
  }
  return entries;
}

// --- GET /summary ---
router.get("/summary", async (req, res) => {
  const period = req.query.period || "today";
  const dates = getDateRange(period);
  const entries = await readLogEntries(dates);

  const uniqueIps = new Set();
  const endpointCounts = {};
  let totalSats = 0;
  let totalResponseMs = 0;
  let errorCount = 0;

  for (const e of entries) {
    uniqueIps.add(e.ip_hash);
    endpointCounts[e.path] = (endpointCounts[e.path] || 0) + 1;
    totalSats += e.sats_charged || 0;
    totalResponseMs += e.response_ms || 0;
    if (e.status >= 400) errorCount++;
  }

  res.json({
    period,
    total_requests: entries.length,
    requests_per_endpoint: endpointCounts,
    total_revenue_sats: totalSats,
    avg_response_ms: entries.length ? Math.round(totalResponseMs / entries.length) : 0,
    error_rate: entries.length ? +(errorCount / entries.length).toFixed(4) : 0,
    unique_ips: uniqueIps.size,
  });
});

// --- GET /endpoints ---
router.get("/endpoints", async (req, res) => {
  const period = req.query.period || "today";
  const dates = getDateRange(period);
  const entries = await readLogEntries(dates);

  const map = {};
  for (const e of entries) {
    if (!map[e.path]) map[e.path] = { requests: 0, total_ms: 0, errors: 0, sats: 0 };
    const ep = map[e.path];
    ep.requests++;
    ep.total_ms += e.response_ms || 0;
    if (e.status >= 400) ep.errors++;
    ep.sats += e.sats_charged || 0;
  }

  const endpoints = Object.entries(map)
    .map(([path, stats]) => ({
      path,
      requests: stats.requests,
      avg_latency_ms: Math.round(stats.total_ms / stats.requests),
      error_rate: +(stats.errors / stats.requests).toFixed(4),
      revenue_sats: stats.sats,
    }))
    .sort((a, b) => b.requests - a.requests);

  res.json({ period, endpoints });
});

// --- GET /timeseries ---
router.get("/timeseries", async (req, res) => {
  const period = req.query.period || "today";
  const interval = req.query.interval || "hour";
  const dates = getDateRange(period);
  const entries = await readLogEntries(dates);

  const buckets = {};
  for (const e of entries) {
    let key;
    const ts = new Date(e.timestamp);
    if (interval === "hour") {
      key = e.timestamp.slice(0, 13) + ":00";
    } else {
      key = e.timestamp.slice(0, 10);
    }
    if (!buckets[key]) buckets[key] = { time: key, requests: 0, errors: 0, sats: 0 };
    buckets[key].requests++;
    if (e.status >= 400) buckets[key].errors++;
    buckets[key].sats += e.sats_charged || 0;
  }

  const series = Object.values(buckets).sort((a, b) => a.time.localeCompare(b.time));
  res.json({ period, interval, series });
});

// --- GET /llm ---
router.get("/llm", async (req, res) => {
  const period = req.query.period || "today";
  const dates = getDateRange(period);

  // Read both api-audit and llm-audit logs
  const apiEntries = await readLogEntries(dates, "api-audit");
  const llmEntries = await readLogEntries(dates, "llm-audit");

  // Merge: use llm-audit for richer data, fall back to api-audit LLM entries
  const allLlm = [];
  for (const e of llmEntries) {
    allLlm.push(e);
  }
  // Also include api-audit entries with a model that aren't in llm-audit
  for (const e of apiEntries) {
    if (e.model && e.path?.startsWith("/api/v1/llm")) {
      allLlm.push(e);
    }
  }

  const models = {};
  let totalTokens = 0;
  let totalSats = 0;

  for (const e of allLlm) {
    const model = e.model || "unknown";
    if (!models[model]) models[model] = { requests: 0, tokens: 0, sats: 0 };
    models[model].requests++;
    const tkn = e.tokens?.total || 0;
    models[model].tokens += tkn;
    totalTokens += tkn;
    const sats = e.sats_charged || e.pricing?.total_sats || 0;
    models[model].sats += sats;
    totalSats += sats;
  }

  res.json({
    period,
    total_llm_requests: allLlm.length,
    total_tokens: totalTokens,
    total_revenue_sats: totalSats,
    models,
  });
});

// --- GET /revenue ---
router.get("/revenue", async (req, res) => {
  const period = req.query.period || "week";
  const dates = getDateRange(period);
  const entries = await readLogEntries(dates);

  const daily = {};
  for (const e of entries) {
    const day = e.timestamp?.slice(0, 10);
    if (!day) continue;
    if (!daily[day]) daily[day] = { date: day, sats: 0, requests: 0 };
    daily[day].sats += e.sats_charged || 0;
    daily[day].requests++;
  }

  const breakdown = Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
  res.json({ period, breakdown });
});

// --- GET /recent ---
router.get("/recent", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  const entries = await readLogEntries(getDateRange("today"));
  const recent = entries.slice(-limit).reverse();
  res.json({ entries: recent });
});

export default router;
