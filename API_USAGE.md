# API Usage Guide

## Base URL
```
Production: https://your-app.onrender.com
Local:      http://localhost:3000
```

## Authentication
All API endpoints require an API key in the header:
```
x-api-key: YOUR_API_KEY
```

**Test Keys:**
- `sk_test_free_001` - Free tier (100 requests/month)
- `sk_test_basic_002` - Basic tier (1,000 requests/month)
- `sk_test_pro_003` - Pro tier (10,000 requests/month)

## Endpoints

### 1. Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "company": "Groundwork Labs LLC",
  "jurisdiction": "California, USA",
  "timestamp": "2026-04-07T02:20:00.000Z"
}
```

### 2. Create Stripe Checkout
```bash
POST /api/stripe/checkout
x-api-key: YOUR_API_KEY
Content-Type: application/json

{
  "plan": "basic"  // or "pro"
}
```

Response:
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

### 3. Get Listings
```bash
POST /api/scrape/listings
x-api-key: YOUR_API_KEY
Content-Type: application/json

{
  "city": "oakland",
  "state": "ca",
  "filters": {
    "maxPrice": 3000,
    "minBeds": 2,
    "sources": ["rentals", "zillow"]
  }
}
```

Response:
```json
{
  "listings": [
    {
      "source": "rentals.com",
      "price": 2500,
      "address": "123 Main St, CA",
      "beds": "2 bed",
      "baths": "1 bath",
      "scrapedAt": "2026-04-07T02:20:00.000Z"
    }
  ],
  "total": 40,
  "sources": {
    "rentals.com": 10,
    "zillow.com": 10
  },
  "scrapedAt": "2026-04-07T02:20:00.000Z"
}
```

### 4. Get Supported Locations
```bash
GET /api/scrape/locations
```

Response:
```json
{
  "locations": [
    { "city": "oakland", "state": "ca" },
    { "city": "san-francisco", "state": "ca" }
  ],
  "sources": ["rentals.com", "zillow.com", "apartments.com"]
}
```

## Error Responses

### 400 - Validation Error
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "city", "message": "City is required" }
  ]
}
```

### 401 - Missing API Key
```json
{
  "error": "API key required. Include x-api-key header."
}
```

### 403 - Invalid API Key
```json
{
  "error": "Invalid API key"
}
```

### 429 - Rate Limited
```json
{
  "error": "Monthly limit reached. Upgrade to continue."
}
```

## Example: Using cURL

```bash
# Check health
curl https://your-app.onrender.com/health

# Get listings
curl -X POST https://your-app.onrender.com/api/scrape/listings \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk_test_basic_002" \
  -d '{"city": "oakland", "state": "ca"}'
```

## Example: Using JavaScript

```javascript
const response = await fetch('https://your-app.onrender.com/api/scrape/listings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'sk_test_basic_002'
  },
  body: JSON.stringify({
    city: 'oakland',
    state: 'ca',
    filters: { maxPrice: 3000 }
  })
});

const data = await response.json();
console.log(data.listings);
```

---
**© 2026 Groundwork Labs LLC** — California Limited Liability Company
