const MAX_GLOBAL_CONCURRENT = 3;
const MAX_PER_IP_CONCURRENT = 1;

let globalActive = 0;
const perIpActive = new Map();

export function getActiveRequests() {
  return globalActive;
}

export function getMaxConcurrent() {
  return MAX_GLOBAL_CONCURRENT;
}

export function llmConcurrency(req, res, next) {
  const ip = req.ip;

  if (globalActive >= MAX_GLOBAL_CONCURRENT) {
    return res.status(429).json({
      error: "Too many concurrent LLM requests",
      detail: `Server is processing ${globalActive}/${MAX_GLOBAL_CONCURRENT} requests`,
      retry_after_ms: 2000,
    });
  }

  const ipCount = perIpActive.get(ip) || 0;
  if (ipCount >= MAX_PER_IP_CONCURRENT) {
    return res.status(429).json({
      error: "You already have a concurrent LLM request in progress",
      detail: "Wait for your current request to complete",
      retry_after_ms: 1000,
    });
  }

  // Reserve slot
  globalActive++;
  perIpActive.set(ip, ipCount + 1);

  // Clean up on response close (covers finish, error, client disconnect)
  res.on("close", () => {
    globalActive--;
    const current = perIpActive.get(ip) || 1;
    if (current <= 1) {
      perIpActive.delete(ip);
    } else {
      perIpActive.set(ip, current - 1);
    }
  });

  next();
}
