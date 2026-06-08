# ProxyPay Merchant

**WhatsApp merchant payment agent for Circle Arc Testnet**

ProxyPay Merchant lets informal businesses accept Arc USDC payments through WhatsApp. Merchants create invoices in plain language, customers approve payments in chat, and completed payments settle on Arc with real receipts.

---

## Why Arc / Circle

- **Arc Testnet** is an EVM-compatible chain that uses USDC as its native gas token — zero ETH friction.
- **Circle Developer-Controlled Wallets** let the backend manage wallets for each user without exposing private keys through WhatsApp.
- **No wallet apps, no browser extensions** — just WhatsApp.

---

## Features

- WhatsApp-native registration (no app to download)
- Arc wallet creation per user via Circle API
- User alias system (`@samrepair`, `@thalhat`)
- Merchant registration with business name, alias, and category
- Invoice creation from plain language
- Two-step payment confirmation (PAY → YES)
- **Real Arc Testnet USDC transactions** (never fake)
- Real transaction hash in receipt
- Merchant sales summary
- Customer transaction history
- Daily spending limits
- 10-minute payment approval timeout
- Duplicate payment protection
- Idempotency keys on all payments

---

## Architecture

```
WhatsApp
  → Twilio webhook (POST /webhook)
  → messageRouter.ts
  → intentParser.ts (OpenAI GPT-4o-mini)
  → Command handler
  → pendingActions.ts (PAY_INVOICE, expires 10 min)
  → Final customer confirmation (YES)
  → circle.ts or arc.ts (real payment execution)
  → Arc Testnet
  → transactions.ts (store real tx hash)
  → invoices.ts (mark paid only after real tx)
  → WhatsApp receipt to customer + merchant
```

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/phantomtee/adidos
cd adidos
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in all values in `.env`. See detailed setup below.

### 3. Supabase

1. Create a new Supabase project at https://supabase.com
2. Open the SQL editor
3. Run the full contents of `src/db/schema.sql`
4. Copy your project URL and service role key to `.env`

### 4. Twilio WhatsApp

1. Sign up at https://twilio.com
2. Enable the WhatsApp Sandbox (or WhatsApp Business API)
3. Note your Account SID, Auth Token, and sandbox number
4. Set these in `.env`
5. Configure the sandbox webhook URL to `https://your-ngrok.ngrok.io/webhook`

### 5. OpenAI

1. Get an API key from https://platform.openai.com
2. Set `OPENAI_API_KEY` in `.env`

### 6. Circle Developer-Controlled Wallets (preferred payment mode)

1. Create a Circle developer account at https://console.circle.com
2. Get an API key
3. Generate an entity secret (see Circle docs): `openssl rand -hex 32`
4. Register the entity secret in Circle console
5. Create a wallet set in Circle console → copy the Wallet Set ID
6. Find the USDC token ID for Arc Testnet in Circle's token list
7. Set all `CIRCLE_*` vars in `.env`

Fund test wallets using Circle's faucet: https://faucet.circle.com

### 7. Arc Testnet (ethers.js fallback mode)

Only needed if `PAYMENT_EXECUTION_MODE=ethers`.

- **RPC URL:** `https://rpc.testnet.arc.network`
- **Chain ID:** `5042002`
- **USDC Contract:** `0x3600000000000000000000000000000000000000`
- **Explorer:** https://testnet.arcscan.app
- **Faucet:** https://faucet.circle.com

Create a test wallet and set `SERVER_WALLET_PRIVATE_KEY` in `.env`.
**Never use a real wallet private key. This is for hackathon testing only.**

---

## Running locally

### Development (with live reload)

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

Server starts on port 3000 (or `PORT` env var).

### Expose to Twilio via ngrok

```bash
ngrok http 3000
```

Set the HTTPS URL as your Twilio webhook: `https://xxxx.ngrok.io/webhook`

---

## End-to-End Demo Script

Use two phones joined to your Twilio WhatsApp sandbox.

**Step 1 — Customer registers**
```
Customer → start
Bot: Welcome to ProxyPay Merchant!

Customer → set alias thalhat
Bot: Alias set: @thalhat
```

**Step 2 — Customer creates wallet**
```
Customer → create wallet
Bot: Wallet created! Address: 0x...
```

Fund the customer wallet at https://faucet.circle.com

**Step 3 — Merchant registers**
```
Merchant → start
Bot: Welcome to ProxyPay Merchant!

Merchant → set alias sam

Merchant → register merchant Sam Repair as @samrepair, category phone repair
Bot: Merchant registered!
     Business: Sam Repair
     Alias: @samrepair
     Category: phone repair
     Wallet: 0x...
```

**Step 4 — Merchant creates invoice**
```
Merchant → invoice @thalhat 1 dollar for phone repair test
Bot to merchant: Invoice created and sent to @thalhat.
Bot to customer: Invoice from @samrepair
                 Business: Sam Repair
                 Amount: 1.00 USDC
                 Memo: phone repair test
                 Reply PAY to approve or NO to reject.
```

**Step 5 — Customer approves**
```
Customer → PAY
Bot: Confirm payment:
     To: @samrepair
     Business: Sam Repair
     Wallet: 0x1234...abcd
     Amount: 1.00 USDC
     Memo: phone repair test
     Reply YES to send or NO to cancel.
```

**Step 6 — Customer confirms**
```
Customer → YES
Bot to customer: Paid.
                 1.00 USDC → @samrepair
                 Tx: 0x...real_tx_hash...
Bot to merchant: Payment received.
                 1.00 USDC from @thalhat
                 Tx: 0x...real_tx_hash...
```

**Step 7 — Merchant checks sales**
```
Merchant → sales today
Bot: Sales today
     Total received: 1.00 USDC
     Paid invoices: 1
     Recent:
     1. @thalhat — 1.00 USDC — phone repair test
```

---

## Security notes

- **No private keys in Supabase.** Circle entity secret and ethers private key live only in env vars.
- **No payment without explicit YES.** Two-step confirmation required.
- **Pending approvals expire after 10 minutes.** Stale confirmations are rejected.
- **Daily spending limit** enforced before every payment.
- **Balance check** before every payment execution.
- **Invoice idempotency** prevents double-payment on duplicate WhatsApp messages.
- **No fake transactions.** Invoice is marked paid only after a real tx hash is returned by Arc/Circle.
- Secrets are redacted from all logs.

---

## Known limitations

- `PAYMENT_EXECUTION_MODE=ethers` uses a shared server wallet — not production-ready. Use Circle wallets for production.
- Circle wallet funding requires manual action at the faucet for testnet.
- No multi-language UI (English only in MVP).
- No escrow — payment is final once confirmed.
- Twilio WhatsApp Sandbox requires each user to opt in manually.

---

## Future roadmap

- Customer agent that finds merchants and negotiates price
- Merchant auto-reply agents
- Escrow for service completion
- QR payment links
- Voice note support
- Local language support (Hausa, Yoruba, Igbo, Swahili)
- Circle Gateway / x402 for paid agent services
- Merchant analytics dashboard
- Reputation system from paid invoice history
- Production Circle wallet onboarding with KYC
- Real fiat off-ramp via Circle
