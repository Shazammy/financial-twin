# Financial Twin

**Samen staan we sterker.** Every customer gets a financial twin that contacts them proactively. The twin spots your chances alone, and together.

Built at the Tectonic Hackathon 2026 for the KBC challenge: understand what customers need and respond at the right moment, for 2.3 million customers.

## What it does

Every customer gets a **financial twin**: a profile of their goals, life stage, cash flow and holdings. The twin does two things:

1. **Advises.** Signals (transactions, market news, location) go through rules that only produce a message when there is a concrete euro gain. Messages are ranked by what the customer gains, capped at two per scan, and every message explains why it was sent. News is information, never "buy" or "sell".
2. **Pools.** Twins find other customers to gain with, anonymously:
   - **Group purchase:** neighbours with the same goal (heat pump) get a volume discount and a green-loan rate.
   - **Saver × borrower:** savers earn more than on a savings account, borrowers pay less than on a classic loan. KBC stays in the middle and carries the credit risk.

Messages arrive in a WhatsApp-style chat from your twin. Only tips and alerts are sent there; invoices and offers open in KBC Mobile.

## Run it

Requires Node 22+ and yarn 1.

```bash
cp api/.env.example api/.env   # then set DEMO_PIN to a PIN of your choice
yarn setup                     # installs api, web and root dependencies
yarn dev                       # api on :4100, web on http://localhost:5173
```

Log in as one of the synthetic customers with your `DEMO_PIN`.

### Your twin is live (the proactive part)

After login your twin is live: it reacts to a feed of incoming signals for all customers, one every 5 seconds, and messages arrive without any clicks. In the demo this feed is simulated (`api/src/signal-feed.ts`); in production the twin listens to KBC's live event streams (transactions, market news, national register notices, app events). **Your twin's decisions** shows every decision for the logged-in customer:

- **SEND**: the message and its € impact, and the channel it went out on
- **HOLD**: why the twin stayed quiet: below €50/year, no consent, daily limit of 6 messages, or the 30-day quiet period after a death in the family
- **OBSERVE**: what the twin saw, e.g. how many twins the news index matched

### Life events

| Event | Signal the twin sees | What the twin does |
|---|---|---|
| Looking for a car | Car loan simulator used in KBC Mobile (never browsing on other sites) | Pool car loan rate plus a car insurance quote |
| New baby | Child benefit (Groeipakket) payments, baby store purchases | Hospitalisation insurance reminder and a savings plan |
| Moving house | Payment to a notary, address change via itsme | Home insurance must cover the new address |
| Death in the family | Death notice via the national register | Practical help in KBC Mobile, not WhatsApp, an advisor call, and **all offers paused for 30 days** |

### Manual control room

The same signals can be fired by hand:

| Button | What happens |
|---|---|
| Scan transactions | Idle cash and unused subscriptions, ranked by € gain |
| News: ASML −8% | Fans out through a ticker index over 20,000 anonymous twins; only holders get a message |
| Salary +15% | Suggests saving half the raise, shows the value after 10 years |
| Location: Barcelona airport | Card-abroad tip and travel insurance check |
| Find people to pool with | Group purchase and saver × borrower pools; when both sides of a pool join, both get **Match found** |

Turn off a consent switch and the matching signals are skipped. Marie has community matching off, so she gets no pools.

Optional: set `GEMINI_API_KEY` in `api/.env` to let Gemini rewrite messages in the twin's voice. Rules decide what is sent; the LLM only writes it. Without a key the templates are used.

## Deploy (Render, free)

`render.yaml` describes one free web service: it builds the web app and the API serves it. Create it from the repo as a Render Blueprint and fill in `DEMO_PIN` (and optionally `GEMINI_API_KEY`). The free plan sleeps when idle, so the first visit can take up to a minute.

## How it scales to 2.3 million customers

- Events fan out through indexes (news about ASML reaches only twins holding ASML); nobody is polled.
- Rules decide who gets a message; the LLM is only used for wording.
- Matching runs between anonymous twins; customers only see a count until everyone opts in.

## Security

- Session tokens are random 256-bit values, PINs are salted scrypt hashes with a lockout after 5 failed attempts.
- Every `/api/me/*` route takes the customer from the session, never from the URL or body (no IDOR).
- Deals can only be joined by customers they were offered to.
- The signal control room only exists when `DEMO_MODE=true`.
- No secrets in the repo; `.env` is gitignored.

## Structure

- `api/`: Koa + TypeScript. `data.ts` (synthetic customers and twin population), `engine.ts` (signals and rules), `community.ts` (pools), `auth.ts`, `writer.ts` (optional Gemini)
- `web/`: Vite + React + TypeScript. Twin card, consent switches, live decisions, demo signal buttons and the twin chat

## Unfinished

- All data is synthetic and kept in memory; a restart resets it.
- Rates and deal terms are illustrative, not real KBC products.
- No real WhatsApp delivery; the chat is simulated in the web app.
- Investment club (third pool type) is a vision only.
- KBC's Museo Sans font is not included (licensed to KBC); the app falls back to Helvetica/Arial.
