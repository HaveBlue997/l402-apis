#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
CONTAINER_NAME="openclaw-ollama"
OLLAMA_URL="http://localhost:11434"

# Models to pull — adjust this list as needed
MODELS=(
    "qwen3:32b"
    "llama3.1:70b"
    "deepseek-r1:70b"
    "devstral:24b"
    "qwen2.5-coder:32b"
    "command-r:35b"
)

info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*"; exit 1; }
ok()    { echo -e "\033[1;32m[OK]\033[0m    $*"; }

# -------------------------------------------------------------------
# Pre-flight checks
# -------------------------------------------------------------------
check_docker() {
    if ! command -v docker &>/dev/null; then
        error "Docker not found. Install Docker Desktop for Mac: https://docs.docker.com/desktop/install/mac-install/"
    fi

    if ! docker info &>/dev/null; then
        error "Docker daemon not running. Start Docker Desktop and try again."
    fi

    ok "Docker is available"
}

# -------------------------------------------------------------------
# Build & start
# -------------------------------------------------------------------
start_ollama() {
    info "Building and starting Ollama container..."
    docker compose -f "$COMPOSE_FILE" up -d --build

    info "Waiting for Ollama API to become ready..."
    local retries=30
    while ! curl -sf "$OLLAMA_URL/" &>/dev/null; do
        retries=$((retries - 1))
        if [ "$retries" -le 0 ]; then
            error "Ollama API did not become ready within 60 seconds. Check logs: docker logs $CONTAINER_NAME"
        fi
        sleep 2
    done
    ok "Ollama API is ready at $OLLAMA_URL"
}

# -------------------------------------------------------------------
# Pull models
# -------------------------------------------------------------------
pull_models() {
    info "Pulling models into container (this will take a while)..."
    echo ""

    for model in "${MODELS[@]}"; do
        info "Pulling $model ..."
        # Use the Ollama API to pull — works even with internal-only network
        # because we hit the published localhost port
        curl -sf "$OLLAMA_URL/api/pull" \
            -d "{\"name\": \"$model\"}" \
            --no-buffer | while IFS= read -r line; do
                status=$(echo "$line" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
                if [ -n "$status" ]; then
                    printf "\r  %-60s" "$status"
                fi
            done
        echo ""
        ok "$model pulled"
    done

    echo ""
    info "Installed models:"
    curl -sf "$OLLAMA_URL/api/tags" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for m in data.get('models', []):
    size_gb = m.get('size', 0) / (1024**3)
    print(f\"  {m['name']:<40} {size_gb:.1f} GB\")
" 2>/dev/null || curl -sf "$OLLAMA_URL/api/tags"
}

# -------------------------------------------------------------------
# Verify with a test inference
# -------------------------------------------------------------------
test_inference() {
    info "Running test inference..."

    # Pick the smallest model available for a quick test
    local test_model
    test_model=$(curl -sf "$OLLAMA_URL/api/tags" | python3 -c "
import json, sys
models = json.load(sys.stdin).get('models', [])
if models:
    smallest = min(models, key=lambda m: m.get('size', float('inf')))
    print(smallest['name'])
" 2>/dev/null)

    if [ -z "$test_model" ]; then
        warn "No models found for test inference — skipping"
        return
    fi

    info "Testing with $test_model ..."
    response=$(curl -sf "$OLLAMA_URL/api/generate" \
        -d "{\"model\": \"$test_model\", \"prompt\": \"Say hello in exactly 5 words.\", \"stream\": false}" \
        --max-time 120)

    if echo "$response" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('response')" 2>/dev/null; then
        ok "Inference works. Response:"
        echo "$response" | python3 -c "import json,sys; print('  ' + json.load(sys.stdin)['response'][:200])" 2>/dev/null
    else
        warn "Inference returned unexpected response — check logs: docker logs $CONTAINER_NAME"
    fi
}

# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------
main() {
    echo "=========================================="
    echo " OpenClaw — Ollama Docker Setup"
    echo "=========================================="
    echo ""

    check_docker
    start_ollama
    pull_models
    test_inference

    echo ""
    echo "=========================================="
    ok "Setup complete!"
    echo ""
    echo "  API endpoint:  $OLLAMA_URL"
    echo "  Container:     $CONTAINER_NAME"
    echo "  Logs:          docker logs -f $CONTAINER_NAME"
    echo "  Stop:          docker compose -f $COMPOSE_FILE down"
    echo "  Models volume: openclaw-ollama-models"
    echo "=========================================="
}

main "$@"
