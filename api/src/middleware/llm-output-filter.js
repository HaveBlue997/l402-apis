// Dangerous content patterns — keep this list easy to update
const DANGEROUS_PATTERNS = [
  // Synthesis instructions (chemical/biological)
  /\b(synthe(?:sis|size|sizing)|manufacture|produce)\b.{0,60}\b(sarin|vx|tabun|novichok|ricin|anthrax|botulinum|mustard gas|chlorine gas|phosgene)\b/i,
  /\b(nerve agent|chemical weapon|biological weapon|bioweapon)\b.{0,40}\b(recipe|synthe|instructions?|how to|step[- ]by[- ]step|procedure)\b/i,

  // PII patterns
  /\b\d{3}-\d{2}-\d{4}\b/,                          // SSN format
  /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card numbers

  // Shell injection sequences
  /;\s*(?:rm|wget|curl|bash|sh|nc|ncat|python|perl|ruby)\s/i,
  /\$\(\s*(?:rm|wget|curl|bash|sh|nc|ncat)\b/i,
  /`\s*(?:rm|wget|curl|bash|sh)\b/i,
  /\|\s*(?:bash|sh|zsh)\b/i,
];

export function llmOutputFilter(req, res, next) {
  // NOTE: Streaming responses bypass output filtering.
  // This is a known limitation — streaming sends chunks directly to the client
  // before the full response is available for scanning. Document this in your
  // threat model. Consider client-side filtering for streaming use cases.
  if (req.body?.stream) {
    return next();
  }

  // Intercept res.json to scan output
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    const textToScan = extractResponseText(body);

    if (textToScan && isFlagged(textToScan)) {
      // Mark as flagged for audit logging
      res.locals.outputFlagged = true;

      // Log the flag but NOT the prompt content — privacy first
      console.warn(`[llm-output-filter] Response flagged for model=${req.body?.model}, ip=${req.ip}`);

      return originalJson.call(
        res.status(451),
        {
          error: "Response blocked by content filter",
          detail: "The model output was flagged by our safety filter and cannot be returned",
        },
      );
    }

    res.locals.outputFlagged = false;
    return originalJson.call(res, body);
  };

  next();
}

function extractResponseText(body) {
  if (!body) return null;
  // Chat response
  if (body.message?.content) return body.message.content;
  // Generate response
  if (typeof body.response === "string") return body.response;
  return null;
}

function isFlagged(text) {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(text));
}
