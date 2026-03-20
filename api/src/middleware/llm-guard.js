const MAX_PROMPT_TOKENS = 8192;
const CHARS_PER_TOKEN = 4;
const MAX_PROMPT_CHARS = MAX_PROMPT_TOKENS * CHARS_PER_TOKEN;
const MAX_NUM_PREDICT = 4096;
const MAX_MESSAGES = 50;
const BANNED_MODEL_PATTERN = /[./\\`|;&$(){}[\]!#~]/;

function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function llmGuard(req, res, next) {
  const { model, messages, prompt, options } = req.body;

  // Validate model name — block path traversal and shell metacharacters
  if (model && BANNED_MODEL_PATTERN.test(model)) {
    return res.status(400).json({
      error: "Invalid model name",
      detail: "Model names must not contain path separators or shell metacharacters",
    });
  }

  // Cap num_predict silently
  if (options && typeof options === "object") {
    if (options.num_predict == null || options.num_predict > MAX_NUM_PREDICT) {
      req.body.options = { ...options, num_predict: MAX_NUM_PREDICT };
    }
  } else {
    req.body.options = { num_predict: MAX_NUM_PREDICT };
  }

  // Chat endpoint: check message count
  if (Array.isArray(messages)) {
    if (messages.length > MAX_MESSAGES) {
      return res.status(400).json({
        error: `Too many messages: ${messages.length} exceeds maximum of ${MAX_MESSAGES}`,
      });
    }

    // Check total prompt size across all messages
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (totalChars > MAX_PROMPT_CHARS) {
      return res.status(413).json({
        error: "Prompt too large",
        detail: `Estimated ${estimateTokens(totalChars)} tokens exceeds maximum of ${MAX_PROMPT_TOKENS}`,
        max_tokens: MAX_PROMPT_TOKENS,
      });
    }
  }

  // Generate endpoint: check prompt size
  if (typeof prompt === "string" && prompt.length > MAX_PROMPT_CHARS) {
    return res.status(413).json({
      error: "Prompt too large",
      detail: `Estimated ${estimateTokens(prompt.length)} tokens exceeds maximum of ${MAX_PROMPT_TOKENS}`,
      max_tokens: MAX_PROMPT_TOKENS,
    });
  }

  next();
}
