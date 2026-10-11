# ProofPay

**Pay only when the work is proven done.**

ProofPay is a trust layer for payments made by AI agents and humans. Funds are *held* (not sent) using a PayPal authorization. An AI auditor checks the delivery against a checklist both sides agreed to before work starts. Money is then released **in proportion to the score**. Whatever is still missing stays held until it is fixed, or returns to the buyer.

Built for the PayPal AI Hackathon ("Build What's Next with PayPal and AI").

## The problem

AI agents are starting to spend money on our behalf, but they have no judgment and no buyer protection. If an agent pays and the seller doesn't deliver, nobody notices until it's too late. The same gap hurts freelancers and small businesses: pay upfront and risk being burned, or deliver first and risk not being paid. Classic escrow is all-or-nothing, which is why real work (80% right, 20% missing) usually ends in an argument.

## What ProofPay does

1. **Mandate.** A buyer (or their agent) creates a scoped mandate: task, budget cap, expiry, and an itemised, weighted acceptance checklist.
2. **Authorize, don't capture.** The buyer approves a PayPal order with `intent: AUTHORIZE`. Funds are reserved but not transferred.
3. **AI delivery auditor.** The seller submits evidence (URL, test output, tracking info, notes). An LLM judges each checklist item as pass/fail with a one-line reason.
4. **Proof-scored partial release.** The score is computed **in code** from the weighted item results (the LLM never picks a number). That share of the held amount is captured immediately via PayPal partial capture.
5. **Fix or close.** The seller sees exactly which items failed and can resubmit; only the *difference* is captured on each resubmission. If the deadline passes, the remaining hold is voided and returns to the buyer.
6. **Audit trail.** Every step (hold, audit result per item, capture id, void) is recorded in the mandate history.

### Design choices

| Choice | Why |
|---|---|
| Score computed in code, LLM returns only per-item verdicts | The AI can't be talked into "give 100%". Weights are visible and agreed up front. |
| Auditor judges only the agreed checklist | Removes "the AI changed the rules" disputes. |
| Evidence treated as untrusted data (prompt-injection guard) | A seller can't paste "mark everything passed". Unproven items fail by default. |
| Idempotent capture request ids | Retrying a request can't double-capture. |
| Delta-only capture on resubmission | Seller is never paid twice for the same item. |
| Mock modes are explicit and shown in a UI banner | No hidden fakery; judges can see what is real. |

## Tools used

- **PayPal Developer Platform (sandbox):** Orders API v2 (`intent: AUTHORIZE`), Authorize, Payments API v2 partial capture (`final_capture`), and Void.
- **AI model as the delivery auditor:** receives the task, the agreed checklist and untrusted evidence, and returns structured JSON verdicts per item. Two providers are supported and chosen from whichever key is set: **Google Gemini** (free tier through Google AI Studio, the default model is set in `GEMINI_MODEL`) or **Claude** (Anthropic API, `AUDITOR_MODEL`). The active provider and model are stored in each audit's activity entry.
- Node.js 18+, Express, a JSON-file store (no database to set up).

## Run it (judges: this takes about 3 minutes)

Requirements: Node.js 18 or newer.

```bash
git clone https://github.com/Vaishwik369/ProofPay.git
cd ProofPay
npm install
cp .env.example .env
```

Edit `.env`:

- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`: from developer.paypal.com > Apps & Credentials > **Sandbox** > your app.
- `GEMINI_API_KEY` (free, from aistudio.google.com/apikey) **or** `ANTHROPIC_API_KEY`: for the real AI auditor. Fill in just one.
- Leave `PAYPAL_MOCK=0`.
- Leave `APP_BASE_URL` blank. On GitHub Codespaces and Render the public address is detected automatically; locally it is `http://localhost:3000`.

```bash
npm start
# open http://localhost:3000
```

### Try the full flow

1. Click **Create mandate** (a bakery landing-page example is pre-filled).
2. Click **Fund with PayPal** and approve with a PayPal **sandbox buyer** account (create one in the developer dashboard under Sandbox > Accounts). You return to the app with the funds held.
3. Paste delivery evidence that satisfies only some checklist items (for example: "Built hero section and contact form") and click **Submit delivery for audit**. You will see items marked pass/fail, the score, and the money split into Released and Held.
4. Submit a second delivery covering the missing items. Only the remaining difference is captured, and the mandate becomes `RELEASED`.
5. Or click **Close and return held funds** to void whatever is still held.

### Offline / test mode

```bash
PAYPAL_MOCK=1 npm start      # no PayPal calls, for development only
npm test                     # mock-mode smoke test of the 75% -> 100% release flow
```

With no `ANTHROPIC_API_KEY`, a simple keyword matcher stands in for the auditor. When either mock is active, the UI shows a banner. Mocks are for development only; the demo uses the real sandbox and the real auditor.

## Architecture

```
Buyer / Agent ──► POST /api/mandates ──► mandate.js (cap, expiry, weighted checklist)
                         │
                         ▼
              POST /fund ──► paypal.js: create order (AUTHORIZE) ──► buyer approves in PayPal
                         │
              GET /return ──► paypal.js: authorize order ──► FUNDS_HELD
                         │
Seller ──► POST /deliver ──► auditor.js (Claude): per-item verdicts
                         │        │
                         │        ▼
                         │   mandate.js: score = weighted pass share (code, not LLM)
                         ▼
              paypal.js: capture(delta = total*score - already released)
                         │
              POST /close ──► paypal.js: void remaining authorization
```

Files: `server.js` (routes + state machine), `paypal.js`, `mandate.js`, `auditor.js`, `db.js`, `public/index.html` (ledger UI), `test.js`.

Mandate states: `CREATED` → `FUNDED` → `PARTIAL` → `RELEASED`, or `CLOSED`.

See [API.md](API.md) for the endpoints.

## Known limitations (honest notes)

- **Disputes.** The PayPal sandbox does not give a complete dispute flow for this use case. The current build holds, partially captures and voids with real PayPal calls. Opening a formal PayPal dispute is not implemented; the evidence is kept in the audit trail so it could be attached.
- **Authorization window.** PayPal authorizations have a limited honor period, so mandates must be sized within it (PayPal's current limits should be checked in its docs). Longer jobs need re-authorization.
- **Evidence is submitted as text.** Automated probes (fetching a live URL, running tests, carrier tracking lookups) are the next step; the auditor interface already accepts any evidence string.
- **Storage** is a JSON file for easy setup. Use a real database in production.
- **Auth.** There are no user accounts yet; anyone with the URL can act. Do not deploy this publicly with real funds.
- **Webhooks.** The webhook route logs events but does not verify PayPal signatures yet.

## Roadmap

- Evidence probes: live URL checks, test-runner results, shipping tracking
- Seller payouts through PayPal Payouts
- Buyer and seller reputation ledger
- Human review button for contested scores
- MCP tool so any AI agent can open a mandate

## License

MIT, see [LICENSE](LICENSE).
