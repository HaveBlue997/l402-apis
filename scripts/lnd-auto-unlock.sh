#!/bin/bash
# LND Auto-Unlock Script (launchd compatible — no tilde, no interactive shell)
set -e

LND_DIR="/Users/velocibot/Library/Application Support/Lnd"
LNCLI="/Users/velocibot/bin/lncli"
MAX_WAIT=30

echo "[auto-unlock] Starting at $(date)"

# Wait for LND to be ready
for i in $(seq 1 $MAX_WAIT); do
  STATE=$("$LNCLI" --lnddir="$LND_DIR" state 2>/dev/null | grep -o '"state":.*"' | cut -d'"' -f4 || true)
  if [ "$STATE" = "LOCKED" ]; then
    echo "[auto-unlock] LND is locked, unlocking..."
    break
  elif [ "$STATE" = "RPC_ACTIVE" ] || [ "$STATE" = "SERVER_ACTIVE" ]; then
    echo "[auto-unlock] LND already unlocked!"
    exit 0
  fi
  sleep 1
done

if [ "$STATE" != "LOCKED" ]; then
  echo "[auto-unlock] LND not in LOCKED state after ${MAX_WAIT}s (state: $STATE)"
  exit 1
fi

# Get password from Keychain (use full path to keychain)
PW=$(security find-generic-password -a velocibot -s lnd-wallet-password -w /Users/velocibot/Library/Keychains/login.keychain-db 2>/dev/null)
if [ -z "$PW" ]; then
  echo "[auto-unlock] ERROR: Could not read password from Keychain"
  exit 1
fi

# Unlock using expect with full paths
/usr/bin/expect -c "
  set timeout 15
  spawn $LNCLI --lnddir {$LND_DIR} unlock
  expect \"Input wallet password:\"
  send \"$PW\r\"
  expect {
    \"successfully unlocked\" { puts \"\n\[auto-unlock\] SUCCESS\"; exit 0 }
    \"invalid passphrase\" { puts \"\n\[auto-unlock\] WRONG PASSWORD\"; exit 1 }
    eof { exit 0 }
  }
"

# Verify
sleep 5
STATE=$("$LNCLI" --lnddir="$LND_DIR" state 2>/dev/null | grep -o '"state":.*"' | cut -d'"' -f4 || true)
if [ "$STATE" = "RPC_ACTIVE" ] || [ "$STATE" = "SERVER_ACTIVE" ]; then
  echo "[auto-unlock] ✅ LND unlocked and running!"
  "$LNCLI" --lnddir="$LND_DIR" getinfo 2>/dev/null | grep -E "alias|synced|block_height" || true
else
  echo "[auto-unlock] State after unlock: $STATE"
fi
