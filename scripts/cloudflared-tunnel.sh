#!/bin/bash
# Quick tunnel for L402 API — URL is random but stable while running
# If this restarts, the URL changes and Route 53 CNAME needs updating
LOG="/tmp/cloudflared-tunnel.log"
exec cloudflared tunnel --url http://localhost:9090 >> "$LOG" 2>&1
