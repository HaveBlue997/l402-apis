import { Router } from "express";
import { listModels, validateModel, chat, generate, healthCheck, OllamaError } from "../services/llm.js";
import { calculatePrice } from "../services/llm-pricing.js";
import { llmGuard } from "../middleware/llm-guard.js";
import { llmConcurrency } from "../middleware/llm-concurrency.js";
import { llmOutputFilter } from "../middleware/llm-output-filter.js";
import { llmAudit } from "../middleware/llm-audit.js";

const router = Router();

// Security headers for all LLM responses
router.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Prompt-Logged", "false");
  next();
});

// Audit logging on all LLM routes
router.use(llmAudit);

/**
 * GET /api/v1/llm/models
 * List available models (free discovery endpoint)
 */
router.get("/models", async (_req, res) => {
  try {
    const models = await listModels();
    res.json({ models, count: models.length, source: "ollama" });
  } catch (error) {
    console.error("[llm/models] Error:", error.message);
    res.status(502).json({ error: "Failed to fetch models from Ollama", details: error.message });
  }
});

/**
 * POST /api/v1/llm/chat
 * Chat completion (streaming and non-streaming)
 */
router.post("/chat", llmGuard, llmConcurrency, llmOutputFilter, async (req, res) => {
  const { model, messages, stream, options } = req.body;

  if (!model || typeof model !== "string") {
    return res.status(400).json({ error: "Missing required field: model", usage: { model: "string", messages: "[{role, content}]" } });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Missing required field: messages (non-empty array)", usage: { messages: "[{role: 'user', content: '...'}]" } });
  }
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return res.status(400).json({ error: "Each message must have 'role' and 'content' fields" });
    }
  }

  try {
    const startMs = Date.now();
    const ollamaRes = await chat({ model, messages, stream: !!stream, options });

    if (stream) {
      return streamResponse(ollamaRes, res, model, startMs);
    }

    const data = await ollamaRes.json();
    const promptTokens = data.prompt_eval_count || 0;
    const completionTokens = data.eval_count || 0;
    const totalTokens = promptTokens + completionTokens;
    const elapsedMs = Date.now() - startMs;
    const pricing = calculatePrice(model, totalTokens);

    // Store for audit logging
    res.locals.tokenCounts = { prompt: promptTokens, completion: completionTokens, total: totalTokens };
    res.locals.pricingInfo = { tier: pricing.tier, total_sats: pricing.price_sats };

    res.json({
      model: data.model || model,
      message: data.message,
      tokens: { prompt: promptTokens, completion: completionTokens, total: totalTokens },
      pricing: {
        tier: pricing.tier,
        rate_per_1k_sats: pricing.rate_per_1k,
        total_sats: pricing.price_sats,
        total_usd_approx: pricing.usd_approx,
      },
      timing: {
        total_ms: elapsedMs,
        tokens_per_second: elapsedMs > 0 ? +(completionTokens / (elapsedMs / 1000)).toFixed(1) : 0,
      },
    });
  } catch (error) {
    handleOllamaError(error, res, "chat");
  }
});

/**
 * POST /api/v1/llm/generate
 * Raw text completion (streaming and non-streaming)
 */
router.post("/generate", llmGuard, llmConcurrency, llmOutputFilter, async (req, res) => {
  const { model, prompt, stream, options } = req.body;

  if (!model || typeof model !== "string") {
    return res.status(400).json({ error: "Missing required field: model", usage: { model: "string", prompt: "string" } });
  }
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing required field: prompt (string)" });
  }

  try {
    const startMs = Date.now();
    const ollamaRes = await generate({ model, prompt, stream: !!stream, options });

    if (stream) {
      return streamResponse(ollamaRes, res, model, startMs);
    }

    const data = await ollamaRes.json();
    const promptTokens = data.prompt_eval_count || 0;
    const completionTokens = data.eval_count || 0;
    const totalTokens = promptTokens + completionTokens;
    const elapsedMs = Date.now() - startMs;
    const pricing = calculatePrice(model, totalTokens);

    // Store for audit logging
    res.locals.tokenCounts = { prompt: promptTokens, completion: completionTokens, total: totalTokens };
    res.locals.pricingInfo = { tier: pricing.tier, total_sats: pricing.price_sats };

    res.json({
      model: data.model || model,
      response: data.response,
      tokens: { prompt: promptTokens, completion: completionTokens, total: totalTokens },
      pricing: {
        tier: pricing.tier,
        rate_per_1k_sats: pricing.rate_per_1k,
        total_sats: pricing.price_sats,
        total_usd_approx: pricing.usd_approx,
      },
      timing: {
        total_ms: elapsedMs,
        tokens_per_second: elapsedMs > 0 ? +(completionTokens / (elapsedMs / 1000)).toFixed(1) : 0,
      },
    });
  } catch (error) {
    handleOllamaError(error, res, "generate");
  }
});

function streamResponse(ollamaRes, res, model, startMs) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const reader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);

            if (chunk.done) {
              const elapsedMs = Date.now() - startMs;
              const totalTokens = (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0);
              const pricing = calculatePrice(model, totalTokens);

              // Store for audit logging
              res.locals.tokenCounts = {
                prompt: chunk.prompt_eval_count || 0,
                completion: chunk.eval_count || 0,
                total: totalTokens,
              };
              res.locals.pricingInfo = { tier: pricing.tier, total_sats: pricing.price_sats };

              res.write(`data: ${JSON.stringify({
                pricing: {
                  tier: pricing.tier,
                  rate_per_1k_sats: pricing.rate_per_1k,
                  total_sats: pricing.price_sats,
                  total_usd_approx: pricing.usd_approx,
                },
                timing: {
                  total_ms: elapsedMs,
                  tokens_per_second: elapsedMs > 0 ? +((chunk.eval_count || 0) / (elapsedMs / 1000)).toFixed(1) : 0,
                },
              })}\n\n`);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    } finally {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  })();
}

function handleOllamaError(error, res, endpoint) {
  console.error(`[llm/${endpoint}] Error:`, error.message);

  if (error.name === "AbortError") {
    return res.status(504).json({ error: "Request to Ollama timed out (120s limit)" });
  }
  if (error instanceof OllamaError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    return res.status(status).json({ error: error.message, details: error.detail });
  }
  if (error.cause?.code === "ECONNREFUSED") {
    return res.status(503).json({ error: "Ollama is not running", details: "Could not connect to Ollama at localhost:11434" });
  }

  res.status(502).json({ error: "Ollama request failed", details: error.message });
}

export default router;
