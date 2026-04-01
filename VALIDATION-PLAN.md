# API Business Validation Plan

**Deadline:** Sunday April 6, 2026 end of day ET
**Decision:** Continue or shut down the API business

## Success Metrics (must hit BOTH)

1. **External API traffic:** 5+ unique external IPs hitting any endpoint on api.nautdev.com
2. **npm downloads:** 20+ total downloads across @vbotholemu MCP packages

## Monitoring

Check daily via:
```bash
# External IPs (exclude our IPs)
python3 -c "
import json, glob
from collections import Counter
ips = Counter()
for f in sorted(glob.glob('/Users/Shared/openclaw/l402-apis/logs/api-audit-*.jsonl')):
    for line in open(f):
        try:
            d = json.loads(line)
            if d.get('path','') != '/api/v1/health':
                ips[d.get('ip_hash','')] += 1
        except: pass
our_ips = {'12ca17b49af22894', 'eff8e7ca506627fe', '3e48ef9d22e096da'}
external = {ip: c for ip, c in ips.items() if ip not in our_ips}
print(f'External unique IPs: {len(external)}')
for ip, c in sorted(external.items(), key=lambda x: -x[1]):
    print(f'  {ip}: {c} hits')
"

# npm downloads
for pkg in mcp-sanctions-check mcp-marine-weather mcp-charter-planner mcp-aviation-weather mcp-company-search mcp-domain-intel mcp-crypto-data mcp-llm-inference; do
  echo -n "$pkg: "
  curl -s "https://api.npmjs.org/downloads/point/last-week/@vbotholemu/$pkg" | python3 -c "import json,sys; print(json.load(sys.stdin).get('downloads',0))"
done
```

## Plan A: Traffic in 24h

1. Identify who — IP, UA, endpoint, what happened
2. If they bounced on 402 → deploy free tier (API key, 100 calls/day) within 2 hours
3. If they hit free endpoints → they're evaluating, ensure clear path to paid
4. If they paid an invoice → real customer, trace and engage
5. Add referrer tracking (which channel sent them?)
6. Stand up /try endpoint (3 free calls, no registration)
7. Post "first users" update on MoltBook

## Plan B: Zero traffic after 24h (but before Sunday)

### Diagnose
- ClawHub: are skills showing in search?
- Glama: has submission been approved?
- Reddit: any views/upvotes on r/mcp comment?
- MoltBook: engagement on new posts?
- npm: any download blips?

### If invisible (buried/not approved)
- Post own r/mcp [showcase] thread
- Write "How to add L402 to your MCP server" tutorial
- Cross-post to MoltBook /agents and /crypto
- Engage in 5+ active MoltBook payment/tooling threads

### If visible but nobody clicks (value prop problem)
- Deploy free tier immediately (API key, 50 free calls)
- Lead with "free sanctions screening" and "free marine weather"
- Update all listings to emphasize free access
- Sanctions + marine weather use free public APIs — can be permanent free tier

## Plan C: Sunday, both metrics at zero

- Stop marketing tweet automation and scout/responder crons
- Keep infrastructure running (cheap)
- BTC stays in wallet
- npm packages stay published
- Redirect energy to next opportunity
- Document lessons learned

## Distribution Channels (as of April 1)

| Channel | Status | Audience |
|---------|--------|----------|
| ClawHub | 5/8 published, 3 pending rate limit | 20K+ skills |
| Glama | Submitted, pending review | 20K+ MCP servers |
| Reddit r/mcp | Comment posted | 90K weekly visitors |
| MoltBook /builds | Post published | Active agent community |
| MoltBook /tooling | Post published | Active agent community |
| npm | 8 packages published | MCP ecosystem |
| Twitter | ~58 tweets | Low signal (0 conversions) |

## Daily Report Template

```
Date: YYYY-MM-DD
External unique IPs: X (target: 5)
npm downloads (7d): X (target: 20)
New MoltBook engagement: X comments/upvotes
Reddit activity: X
ClawHub installs: X
Notes:
```
