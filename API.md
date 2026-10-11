# ProofPay API

Base URL: `http://localhost:3000`. All bodies are JSON.

## Health

`GET /api/health` returns `{ ok, paypalMock, auditorMock }`.

## Mandates

### Create
`POST /api/mandates`

```json
{
  "task": "Build a landing page for my bakery",
  "cap": 100,
  "currency": "USD",
  "expiresAt": "2026-11-01T00:00:00Z",
  "sellerEmail": "freelancer@example.com",
  "checklist": [
    { "text": "Hero section with bakery name", "weight": 2 },
    { "text": "Contact form present" },
    { "text": "Mobile responsive layout" }
  ]
}
```

`weight` is optional (default 1). Returns `201` with the mandate, or `400 { errors: [...] }`.

### List / get
- `GET /api/mandates`
- `GET /api/mandates/:id`

### Fund (hold money)
`POST /api/mandates/:id/fund` creates a PayPal order with `intent: AUTHORIZE` and returns `{ approveUrl, orderId }`. Send the buyer to `approveUrl`. After approval PayPal redirects to `GET /return?mandate=:id`, which places the authorization hold and sets the status to `FUNDED`.

### Deliver (audit and release)
`POST /api/mandates/:id/deliver`

```json
{ "evidence": "Live at https://example.com. Hero, contact form and mobile layout done." }
```

Response:

```json
{
  "score": 0.75,
  "items": [{ "id": "c1", "text": "...", "passed": true, "reason": "..." }],
  "summary": "...",
  "released": 75,
  "held": 25,
  "status": "PARTIAL"
}
```

Only the difference between the new target and the amount already released is captured. A score of `1` makes the capture final (`RELEASED`). Allowed from status `FUNDED` or `PARTIAL`, and not after `expiresAt`.

### Close (return held funds)
`POST /api/mandates/:id/close` voids the remaining authorization and sets the status to `CLOSED`. Allowed from `FUNDED` or `PARTIAL`.

## Webhook

`POST /api/webhooks/paypal` receives PayPal events (currently logged only).

## Errors

`404` not found, `409` wrong state for the action, `400` invalid input, `500 { error }` for upstream (PayPal or AI) failures.
