// PayPal sandbox client: authorize -> partial capture(s) -> void remainder.
// Verify endpoint details against https://developer.paypal.com/docs/api/orders/v2/
// and https://developer.paypal.com/docs/api/payments/v2/ before relying on them.
import crypto from 'node:crypto';

const BASE = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
export const MOCK = process.env.PAYPAL_MOCK === '1';

let cached = { token: null, exp: 0 };

async function getToken() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return cached.token;
}

async function api(path, method, body, requestId) {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': requestId || crypto.randomUUID(), // pass a stable id to make retries idempotent
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`PayPal ${method} ${path} -> ${res.status}: ${text}`);
  return data;
}

const fmt = (n) => Number(n).toFixed(2);

/** Create an order with intent AUTHORIZE. Returns { orderId, approveUrl }. */
export async function createAuthorizeOrder({ amount, currency, description, returnUrl, cancelUrl }) {
  if (MOCK) return { orderId: 'MOCK-ORDER-' + crypto.randomUUID(), approveUrl: returnUrl + '&token=MOCK' };
  const data = await api('/v2/checkout/orders', 'POST', {
    intent: 'AUTHORIZE',
    purchase_units: [{ description, amount: { currency_code: currency, value: fmt(amount) } }],
    payment_source: {
      paypal: { experience_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: 'PAY_NOW' } },
    },
  });
  const link = data.links.find((l) => l.rel === 'payer-action') || data.links.find((l) => l.rel === 'approve');
  return { orderId: data.id, approveUrl: link?.href };
}

/** After the buyer approves, place the authorization hold. Returns { authorizationId }. */
export async function authorizeOrder(orderId) {
  if (MOCK) return { authorizationId: 'MOCK-AUTH-' + crypto.randomUUID() };
  const data = await api(`/v2/checkout/orders/${orderId}/authorize`, 'POST');
  const auth = data.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error('No authorization returned: ' + JSON.stringify(data));
  return { authorizationId: auth.id };
}

/** Capture part (or all) of the held funds. final=true releases the rest of the hold. */
export async function capture({ authorizationId, amount, currency, final, requestId }) {
  if (MOCK) return { captureId: 'MOCK-CAP-' + crypto.randomUUID() };
  const data = await api(
    `/v2/payments/authorizations/${authorizationId}/capture`,
    'POST',
    { amount: { currency_code: currency, value: fmt(amount) }, final_capture: !!final },
    requestId,
  );
  return { captureId: data.id, status: data.status };
}

/** Void whatever is still held (used when the deadline passes or the buyer cancels). */
export async function voidAuthorization(authorizationId) {
  if (MOCK) return { voided: true };
  await api(`/v2/payments/authorizations/${authorizationId}/void`, 'POST');
  return { voided: true };
}
