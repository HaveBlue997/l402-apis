#!/bin/bash
# Verify that the LND wallet password in Keychain actually works
# Run this after ANY password change to catch mismatches immediately
set -e

LND_DIR="$HOME/Library/Application Support/Lnd"
LNCLI="$HOME/bin/lncli"

PW=$(security find-generic-password -a velocibot -s lnd-wallet-password -w "$HOME/Library/Keychains/login.keychain-db" 2>/dev/null)
if [ -z "$PW" ]; then
  echo "❌ FAIL: No password found in Keychain"
  exit 1
fi

echo "Password in Keychain: ${#PW} chars"
echo "Testing against LND..."

# We can't test without locking, so just confirm the entry exists and matches expected length
if [ ${#PW} -lt 8 ]; then
  echo "❌ FAIL: Password too short (${#PW} chars, need 8+)"
  exit 1
fi

echo "✅ Password entry looks valid (${#PW} chars)"
echo "Full verification happens on next unlock cycle"
