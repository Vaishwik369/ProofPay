# Submission checklist: PayPal AI Hackathon

Deadline: **Nov 13, 2026, 1:30am GMT+5:30** (that is Nov 12, 8:00pm UTC). Aim to submit by **Nov 10**.
Official rules are the final authority: read them on the Rules tab before submitting.

## A. Setup (this week)
- [ ] Join the hackathon on Devpost (click "Join hackathon"; verify email)
- [ ] Create a PayPal Developer account and a Sandbox app (Client ID and Secret)
- [ ] Create two sandbox accounts: a Business (seller) and a Personal (buyer)
- [ ] Get an Anthropic API key (or another AI provider key)
- [ ] Create a **public** GitHub repo; add the MIT LICENSE so it shows in the repo's About section

## B. Build (weeks 1-3)
- [ ] Real sandbox flow works: create order (AUTHORIZE) > buyer approves > authorize > partial capture > final capture
- [ ] Void flow works
- [ ] AI auditor runs with a real API key (no mock)
- [ ] Commit regularly; commit history proves progress during the hackathon period
- [ ] Optional sponsor fits (only if they truly improve the product): Render hosting, AG Grid ledger table, APIMatic SDK, Postman collection, Channel3 product search

## C. Required submission items
- [ ] **Project** that meaningfully uses PayPal and AI
- [ ] **Text description**: features and functionality (draft below)
- [ ] **Functional demo**: README run instructions (done) and/or a hosted URL (recommended: Render)
- [ ] **Tools used**: PayPal APIs and the AI model, and how each is used (in README)
- [ ] **Public repo** with all source, assets and instructions; open-source license visible in About
- [ ] **Demo video**: under 3:00, on YouTube, set to **Public**, link in the form
  - [ ] Shows the project actually running on the device it was built for
  - [ ] No third-party trademarks or copyrighted music

## D. Demo video plan (2:30)
| Time | Content |
|---|---|
| 0:00-0:20 | Problem: agents and freelancers get paid or cheated with no protection |
| 0:20-0:50 | Create a mandate with the checklist; fund it via PayPal sandbox; show funds held |
| 0:50-1:30 | Submit partial delivery; AI marks items pass/fail; money splits (e.g. $75 released, $25 held) |
| 1:30-2:00 | Seller fixes the gap; rest unlocks. Or close and show the void |
| 2:00-2:30 | Who it's for, why it matters, what's next |

Tips: record at 1080p, use the real sandbox (not mock), narrate clearly, keep the PayPal sandbox login visible only as long as needed.

## E. Final-week checks
- [ ] Fresh clone on a clean machine: `npm install`, `npm start`, full flow works from the README alone
- [ ] No secrets committed (`.env` is git-ignored; rotate any key that leaked)
- [ ] README has no placeholders left (`<this-repo-url>`)
- [ ] Hosted demo is up and tested logged out
- [ ] Video link opens while logged out
- [ ] Read the Official Rules on eligibility, team size, IP and whether one entry can win several prizes
- [ ] Submit on the Devpost project page, then re-open it and confirm status is **Submitted**, not Draft

## Text description (draft for the form)

**ProofPay: pay only when the work is proven done.**
AI agents and freelancers need a way to pay strangers safely. ProofPay holds funds with a PayPal authorization, then an AI auditor checks the delivery against a checklist both sides agreed to up front. Money is released in proportion to the verified score through PayPal partial captures; whatever is missing stays held until fixed or returns to the buyer. The score is calculated in code from weighted checklist items, so the AI can't be talked into overpaying, and evidence is treated as untrusted. Built with PayPal Orders and Payments APIs (sandbox) and Claude as the auditor.

## Things to confirm yourself
- Prize total shown on the page differs ($67,500 vs $69,750); check the rules for the exact figure.
- Which PayPal API behaviours (partial captures per authorization, honor period) apply in sandbox today; test and cite the docs.
