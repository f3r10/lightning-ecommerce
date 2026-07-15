# nextjs-unlock example

A minimal Next.js app that gates content behind a Lightning Network payment. The user sees a blurred preview with a lock overlay; paying the invoice (20 000 sat) reveals the secret content.

This example uses the `@lightning-ecommerce/nextjs` package for the full checkout UI and the server-side proxy that forwards requests to a running `node-service` instance.

---

## What it demonstrates

- `LightningCheckout` drop-in component (QR code, copy button, expiry countdown)
- `onSuccess` callback to unlock UI state after payment confirmation
- JIT channel UX: when the LSP opens a new channel to `node-service` on the first payment, the widget shows "⚡ Opening Lightning channel…" instead of a blank wait
- Next.js App Router proxy route that keeps the `LIGHTNING_API_KEY` server-side

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Rust (stable) | 2024 edition | [rustup.rs](https://rustup.rs) |
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| pnpm | ≥ 9 | `npm install -g pnpm` |

---

## Local dev setup

### 1. Build the monorepo packages

From the repo root:

```bash
pnpm install
pnpm -r build
```

### 2. Start `lsp-service`

```bash
cargo run -p lsp-service
```

Wait until you see:

```
LSP ready. Configure node-service .env with:
  LSP_NODE_ID=03...
  LSP_ADDRESS=127.0.0.1:9737
```

Copy those two values — you need them in the next step.

### 3. Configure and start `node-service`

Create (or edit) `.env` in the repo root:

```dotenv
LSP_NODE_ID=<paste from lsp-service output>
LSP_ADDRESS=127.0.0.1:9737
LSP_TOKEN=
ADMIN_API_KEY=test123
PORT=3001
```

Then:

```bash
cargo run -p node-service
```

Wait for `node-service listening on 0.0.0.0:3001`.

### 4. Configure the example app

```bash
cp examples/nextjs-unlock/.env.local.example examples/nextjs-unlock/.env.local
```

The defaults match the setup above (`LIGHTNING_NODE_URL=http://localhost:3001`, `LIGHTNING_API_KEY=test123`). Edit if you used different values.

### 5. Install and run

```bash
cd examples/nextjs-unlock
pnpm install   # if not already done by the root install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Testing the payment flow

The repo includes `payer-cli`, a local LDK node that can pay invoices on the same `lsp-service` network without needing a public IP or an external wallet.

1. Click **Pay 20 000 sat** in the browser — a BOLT11 invoice appears
2. Copy the invoice string
3. In a new terminal:

```bash
cargo run -p payer-cli -- <paste-invoice-here>
```

4. The browser polls every 2 seconds. When the payment confirms the locked content is revealed.

> **First payment note:** if `node-service` has no existing channel, the LSP opens a JIT channel before forwarding the HTLC. The widget shows "⚡ Opening Lightning channel…" during this step, which can take up to ~30 seconds.

---

## Resetting state

If channels end up in a broken state (stale HTLCs, repeated force-closes), wipe the LDK databases and restart:

```bash
# stop all three services first
rm data/ldk/ldk_node_data.sqlite   # node-service channel state
rm data/lsp/ldk_node_data.sqlite   # lsp-service channel state
rm data/payer/ldk_node_data.sqlite # payer-cli channel state
```

The `node.seed.enc` / `seed` files are kept so on-chain wallets recover their balance after the next sync.

---

## Project structure

```
examples/nextjs-unlock/
├── app/
│   ├── api/lightning/[...route]/
│   │   └── route.ts   # server-side proxy — forwards to node-service
│   └── page.tsx       # pay-to-unlock UI
├── .env.local.example
└── package.json
```

The proxy route (`route.ts`) is a single re-export:

```ts
export { GET, POST } from "@lightning-ecommerce/nextjs/server/route";
```

It reads `LIGHTNING_NODE_URL` and `LIGHTNING_API_KEY` at request time and forwards calls to `node-service`, keeping the API key out of the browser.
