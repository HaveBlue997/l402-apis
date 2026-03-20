# Docker Containerization for Ollama

## Why containerize?

OpenClaw serves LLM inference through a public-facing API. User-supplied prompts
flow directly into the model runtime (llama.cpp inside Ollama). If a vulnerability
in the inference engine is ever exploited via crafted input, containerization
ensures the blast radius stays inside the container — it cannot reach the host
filesystem, network, or other services.

Our hardening measures:

| Layer | Control |
|-------|---------|
| User | Non-root (`ollama` user) |
| Capabilities | All dropped (`cap_drop: ALL`) |
| Privileges | `no-new-privileges` enforced |
| Filesystem | Read-only root; writable tmpfs for `/tmp` only |
| Storage | Named Docker volume for models — no bind mounts to host paths |
| Network | Internal-only Docker network; port published only to `127.0.0.1` |
| Resources | 64 GB RAM / 16 CPU cap — host retains the other half |

## Quick start

```bash
cd docker/
chmod +x setup-ollama-docker.sh
./setup-ollama-docker.sh
```

The script checks prerequisites, builds the image, starts the container, pulls
all configured models, and verifies inference works.

## Start / Stop / Restart

```bash
# Start (detached)
docker compose -f docker/docker-compose.yml up -d

# Stop
docker compose -f docker/docker-compose.yml down

# Restart
docker compose -f docker/docker-compose.yml restart

# View logs
docker logs -f openclaw-ollama
```

## Adding new models

```bash
# Pull via the API (container must be running)
curl http://localhost:11434/api/pull -d '{"name": "gemma2:27b"}'

# Or exec into the container
docker exec openclaw-ollama ollama pull gemma2:27b

# List installed models
curl -s http://localhost:11434/api/tags | python3 -m json.tool
```

To make a model part of the default setup, add it to the `MODELS` array in
`setup-ollama-docker.sh`.

## Checking logs

```bash
# Follow logs
docker logs -f openclaw-ollama

# Last 100 lines
docker logs --tail 100 openclaw-ollama

# Health status
docker inspect --format='{{.State.Health.Status}}' openclaw-ollama
```

## Performance on Apple Silicon

### The tradeoff: security vs speed

Docker Desktop on macOS runs containers inside a lightweight Linux VM. This means:

- **No GPU passthrough** — macOS does not expose Metal/GPU to Docker containers.
  Ollama inside Docker uses CPU-only inference.
- **CPU inference is still viable** — The M4 Ultra has 32 high-performance cores.
  With 16 cores allocated to the container, models up to ~32B parameters run at
  acceptable speeds (5-15 tokens/sec depending on quantization).
- **70B models are slow** — Expect 1-5 tokens/sec for 70B models on CPU. This
  may be unacceptable for interactive use.

### Recommendations

| Model size | Recommendation |
|------------|----------------|
| ≤ 32B (qwen3:32b, devstral:24b, etc.) | Run in Docker — performance is acceptable and security is worth it |
| 70B (llama3.1:70b, deepseek-r1:70b) | Consider running natively for performance-critical workloads, or accept slower speeds for the security benefit |

### Hybrid approach

You can run a native Ollama instance on a different port for 70B models while
keeping smaller models containerized:

```bash
# Native Ollama on port 11435 for large models
OLLAMA_HOST=127.0.0.1:11435 ollama serve

# Docker Ollama on port 11434 for small models (default)
docker compose -f docker/docker-compose.yml up -d
```

Then route requests to the appropriate endpoint based on model size in your API
server.

### Tuning

Environment variables in `docker-compose.yml` you may want to adjust:

- `OLLAMA_MAX_LOADED_MODELS=2` — Number of models kept in memory simultaneously.
  Increase if you have spare RAM, decrease if the container is OOM-killed.
- `OLLAMA_NUM_PARALLEL=4` — Concurrent inference requests per model. Higher
  values use more memory.
- `deploy.resources.limits.memory` — Increase beyond 64g if your workload needs
  it and the host can spare the RAM.
- `deploy.resources.limits.cpus` — Increase for faster inference at the cost of
  host responsiveness.
