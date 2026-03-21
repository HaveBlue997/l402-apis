# NautDev L402 API Tests

## lnget Integration Tests

End-to-end tests using [lnget](https://github.com/lightninglabs/lnget) — Lightning Labs' L402-aware HTTP client. These tests verify the full payment flow: request → 402 → Lightning payment → data response.

### Prerequisites

1. **Install lnget:**
   ```bash
   go install github.com/lightninglabs/lnget/cmd/lnget@latest
   ```

2. **Configure Lightning backend:**
   ```bash
   lnget config init
   # Edit ~/.lnget/config.yaml with your LND connection details
   ```

3. **Fund your wallet** (~1000 sats minimum for a full test run)

4. **Verify connection:**
   ```bash
   lnget ln status
   ```

### Running Tests

```bash
# Against production
./tests/lnget-integration.sh

# Against local development server
./tests/lnget-integration.sh http://localhost:9080
```

### What's Tested

| Test | Description | Payment |
|------|-------------|---------|
| Health endpoint | Returns `status: ok` | Free |
| Pricing endpoint | Returns endpoint list | Free |
| LLM models | Returns available models | Free |
| Sanctions status | Returns list counts | Free |
| OpenAPI spec | Returns valid document | Free |
| Sanctions check | Full L402 flow: query → pay → results | ~10 sats |
| Marine weather | Full L402 flow: zone query → pay → forecast | ~5 sats |
| Crypto price | Full L402 flow: symbol → pay → price | ~5 sats |
| Domain WHOIS | Full L402 flow: domain → pay → WHOIS data | ~10 sats |
| Token caching | Second request reuses cached macaroon | 0 sats |
| Payment limits | `--max-amount` rejects expensive invoices | 0 sats |
| LLM inference | Full L402 flow: prompt → pay → response | ~50 sats |

**Estimated cost per full test run:** ~80-100 sats ($0.01)

### CI/CD Integration

The test script returns exit code 0 on success, non-zero on failure. Suitable for CI pipelines:

```yaml
# GitHub Actions example
- name: Run L402 integration tests
  run: |
    go install github.com/lightninglabs/lnget/cmd/lnget@latest
    ./tests/lnget-integration.sh https://api.nautdev.com
  env:
    LNGET_LN_LND_HOST: ${{ secrets.LND_HOST }}
    LNGET_LN_LND_MACAROON: ${{ secrets.LND_MACAROON }}
    LNGET_LN_LND_TLS_CERT: ${{ secrets.LND_TLS_CERT }}
```

### Why lnget?

lnget handles the entire L402 flow transparently — parse 402 challenge, pay Lightning invoice, retry with macaroon. This means our tests verify the actual payment experience an agent will have, not a mocked version of it.

Every test run costs real sats. That's the point — we test what our customers experience.
