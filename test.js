// Smoke test in mock mode: create -> fund -> hold -> partial release -> fix -> full release.
process.env.PAYPAL_MOCK = '1';
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.NODE_ENV = 'test';
process.env.DATA_FILE = './test-data.json';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { default: app } = await import('./server.js');
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) }).then((r) => r.json());

const m = await post('/api/mandates', {
  task: 'Landing page', cap: 100,
  checklist: [{ text: 'hero section' }, { text: 'contact form' }, { text: 'mobile layout' }, { text: 'opening hours' }],
});
assert.ok(m.id);
await post(`/api/mandates/${m.id}/fund`);
await fetch(`${base}/return?mandate=${m.id}`, { redirect: 'manual' });

let r = await post(`/api/mandates/${m.id}/deliver`, { evidence: 'Built hero section, contact form and mobile layout.' });
assert.equal(r.score, 0.75);
assert.equal(r.released, 75);
assert.equal(r.held, 25);

r = await post(`/api/mandates/${m.id}/deliver`, { evidence: 'Added opening hours. Also hero section, contact form, mobile layout.' });
assert.equal(r.score, 1);
assert.equal(r.released, 100);
assert.equal(r.status, 'RELEASED');

// The web pages are served, and the secrets file never is.
const home = await fetch(base + '/');
assert.equal(home.status, 200);
assert.match(await home.text(), /ProofPay/);
assert.equal((await fetch(base + '/app.html')).status, 200);
assert.equal((await fetch(base + '/.env')).status, 404);

console.log('OK: partial release 75/25 then full release 100, pages served, .env not exposed');
server.close();
fs.rmSync('./test-data.json', { force: true });
