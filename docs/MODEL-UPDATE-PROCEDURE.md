# Model Update Procedure

## Current Model Inventory

| Model | Size | Purpose | Used By |
|-------|------|---------|---------|
| `qwen3:32b` | 18.8 GB | General reasoning, agent primary | OpenClaw agents (Ops, Marketing) |
| `qwen2.5-coder:32b` | 18.5 GB | Code generation, structured JSON output | Mission Control, local health checks, API LLM inference |
| `llama3.1:70b` | 39.6 GB | Large model inference | API LLM inference |
| `devstral:24b` | 13.3 GB | Code-focused tasks | API LLM inference |
| `deepseek-r1:70b` | 39.6 GB | Deep reasoning | API LLM inference |
| `command-r:35b` | 17.4 GB | RAG and tool use | API LLM inference |
| `nomic-embed-text:latest` | 0.3 GB | Text embeddings | LanceDB memory (all agents) |

**Total disk:** ~148 GB
**Ollama version:** v0.18.2 (latest as of 2026-03-22)
**All models installed:** 2026-03-19

## How to Check for Updates

```bash
# 1. Check Ollama version
curl -s http://localhost:11434/api/version
# Compare with: https://github.com/ollama/ollama/releases/latest

# 2. Check model versions (pull checks remote manifest, re-downloads only if changed)
ollama pull qwen3:32b
ollama pull qwen2.5-coder:32b
ollama pull devstral:24b
ollama pull command-r:35b
ollama pull nomic-embed-text:latest
# For 70b models (large downloads, ~40GB each):
ollama pull llama3.1:70b
ollama pull deepseek-r1:70b

# 3. Compare digests before/after
curl -s http://localhost:11434/api/tags | jq '.models[] | {name: .name, digest: .digest[0:12]}'
```

## Model Update Steps

### Step 1: Pre-Update Checks
```bash
# Verify no active LLM requests
curl -s http://localhost:9090/api/v1/health | jq '.llm'
# Should show: active_requests: 0

# Note current model digests
curl -s http://localhost:11434/api/tags | jq '.models[] | {name, digest: .digest[0:12]}' > /tmp/models-before.json
```

### Step 2: Pull Updated Model
```bash
# Pull one model at a time (Ollama handles the download)
ollama pull <model_name>
# Example: ollama pull qwen3:32b

# For large models (70b), this may take 10-30 minutes depending on bandwidth
# Ollama downloads delta layers — if only weights changed, it's faster
```

### Step 3: Verify the Update
```bash
# Check new digest
curl -s http://localhost:11434/api/tags | jq '.models[] | select(.name == "<model_name>") | {name, digest: .digest[0:12], modified: .modified_at}'

# Quick inference test
curl -s http://localhost:11434/api/generate -d '{"model":"<model_name>","prompt":"Say hello","stream":false,"options":{"num_predict":5}}' | jq '.response'
```

### Step 4: Test API Integration
```bash
# Run smoke tests
bash /Users/Shared/openclaw/l402-apis/tests/smoke.sh

# Test LLM endpoint specifically
curl -s -X POST http://localhost:9090/api/v1/llm/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"<model_name>","prompt":"Test after update","options":{"num_predict":10}}' | jq '.response'

# Run local health check
bash /Users/Shared/openclaw/l402-apis/scripts/local-healthcheck.sh
```

### Step 5: Update Wiring (if model name changed)

If a model family releases a new major version (e.g., `qwen3` → `qwen4`), update these files:

1. **OpenClaw config** (`~/.openclaw/openclaw.json`):
   - `agents.defaults.models` — update model names and aliases
   - Each agent's `model.primary` — if they use the updated model

2. **API server pricing** (`/Users/Shared/openclaw/l402-apis/api/src/routes/pricing.js`):
   - Model tier listings and pricing

3. **API server LLM routes** (`/Users/Shared/openclaw/l402-apis/api/src/routes/llm.js`):
   - Model validation / allowed model list (if any)

4. **Landing page** (`/Users/Shared/openclaw/l402-apis/landing/index.html`):
   - LLM model names displayed to customers

5. **MCP packages** (`/Users/Shared/openclaw/agent-skills-market/skills/packages/mcp-llm-inference/`):
   - Default model references

6. **Local health check script** (`/Users/Shared/openclaw/l402-apis/scripts/local-healthcheck.sh`):
   - MODEL variable if the health check model changes

7. **Vercel POC** (`/Users/Shared/openclaw/vercel-poc/`):
   - Not affected (no LLM endpoints on Vercel)

### Step 6: Notify Teams
- Post model update to #ai-services (Ops channel)
- If customer-facing models changed, notify Marketing for content updates
- Update Mission Control if dashboard tracks model versions

## Update Frequency

Ollama models don't have a fixed update schedule. Check monthly or when:
- A new model family version is released (e.g., Llama 4, Qwen 4)
- A security vulnerability is announced
- Performance benchmarks show significant improvements in a newer version
- Ollama itself releases a major update

## Rollback

If an updated model causes issues:
```bash
# Ollama doesn't keep old versions. To rollback:
# 1. Note the old digest before updating
# 2. If needed, pull a specific older version tag:
ollama pull qwen3:32b@sha256:<old_digest>
# Or pull the previous major version:
ollama pull qwen2.5:32b  # (older family)
```

## Current Status (2026-03-22)

All 7 models are **up to date** — digests unchanged after pull check. No updates available.
Ollama v0.18.2 is the latest release (published 2026-03-18).
