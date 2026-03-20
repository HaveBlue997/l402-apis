#!/bin/bash
# Start the full L402 API stack: LND → Aperture → API Server
# Usage: ./start-stack.sh [start|stop|status]

set -e

LND_DIR="$HOME/Library/Application Support/Lnd"
LND_BIN="$HOME/bin/lnd"
LNCLI_BIN="$HOME/bin/lncli"
APERTURE_BIN="$HOME/bin/aperture"
APERTURE_CONF="/Users/Shared/openclaw/l402-apis/config/aperture.yaml"
API_DIR="/Users/Shared/openclaw/l402-apis/api"
LOG_DIR="/Users/Shared/openclaw/l402-apis/logs"

mkdir -p "$LOG_DIR"

get_wallet_password() {
    security find-generic-password -a velocibot -s lnd-wallet-password -w 2>/dev/null
}

start_lnd() {
    if pgrep -x lnd > /dev/null; then
        echo "✅ LND already running"
        return 0
    fi
    echo "🔄 Starting LND..."
    "$LND_BIN" --lnddir="$LND_DIR" > "$LOG_DIR/lnd.log" 2>&1 &
    echo $! > "$LOG_DIR/lnd.pid"
    sleep 5

    # Auto-unlock wallet
    local password
    password=$(get_wallet_password)
    if [ -n "$password" ]; then
        echo "🔓 Unlocking wallet..."
        # Use the REST API to unlock (avoids TTY requirement)
        local tls_cert="$LND_DIR/tls.cert"
        echo "{\"wallet_password\": \"$(echo -n "$password" | base64)\"}" | \
            curl -s --cacert "$tls_cert" -X POST \
            https://localhost:8080/v1/unlockwallet \
            -d @- > /dev/null 2>&1
        sleep 3
        echo "✅ LND started and unlocked"
    else
        echo "⚠️  LND started but couldn't find wallet password in Keychain"
    fi
}

start_api() {
    if pgrep -f "node src/server.js" > /dev/null; then
        echo "✅ API server already running"
        return 0
    fi
    echo "🔄 Starting API server..."
    cd "$API_DIR"
    node src/server.js > "$LOG_DIR/api.log" 2>&1 &
    echo $! > "$LOG_DIR/api.pid"
    sleep 3
    echo "✅ API server started on port 9090"
}

start_aperture() {
    if pgrep -x aperture > /dev/null; then
        echo "✅ Aperture already running"
        return 0
    fi
    echo "🔄 Starting Aperture..."
    "$APERTURE_BIN" --configfile="$APERTURE_CONF" > "$LOG_DIR/aperture.log" 2>&1 &
    echo $! > "$LOG_DIR/aperture.pid"
    sleep 2
    echo "✅ Aperture started on port 8443"
}

stop_all() {
    echo "Stopping services..."
    pkill -x aperture 2>/dev/null && echo "Stopped Aperture" || echo "Aperture not running"
    pkill -f "node src/server.js" 2>/dev/null && echo "Stopped API server" || echo "API not running"
    pkill -x lnd 2>/dev/null && echo "Stopped LND" || echo "LND not running"
    rm -f "$LOG_DIR"/*.pid
}

status() {
    echo "=== L402 Stack Status ==="
    if pgrep -x lnd > /dev/null; then
        echo "✅ LND: running (PID $(pgrep -x lnd))"
        "$LNCLI_BIN" --lnddir="$LND_DIR" getinfo 2>/dev/null | grep -E '"alias"|"block_height"|"synced_to_chain"|"num_active_channels"' || true
    else
        echo "❌ LND: not running"
    fi
    echo ""
    if pgrep -f "node src/server.js" > /dev/null; then
        echo "✅ API Server: running on port 9090"
        curl -s http://localhost:9090/api/v1/health | python3 -m json.tool 2>/dev/null || true
    else
        echo "❌ API Server: not running"
    fi
    echo ""
    if pgrep -x aperture > /dev/null; then
        echo "✅ Aperture: running on port 8443"
    else
        echo "❌ Aperture: not running"
    fi
    echo ""
    echo "=== Wallet Balance ==="
    "$LNCLI_BIN" --lnddir="$LND_DIR" walletbalance 2>/dev/null | grep -E '"total_balance"|"confirmed"|"unconfirmed"' || echo "Unable to check"
}

case "${1:-status}" in
    start)
        start_lnd
        start_api
        # Don't start Aperture until channels are open
        # start_aperture
        echo ""
        echo "🚀 Stack started! (Aperture disabled until channels are funded)"
        ;;
    stop)
        stop_all
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 [start|stop|status]"
        ;;
esac
