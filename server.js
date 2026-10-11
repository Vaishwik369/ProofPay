import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { store } from './db.js';
import { buildMandate, round2, isExpired } from './mandate.js';
import { audit, auditorInfo } from './auditor.js';
import * as paypal from './paypal.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Public address used for PayPal return/cancel links.
// Set APP_BASE_URL to override; otherwise it is detected on GitHub Codespaces and Render.
function detectAppUrl() {
  const set = (process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  if (set && !/localhost|127\.0\.0\.1/.test(set)) return set;
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  if (process.env.CODESPACE_NAME) {
    const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
    return `https://${process.env.CODESPACE_NAME}-${PORT}.${domain}`;
  }
  return set || `http://localhost:${PORT}`;
}
const APP_URL = detectAppUrl();

// Serve the two pages from public/ (or the project root if they were uploaded there by mistake).
// The root folder is never served as a whole, because it contains .env.
const findPage = (name) => [path.join(HERE, 'public', name), path.join(HERE, name)].find((p) => fs.existsSync(p));
const page = (name) => (_req, res) => {
  const file = findPage(name);
  if (!file) return res.status(404).send(`${name} was not found. Put index.html and app.html inside a folder named "public".`);
  res.sendFile(file);
};
app.get(['/', '/index.html'], page('index.html'));
app.get('/app.html', page('app.html'));
app.use(express.static(path.join(HERE, 'public')));

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: e.message });
  });

const log = (m, event, detail = {}) => {
  m.history.push({ at: new Date().toISOString(), event, ...detail });
  return store.put(m);
};

// Health + mode info (judges can see whether mocks are active)
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, paypalMock: paypal.MOCK, auditorMock: auditorInfo().mock, auditor: auditorInfo() }),
);

// 1. Create a mandate (budget cap + agreed checklist)
app.post('/api/mandates', wrap(async (req, res) => {
  const { mandate, errors } = buildMandate(req.body);
  if (errors) return res.status(400).json({ errors });
  store.put(mandate);
  res.status(201).json(log(mandate, 'MANDATE_CREATED'));
}));

app.get('/api/mandates', (_req, res) => res.json(store.all()));
app.get('/api/mandates/:id', (req, res) => {
  const m = store.get(req.params.id);
  return m ? res.json(m) : res.status(404).json({ error: 'not found' });
});

// 2. Create the PayPal order (intent AUTHORIZE). Buyer approves at approveUrl.
app.post('/api/mandates/:id/fund', wrap(async (req, res) => {
  const m = store.get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  if (m.status !== 'CREATED') return res.status(409).json({ error: `cannot fund in status ${m.status}` });
  const order = await paypal.createAuthorizeOrder({
    amount: m.total,
    currency: m.currency,
    description: m.task.slice(0, 120),
    returnUrl: `${APP_URL}/return?mandate=${m.id}`,
    cancelUrl: `${APP_URL}/app.html?mandate=${m.id}`,
  });
  m.orderId = order.orderId;
  log(m, 'ORDER_CREATED', { orderId: order.orderId });
  res.json({ approveUrl: order.approveUrl, orderId: order.orderId });
}));

// 3. PayPal redirects here after buyer approval -> place the hold.
app.get('/return', wrap(async (req, res) => {
  const m = store.get(req.query.mandate);
  if (!m) return res.status(404).send('Unknown mandate');
  if (m.status === 'CREATED') {
    const { authorizationId } = await paypal.authorizeOrder(m.orderId);
    m.authorizationId = authorizationId;
    m.status = 'FUNDED';
    log(m, 'FUNDS_HELD', { authorizationId, amount: m.total });
  }
  res.redirect(`/app.html?mandate=${m.id}`);
}));

// 4. Submit delivery evidence -> AI audit -> proportional capture.
app.post('/api/mandates/:id/deliver', wrap(async (req, res) => {
  const m = store.get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  if (!['FUNDED', 'PARTIAL'].includes(m.status)) return res.status(409).json({ error: `cannot deliver in status ${m.status}` });
  if (isExpired(m)) return res.status(409).json({ error: 'mandate expired; call /close' });
  const evidence = String(req.body.evidence || '').trim();
  if (!evidence) return res.status(400).json({ error: 'evidence is required' });

  const result = await audit({ task: m.task, checklist: m.checklist, evidence });
  const target = round2(m.total * result.score);
  const delta = round2(target - m.released);
  const final = result.score === 1;

  let captureId = null;
  if (delta > 0) {
    // Stable request id => safe to retry without double-capturing.
    const cap = await paypal.capture({
      authorizationId: m.authorizationId,
      amount: delta,
      currency: m.currency,
      final,
      requestId: `${m.id}-${m.history.length}`,
    });
    captureId = cap.captureId;
    m.released = target;
  }
  m.status = final ? 'RELEASED' : 'PARTIAL';
  log(m, 'AUDITED', {
    score: result.score,
    released: m.released,
    held: round2(m.total - m.released),
    capturedNow: delta > 0 ? delta : 0,
    captureId,
    items: result.items,
    summary: result.summary,
    auditorMock: result.mock,
    auditor: `${result.provider}/${result.model}`,
  });
  res.json({
    score: result.score,
    items: result.items,
    summary: result.summary,
    released: m.released,
    held: round2(m.total - m.released),
    status: m.status,
  });
}));

// 5. Close: void whatever is still held (deadline reached or buyer cancels).
app.post('/api/mandates/:id/close', wrap(async (req, res) => {
  const m = store.get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  if (!['FUNDED', 'PARTIAL'].includes(m.status)) return res.status(409).json({ error: `cannot close in status ${m.status}` });
  await paypal.voidAuthorization(m.authorizationId);
  m.status = 'CLOSED';
  res.json(log(m, 'CLOSED', { returnedToBuyer: round2(m.total - m.released) }));
}));

// Optional: PayPal webhook receiver (verify signatures before trusting in production).
app.post('/api/webhooks/paypal', (req, res) => {
  console.log('webhook', req.body?.event_type);
  res.sendStatus(200);
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    const ai = auditorInfo();
    console.log(`ProofPay is running on port ${PORT}`);
    console.log(`  PayPal return address: ${APP_URL}`);
    console.log(`  PayPal: ${paypal.MOCK ? 'MOCK (no real calls)' : 'sandbox'}   Auditor: ${ai.mock ? 'keyword matcher (no AI key set)' : ai.provider + ' / ' + ai.model}`);
  });
}
export default app;
