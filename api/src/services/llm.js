const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_TIMEOUT = 120_000;

async function ollamaFetch(path, options = {}) {
  const url = `${OLLAMA_BASE}${path}`;
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function healthCheck() {
  try {
    const res = await ollamaFetch("/", { timeout: 5000 });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels() {
  const res = await ollamaFetch("/api/tags");
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();

  return (data.models || []).map((m) => ({
    name: m.name,
    size_bytes: m.size,
    parameter_size: m.details?.parameter_size,
    quantization: m.details?.quantization_level,
    family: m.details?.family,
    modified_at: m.modified_at,
  }));
}

export async function validateModel(model) {
  const models = await listModels();
  return models.some((m) => m.name === model || m.name === `${model}:latest`);
}

export async function chat(body) {
  const res = await ollamaFetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      stream: body.stream ?? false,
      options: body.options || {},
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OllamaError(`Ollama chat error: ${res.status}`, res.status, text);
  }

  return res;
}

export async function generate(body) {
  const res = await ollamaFetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: body.model,
      prompt: body.prompt,
      stream: body.stream ?? false,
      options: body.options || {},
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OllamaError(`Ollama generate error: ${res.status}`, res.status, text);
  }

  return res;
}

export class OllamaError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = "OllamaError";
    this.status = status;
    this.detail = detail;
  }
}
