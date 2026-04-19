# RentVolt API — Usage Guide

## Base URL

```
Production: https://rentvolt.io
Local dev:  http://localhost:3000
```

## Authentication

All `/api/*` endpoints except the payment/public ones require an API key:

```
x-api-key: YOUR_API_KEY
```

**Getting a key:**

- **Starter (free, 100 req/mo):** `POST /api/keys/free` — no card required.
- **Paid (Growth/Scale/Enterprise):** start at [`/pricing`](https://rentvolt.io/pricing) → Stripe checkout → key emailed on completion.

All keys are stored server-side as SHA-256 hashes. We cannot retrieve a lost key — rotate via `/dashboard`.

## Quickstart

```bash
# 1. Grab a free key
curl -X POST https://rentvolt.io/api/keys/free
# → returns { "apiKey": "sk_live_..." }

# 2. Verify
curl -H "x-api-key: sk_live_..." \
  https://rentvolt.io/api/verify

# 3. Fetch listings
curl -X POST https://rentvolt.io/api/scrape/listings \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk_live_..." \
  -d '{"city":"oakland","state":"ca","filters":{"maxPrice":3000,"minBeds":2,"limit":10}}'

# 4. Market context
curl -H "x-api-key: sk_live_..." \
  https://rentvolt.io/api/market/trends/94612
```

## Endpoints

### GET `/health`
Health status (no auth).

### POST `/api/keys/free`
Issue a free-tier key (100 req/mo). Rate-limited to 1 key per IP per 24 hours. Does not auto-renew.

### GET `/api/verify`
Return current key status and quota usage.

### POST `/api/scrape/listings`

Request:
```json
{
  "city": "oakland",
  "state": "ca",
  "filters": {
    "maxPrice": 3000,
    "minBeds": 2,
    "maxBeds": 3,
    "sortBy": "price",
    "sortOrder": "asc",
    "limit": 20
  }
}
```

Response:
```json
{
  "success": true,
  "listings": [
    {
      "source": "rentcast",
      "id": "abc123",
      "price": 2350,
      "address": "123 Main St, Oakland, CA 94612",
      "zip": "94612",
      "beds": "2 bed",
      "baths": "1 bath",
      "sqft": 850,
      "propertyType": "Apartment",
      "yearBuilt": 1982,
      "daysOnMarket": 7,
      "latitude": 37.8,
      "longitude": -122.27,
      "fetchedAt": "2026-04-17T..."
    }
  ],
  "total": 1,
  "sources": { "rentcast": 1 },
  "query": { "city": "oakland", "state": "ca" },
  "meta": { "requestId": "abc...", "plan": "growth", "remaining": 977 }
}
```

### POST `/api/scrape/bulk` (paid plans)

```json
{
  "locations": [
    { "city": "oakland", "state": "ca" },
    { "city": "seattle", "state": "wa" }
  ],
  "filters": { "maxPrice": 4000 }
}
```

### GET `/api/market/trends/:zip`
HUD Fair Market Rent + Census ACS data for a ZIP code.

### GET `/api/market/briefing/:zip`
One-paragraph, LLM-friendly market briefing. Perfect for feeding to AI agents:

```
GET /api/market/briefing/94612
→ "Median gross rent in ZIP 94612 is $2,100/mo (Census ACS). HUD Fair Market Rent
   for a 2-bedroom is $2,400/mo. Rental vacancy rate is 5.6%. Median household
   income is $88,000."
```

### POST `/api/stripe/checkout`
Creates a Stripe-hosted checkout session. The hosted page includes the CA-ARL-required clear-and-conspicuous auto-renewal disclosure.

```json
{ "plan": "growth" }
→ { "url": "https://checkout.stripe.com/..." }
```

Redirect your user to `url`.

## Error responses

| Status | Meaning |
|--------|---------|
| 400 | Validation error (check `details[].field` and `details[].message`) |
| 401 | Missing `x-api-key` header |
| 403 | Invalid key, inactive subscription, or terms not accepted |
| 429 | Rate or quota limit exceeded (check `Retry-After` and plan `remaining`) |
| 503 | Data provider unreachable (retry with backoff) |

Example validation error:
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "city", "message": "City is required" },
    { "field": "state", "message": "State must be a 2-letter abbreviation" }
  ]
}
```

## Retry + backoff

On `429`, respect `Retry-After` (seconds). For `5xx`, retry with exponential backoff (e.g., 1s, 2s, 4s, 8s, stop after 5 attempts). Idempotent: same query returns cached result for up to 6 hours.

## Examples

### Node.js

```js
const res = await fetch('https://rentvolt.io/api/scrape/listings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.RENTVOLT_API_KEY },
  body: JSON.stringify({ city: 'oakland', state: 'ca', filters: { limit: 10 } })
});
const { listings } = await res.json();
console.log(listings);
```

### Python

```python
import os, requests
r = requests.post(
  'https://rentvolt.io/api/scrape/listings',
  headers={'x-api-key': os.environ['RENTVOLT_API_KEY']},
  json={'city': 'oakland', 'state': 'ca', 'filters': {'limit': 10}}
)
print(r.json()['listings'])
```

### Go

```go
body := strings.NewReader(`{"city":"oakland","state":"ca"}`)
req, _ := http.NewRequest("POST", "https://rentvolt.io/api/scrape/listings", body)
req.Header.Set("Content-Type", "application/json")
req.Header.Set("x-api-key", os.Getenv("RENTVOLT_API_KEY"))
resp, _ := http.DefaultClient.Do(req)
```

### Using with an LLM agent (function-calling)

```json
{
  "name": "get_rental_market_briefing",
  "description": "Get a one-paragraph rental market briefing for a US ZIP code.",
  "parameters": {
    "type": "object",
    "properties": {
      "zip": { "type": "string", "description": "5-digit US ZIP code" }
    },
    "required": ["zip"]
  }
}
```

Wire the tool to `GET /api/market/briefing/:zip` and feed `data.briefing` straight back into the model context.

## Billing, cancellation, and refunds

- Cancel anytime at [`/dashboard`](https://rentvolt.io/dashboard) or Stripe customer portal.
- 14-day refund on first charge (see [Refund Policy](https://rentvolt.io/legal/refund)).
- Pre-charge renewal notice for subscriptions ≥ 1 year per California law.

---

© 2026 **Groundwork Labs LLC** — California Limited Liability Company (Entity B20260059957)
support@groundworklabs.io
