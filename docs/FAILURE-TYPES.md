# L402 Failure Types Documentation

## Overview

This document describes the different `failure_type` values returned in 402 Payment Required and 429 Too Many Requests responses, along with recommended retry strategies for each.

**Feature Status:**
- ✅ **Promo System**: Enhanced 402/429 responses with failure_type and retry_strategy
- 🔄 **Main L402 Paywall**: In progress - requires Aperture configuration or middleware enhancement

## Promo System Failure Types

### `credits_expired`
**HTTP Status:** 402  
**Cause:** User's earned credits have passed their expiration date (14 days)  
**Retry Strategy:** Earn new credits by submitting social media posts  

```json
{
  "status": 402,
  "message": "Credits have expired.",
  "failure_type": "credits_expired",
  "retry_strategy": {
    "action": "earn_credits",
    "description": "Submit a social media post about NautDev APIs to earn credits",
    "wait_time": null
  }
}
```

### `credits_exhausted`
**HTTP Status:** 402  
**Cause:** User has zero credits remaining  
**Retry Strategy:** Earn credits by submitting social media posts  

```json
{
  "status": 402,
  "message": "No credits remaining.",
  "failure_type": "credits_exhausted",
  "retry_strategy": {
    "action": "earn_credits",
    "description": "Submit a social media post about NautDev APIs to earn credits",
    "wait_time": null
  }
}
```

### `daily_cap_reached`
**HTTP Status:** 429  
**Cause:** User has reached their daily usage limit for a specific API endpoint  
**Retry Strategy:** Wait until the next UTC day, then retry  

```json
{
  "error": "Daily cap reached",
  "message": "You've reached the daily limit of 15 calls for sanctions_check.",
  "failure_type": "daily_cap_reached",
  "daily_cap": 15,
  "current_usage": 15,
  "resets_at": "2026-03-26T00:00:00.000Z",
  "retry_strategy": {
    "action": "wait_and_retry",
    "description": "Daily usage limit reached, retry after midnight UTC",
    "wait_time": "until_next_day"
  }
}
```

## Lightning L402 Paywall Failure Types

**Status:** Planned - awaiting Marketing clarification on priority

### Proposed `liquidity` failure type
**Cause:** Lightning payment fails due to insufficient channel liquidity  
**Retry Strategy:** Split payment into smaller amounts or retry with different route

### Proposed `path_finding` failure type  
**Cause:** Lightning payment fails due to no available route to destination  
**Retry Strategy:** Wait for network topology changes, try different entry node

### Proposed `timeout` failure type
**Cause:** Lightning payment times out during route resolution or payment attempt  
**Retry Strategy:** Retry after brief wait, may succeed on subsequent attempt

## Implementation Notes

### Promo System
- Implemented in `promo-api-proxy` Lambda function
- Uses DynamoDB for credit tracking and usage caps
- Enhanced responses include both `failure_type` and `retry_strategy`

### Main L402 Paywall
- Uses Aperture reverse proxy for Lightning payments
- Current responses: basic "payment required" message
- Enhancement options:
  1. Aperture configuration (if supported)
  2. Custom middleware to intercept and enhance responses
  3. Gateway-level response transformation

## Community Feedback

This feature was requested by **signalswarm2** on MoltBook in response to our L402 comparison post. The feedback highlighted that different Lightning failure types require different mitigation strategies, making this classification valuable for agent developers.

## Usage Examples

### Agent Implementation
```javascript
async function handlePaymentRequired(response) {
  const data = await response.json();
  
  switch (data.failure_type) {
    case 'credits_expired':
    case 'credits_exhausted':
      return 'redirect_to_earn_credits';
      
    case 'daily_cap_reached':
      const resetTime = new Date(data.resets_at);
      return `retry_after_${resetTime}`;
      
    case 'liquidity':
      return 'split_payment_or_retry';
      
    case 'path_finding':
      return 'wait_and_retry_with_different_route';
      
    case 'timeout':
      return 'brief_wait_and_retry';
      
    default:
      return 'escalate_to_human';
  }
}
```

### Testing
- Test promo system: `https://promo.nautdev.com/api/v1/sanctions/check` (register first, exhaust credits)
- Test main L402: `https://nautdev.com/api/v1/sanctions/check?name=test` (currently basic response)