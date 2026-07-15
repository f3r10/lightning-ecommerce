# Lightning Ecommerce

A self-custodial Lightning Network payment backend built on [ldk-node](https://github.com/lightningdevkit/ldk-node). It allows a merchant to receive Lightning payments **without any on-chain Bitcoin and without managing channels manually**. The first inbound payment triggers the LSP to open a Just-In-Time (JIT) channel automatically via the [LSPS2](https://github.com/BitcoinAndLightningLayerSpecs/lsp/blob/main/LSPS2/README.md) protocol.

## How it works

```
  Payer (any LN wallet)
         │
         │  BOLT11 invoice
         ▼
   [ lsp-service ]  ← intercepts the HTLC, opens a 0-conf anchor channel
         │             to node-service funded with the payment itself
         │  forwards HTLC
         ▼
  [ node-service ]  ← receives the payment, marks invoice as paid in SQLite
```

1. A merchant calls `POST /api/invoice` to create a BOLT11 invoice.
2. A customer pays that invoice from any Lightning wallet.
3. The LSP intercepts the HTLC, opens a JIT anchor channel to `node-service`, and forwards the payment through it.
4. `node-service` settles the payment and marks the order as `succeeded` in its database.
5. The merchant polls `GET /api/invoice/:hash` to confirm payment.

**The merchant never needs to hold on-chain Bitcoin or think about channels.**

---

## Repository structure

```
lightning-ecommerce/
├── lsp-service/        Local LSPS2 Lightning Service Provider (test only)
├── node-service/       Merchant payment backend (HTTP API + LDK node)
├── payer-cli/          Test tool that simulates a Lightning payer
├── packages/
│   ├── core/           @lightning-ecommerce/core — node-service HTTP client + types
│   ├── nextjs/         @lightning-ecommerce/nextjs — Next.js route handler, hooks, UI
│   └── create/         @lightning-ecommerce/create — CLI scaffold tool (npx)
├── data/
│   ├── lsp/            lsp-service data dir (SQLite, seed, logs)
│   ├── ldk/            node-service data dir (SQLite, seed, logs)
│   └── payer/          payer-cli data dir (SQLite, seed)
└── .env                node-service configuration
```

> **Note:** `lsp-service` is a local test LSP. In production you would point `node-service` at a public LSPS2-compatible LSP (e.g. [Olympus by ZEUS](https://zeusln.com), [Voltage Flow](https://voltage.cloud)) and never run `lsp-service` yourself.

---

## Prerequisites

### Rust services (`node-service`, `lsp-service`, `payer-cli`)

- **Rust** (stable, 2024 edition) — install via [rustup](https://rustup.rs)
- **sqlite3** CLI — used to inspect and reset database state

### npm packages (`packages/`)

- **Node.js** ≥ 18 — install via [nodejs.org](https://nodejs.org) or [nvm](https://github.com/nvm-sh/nvm)
- **pnpm** ≥ 9 — `npm install -g pnpm`

---

## Build

### Rust services

```bash
git clone https://github.com/f3r10/lightning-ecommerce
cd lightning-ecommerce
cargo build
```

This builds all three crates. All dependencies, including `ldk-node`, are fetched automatically from the upstream repositories — no local clones required.

### npm packages

```bash
pnpm install
pnpm -r build
```

This installs dependencies and builds all three packages (`core`, `nextjs`, `create`) under `packages/`. The Rust and npm workspaces are independent — you only need to build the npm packages if you are working on the Vercel integration.

---

## npm packages

The `packages/` directory contains three npm packages that make it easy to accept Lightning payments from a Next.js app. They communicate with a running `node-service` instance over HTTP and keep the API key server-side.

| Package | npm name | Purpose |
|---|---|---|
| `packages/core` | `@lightning-ecommerce/core` | Type-safe HTTP client and TypeScript types for node-service |
| `packages/nextjs` | `@lightning-ecommerce/nextjs` | Next.js App Router proxy handler, React hooks, and drop-in checkout UI |
| `packages/create` | `@lightning-ecommerce/create` | One-time scaffold CLI (`npx`) |

### Quick start — scaffold into an existing Next.js project

Inside your Next.js project directory:

```bash
npx @lightning-ecommerce/create@latest
```

The CLI will:
1. Detect App Router layout and TypeScript settings automatically
2. Prompt for your `node-service` URL and API key
3. Write `app/api/lightning/route.ts` (the server-side proxy)
4. Append `LIGHTNING_NODE_URL` and `LIGHTNING_API_KEY` to `.env.local`
5. Run `npm install @lightning-ecommerce/nextjs` (or pnpm/yarn/bun — whichever lock file it finds)

### Manual setup

```bash
npm install @lightning-ecommerce/nextjs
```

**1. Create the API route** (`app/api/lightning/route.ts`):

```typescript
export { GET, POST } from "@lightning-ecommerce/nextjs/server/route";
```

**2. Set environment variables** (`.env.local`):

```dotenv
LIGHTNING_NODE_URL=http://localhost:3001   # your node-service URL
LIGHTNING_API_KEY=test123                  # your ADMIN_API_KEY
```

**3. Add the checkout widget** to any client page:

```tsx
"use client";
import { LightningCheckout } from "@lightning-ecommerce/nextjs";

export default function CheckoutPage() {
  return (
    <LightningCheckout
      description="Order #42"
      amount_msat={20_000_000}
      onSuccess={(invoice) => console.log("Paid!", invoice.payment_hash)}
    />
  );
}
```

`LightningCheckout` manages the full payment flow: idle → invoice creation → QR code display with copy button and expiry countdown → payment confirmation → success or error state.

### API reference — `@lightning-ecommerce/nextjs`

**Client** (`import { ... } from "@lightning-ecommerce/nextjs"`):

| Export | Kind | Description |
|---|---|---|
| `LightningCheckout` | Component | Drop-in checkout widget |
| `useInvoice` | Hook | Create and track a BOLT11 invoice |
| `usePaymentStatus` | Hook | Poll an invoice hash for payment confirmation |

**Server** (`import { ... } from "@lightning-ecommerce/nextjs/server"`):

| Export | Kind | Description |
|---|---|---|
| `proxyInvoiceCreate` | Function | Proxy a `POST /api/lightning/invoice` request to node-service |
| `proxyInvoiceGet` | Function | Proxy a `GET /api/lightning/invoice/:hash` request to node-service |
| `getServerConfig` | Function | Read and validate `LIGHTNING_NODE_URL` / `LIGHTNING_API_KEY` from env |

**Route handler** (`import { ... } from "@lightning-ecommerce/nextjs/server/route"`):

| Export | Kind | Description |
|---|---|---|
| `GET` | Next.js handler | Routes `GET /api/lightning/invoice/:hash` to the proxy |
| `POST` | Next.js handler | Routes `POST /api/lightning/invoice` to the proxy |

### Running the test suite

```bash
pnpm -r test
```

Runs vitest across all three packages (65 tests total: 12 core client tests, 16 route handler and hook tests, 10 component tests, 31 scaffold CLI utility tests).

---

## Step 1 — Start lsp-service

`lsp-service` is a minimal LSPS2 Lightning node that opens JIT channels to `node-service`. It needs on-chain funds to fund those channels.

### First run

```bash
cargo run -p lsp-service
```

On the very first run a BIP-39 mnemonic is printed. **Save it.** The seed is stored in `data/lsp/seed`.

The node will sync to the chain and then print its on-chain address:

```
LSP node ID : 03253208...
LSP address : 127.0.0.1:9737
Onchain address: tb1q...
Waiting for sync...
Onchain balance: 0 sats

Needs funding to open JIT channels.
Send >=25,000 sats to the address above from https://faucet.mutinynet.com/
Then restart lsp-service.
```

### Fund the LSP

1. Copy the on-chain address printed above.
2. Go to **https://faucet.mutinynet.com/** and send at least **25,000 sats** to that address.
3. Wait for the transaction to confirm (mutinynet produces blocks every ~30 seconds).
4. Re-run `cargo run -p lsp-service`.

Once funded, the LSP prints its connection details and stays running:

```
Onchain balance: 25000 sats

LSP ready. Configure node-service .env with:
  LSP_NODE_ID=03253208ea59217373367375e40f7a1719188667f659e0a121bed50d2155f85a52
  LSP_ADDRESS=127.0.0.1:9737
  LSP_TOKEN=
```

**Leave `lsp-service` running in its terminal for the rest of the test.**

---

## Step 2 — Configure node-service

Copy the `.env` template and fill in the values printed by `lsp-service`:

```bash
cp .env .env.local   # optional — .env is already tracked and pre-filled for local testing
```

The `.env` file in the repo root:

```dotenv
# Network — "mutinynet" is treated as Signet internally
NETWORK=mutinynet
ESPLORA_URL=https://mutinynet.com/api

# Paste the values printed by lsp-service
LSP_NODE_ID=03253208ea59217373367375e40f7a1719188667f659e0a121bed50d2155f85a52
LSP_ADDRESS=127.0.0.1:9737
LSP_TOKEN=

# Where LDK persists channel state, SQLite database, and logs
STORAGE_DIR=./data/ldk

# HTTP port
PORT=3001

# Protects the admin endpoints (POST /api/invoice, GET /api/node/info)
ADMIN_API_KEY=test123

# Optional: encrypt the node seed on disk with this passphrase
MNEMONIC_ENCRYPT_KEY=
```

`node-service` reads this file automatically on startup via `dotenvy`.

---

## Step 3 — Start node-service

```bash
cargo run -p node-service
```

On the very first run a BIP-39 mnemonic is printed. **Save it.** The encrypted seed is stored at `data/ldk/node.seed.enc`.

The service syncs to the chain, connects to the LSP, and starts the HTTP API:

```
YOUR NODE MNEMONIC — SAVE THIS NOW
  1. word
  ...
Node started. ID: 03214c...
Waiting for initial sync...
Sync complete.
No existing LSP channel — will open JIT on first payment.
Listening on port 3001
```

**`node-service` requires zero on-chain funds.** The LSP opens channels on its behalf.

---

## Step 4 — Create an invoice

```bash
curl -s -X POST http://localhost:3001/api/invoice \
  -H "Authorization: Bearer test123" \
  -H "Content-Type: application/json" \
  -d '{"amount_msat": 20000000, "description": "test payment"}'
```

Response:

```json
{
  "payment_hash": "7a951b...",
  "bolt11": "lntbs200u1p4...",
  "amount_msat": 20000000,
  "expiry_unix": 1779926142,
  "status": "pending"
}
```

Copy the `bolt11` value — you will pay this in the next step.

> **First-payment minimum:** The first payment to a fresh `node-service` must be large enough for the LSP to open a viable JIT channel. See [Known limitations](#known-limitations) below.

---

## Step 5 — Pay the invoice with payer-cli

`payer-cli` is a test tool that acts as a simple Lightning payer. It runs its own LDK node, opens a channel to `lsp-service`, and sends the payment.

### First run — get the funding address

`payer-cli` needs a funded channel to have outbound Lightning liquidity. On its first run it will not have a channel yet. Run it once with a placeholder invoice to print its on-chain address:

```bash
cargo run -p payer-cli -- dummy
```

Output:

```
Payer node ID: 027dc4...
Connected to local lsp-service
Waiting for fresh sync...
On-chain balance: 0 sats

No channel and insufficient funds.
Fund this address with >=950,000 sats from https://faucet.mutinynet.com/
Address: tb1qqy3...
```

### Fund the payer

1. Copy the address printed above.
2. Go to **https://faucet.mutinynet.com/** and send at least **950,000 sats** to that address.
3. Wait for the transaction to confirm (~30 seconds on mutinynet).

> **Why 950,000 sats?** `payer-cli` opens a **900,000-sat channel** to `lsp-service` so it has enough outbound capacity to send payments. The extra 50,000 sats cover the on-chain transaction fee for the channel funding transaction. The channel stays open across restarts — you only need to do this once.
>
> This is only necessary for the **test payer**. Real users pay with their existing Lightning wallets (Phoenix, Breez, etc.) which already have funded channels. On mainnet, your customers never need to touch on-chain Bitcoin.

### First payment — opens a channel automatically

Run `payer-cli` with the `bolt11` from Step 4:

```bash
cargo run -p payer-cli -- lntbs200u1p4...
```

Output (first payment):

```
On-chain balance: 951368 sats
Opening 900,000 sat channel to local lsp-service...
Waiting for channel ready (~30s on mutinynet)...
Channel ready: ...
Paying invoice...
Payment submitted, ID: 7a951b...
Payment successful! Hash: 7a951b...
```

What happens behind the scenes on this first payment:

1. The payer sends the HTLC toward `lsp-service`.
2. `lsp-service` intercepts it (no route to `node-service` exists yet).
3. `lsp-service` opens a **0-conf anchor JIT channel** to `node-service` funded with the payment amount.
4. `lsp-service` forwards the HTLC through the new channel.
5. `node-service` settles the HTLC and marks the order paid.

### Subsequent payments

Once a channel exists between `lsp-service` and `node-service`, subsequent payments route through it. **Any amount works** — even amounts smaller than the first-payment minimum:

```bash
cargo run -p payer-cli -- lntbs50u...
# On-chain balance: 251368 sats
# Using existing channel — outbound capacity: 890340 sats
# Payment successful!
```

---

## Step 6 — Verify payment status

```bash
curl -s http://localhost:3001/api/invoice/7a951b0eaf4161448f491d2b898047b1599f617940d95882dcb094a0dd415533
```

```json
{
  "payment_hash": "7a951b...",
  "bolt11": "lntbs200u...",
  "amount_msat": 20000000,
  "expiry_unix": 1779926142,
  "status": "succeeded"
}
```

---

## API reference

All endpoints are available at `http://localhost:3001`.

### `GET /health` — public

```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

### `POST /api/invoice` — protected

Creates a BOLT11 invoice via the LSPS2 JIT channel mechanism.

**Header:** `Authorization: Bearer <ADMIN_API_KEY>`

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `amount_msat` | integer | No | Payment amount in millisatoshis. Omit for a variable-amount invoice. |
| `description` | string | Yes | Invoice description (shown in the payer's wallet). |
| `expiry_secs` | integer | No | Invoice lifetime in seconds. Defaults to 3600 (1 hour). |
| `product_id` | string | No | Your internal order / product reference. Stored in the database. |
| `max_lsp_fee_msat` | integer | No | Maximum opening fee you are willing to pay the LSP. Omit to accept the LSP's advertised fee. |

**Example — fixed amount:**

```bash
curl -s -X POST http://localhost:3001/api/invoice \
  -H "Authorization: Bearer test123" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_msat": 20000000,
    "description": "Order #42",
    "product_id": "order-42"
  }'
```

**Example — variable amount (any amount invoice):**

```bash
curl -s -X POST http://localhost:3001/api/invoice \
  -H "Authorization: Bearer test123" \
  -H "Content-Type: application/json" \
  -d '{"description": "Donation"}'
```

**Response:**

```json
{
  "payment_hash": "abc123...",
  "bolt11": "lntbs...",
  "amount_msat": 20000000,
  "expiry_unix": 1779926142,
  "status": "pending"
}
```

### `GET /api/invoice/:hash` — public

Retrieves the status of an invoice by its payment hash.

```bash
curl http://localhost:3001/api/invoice/<payment_hash>
```

**Status values:** `pending`, `succeeded`.

### `GET /api/node/info` — protected

Returns the LDK node's current state.

```bash
curl -H "Authorization: Bearer test123" http://localhost:3001/api/node/info
```

```json
{
  "node_id": "03214c...",
  "network": "Signet",
  "num_channels": 1,
  "lsp_connected": true,
  "onchain_balance_sats": 0,
  "onchain_address": "tb1q..."
}
```

### `POST /admin/close-channels` — protected

Cooperatively closes all open Lightning channels. Use this to recover the LSP's on-chain funds when `lsp-service` runs low.

```bash
curl -X POST http://localhost:3001/admin/close-channels \
  -H "Authorization: Bearer test123"
```

```json
{ "total": 3, "closed": 3, "errors": [] }
```

After ~2 blocks (~4 minutes on mutinynet) the closed channel funds appear in each node's on-chain wallet.

---

## Data persistence

All state survives process restarts.

| Path | Contents |
|---|---|
| `data/ldk/node.seed.enc` | node-service BIP-39 seed (encrypted with `MNEMONIC_ENCRYPT_KEY` if set) |
| `data/ldk/ldk_node_data.sqlite` | LDK channel state, payments, peer data |
| `data/ldk/app.sqlite` | Orders database |
| `data/ldk/ldk_node.log` | node-service LDK log (DEBUG level) |
| `data/lsp/seed` | lsp-service seed (plaintext bytes) |
| `data/lsp/ldk_node_data.sqlite` | LSP channel state |
| `data/lsp/ldk_node.log` | lsp-service LDK log (TRACE level) |
| `data/payer/seed` | payer-cli seed |
| `data/payer/ldk_node_data.sqlite` | payer-cli channel state |

---

## Resetting state

After a failed payment attempt LSPS2 negotiation state can get stuck. Clear it before retrying:

```bash
sqlite3 data/lsp/ldk_node_data.sqlite \
  "DELETE FROM ldk_node_data WHERE primary_namespace = 'lightning_liquidity_state';"

sqlite3 data/ldk/ldk_node_data.sqlite \
  "DELETE FROM ldk_node_data WHERE primary_namespace = 'lightning_liquidity_state';"
```

To start completely fresh (loses all channel and payment history):

```bash
rm -rf data/lsp data/ldk data/payer
```

---

## Known limitations

### First-payment minimum amount

When `node-service` has no existing channel with the LSP, the first payment must be large enough for the LSP to open a viable JIT anchor channel. The minimum is fee-rate-dependent:

```
min_payment ≈ (fee_rate_sat/vbyte × 250 + 1,660) / 0.2475
```

| Network fee rate | Approximate minimum |
|---|---|
| 1 sat/vbyte | ~6,700 sat |
| 5 sat/vbyte | ~10,400 sat |
| 10 sat/vbyte | ~16,800 sat |
| 20 sat/vbyte | ~26,900 sat |

The overhead comes from three components that LDK deducts from the LSP's outbound capacity after a 0-conf channel opens:
- **Anchor outputs** — 2 × 330 sat locked in the commitment transaction outputs
- **Commitment transaction fee** — scales with the current on-chain fee rate
- **Channel reserve** — LDK enforces a hard minimum of 1,000 sat that the LSP must keep locked

This `node-service` enforces a static guard (`MIN_INVOICE_AMOUNT_MSAT`) to reject invoices that would likely fail. The guard is set conservatively to cover typical fee rates on mutinynet.

**Once a channel exists, any payment amount works.** Subsequent payments route through the existing channel without opening a new one, so the overhead does not apply.

This is a known limitation of ldk-node's LSPS2 implementation. A proper fix involves inflating the JIT channel size to absorb the anchor overhead, and accepting the channel with zero reserve (`ZeroConfZeroReserve`). These improvements are tracked upstream.

### LSP on-chain funds

`lsp-service` uses its on-chain wallet to fund each JIT channel. Each payment depletes the on-chain balance. When the balance runs low, close existing channels to recover the over-provisioned amounts:

```bash
curl -X POST http://localhost:3001/admin/close-channels \
  -H "Authorization: Bearer test123"
```

Then wait ~4 minutes for the funds to settle on-chain before sending more payments.

---

## Production differences

In a production deployment you do **not** run `lsp-service` at all. Instead, point `node-service` at a public LSPS2-capable LSP:

```dotenv
NETWORK=mainnet
ESPLORA_URL=https://blockstream.info/api   # or your own Esplora
LSP_NODE_ID=<public_lsp_node_id>
LSP_ADDRESS=<public_lsp_host>:<port>
LSP_TOKEN=<token_if_required>
```

`payer-cli` also becomes irrelevant — your customers pay with their own Lightning wallets. The merchant's `node-service` still requires **zero on-chain funds** on mainnet; the LSPS2 JIT mechanism is identical.

The only production consideration is choosing an LSP. Public LSPS2-compatible options on mainnet include:

- **Olympus by ZEUS** — `032ae843e4d7d177f151d021ac8044b0636ec72b1ce3ffcde5c04748db2517ab03`
- **Voltage Flow** — see https://voltage.cloud for connection details

Check their documentation for the correct `LSP_ADDRESS` and whether a `LSP_TOKEN` is required.
