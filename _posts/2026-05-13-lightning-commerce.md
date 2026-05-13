---
layout: post
title: "Lightning Commerce: Self-Sovereign Bitcoin Payments for Everyone — No Channels Required"
date: 2026-05-13
categories: [bitcoin, lightning, open-source]
tags: [ldk-node, lsps2, jit-channels, self-hosting, rust]
---

You finish building your product. Maybe it's an indie game, a digital art collection, a paid API, or a small physical-goods store. You believe in Bitcoin. You know your potential customers hold sats and want to spend them. So you search for how to accept Lightning payments non-custodially — and you hit a wall.

Not a hard wall. A confusing, bureaucratic, capital-intensive wall that appears *before you have earned a single satoshi*. You need **inbound liquidity**. That means channels. Channels mean either locking up capital, coordinating with peers you don't know, or paying a service to open a channel to you — all before your first customer has tried to pay.

Most people stop here. Not because they don't want to use Lightning. Because the cost of admission arrived before any revenue did.

**Lightning Commerce is built specifically to eliminate that moment.**

---

## The Wall That Stops Merchant Adoption

Accepting Lightning payments non-custodially requires four things:

1. Run and maintain a Lightning node
2. **Acquire inbound liquidity before receiving a single payment**
3. Keep the node online 24/7
4. Figure out how to get funds back out to cold storage

Steps 1, 3, and 4 are hard, but they are learnable infrastructure problems. Step 2 is different. It is a *capital problem that precedes revenue*. No other payment processor in the world makes you spend money before you can receive money. You don't pre-fund a Stripe account. You don't buy inbound capacity before your first Shopify sale. But Lightning — at least the self-sovereign, non-custodial version — has historically required exactly this.

The result is a predictable pattern: developers and creators attempt self-hosted Lightning commerce, discover step 2, and abandon it. They either fall back to custodial processors (surrendering control of their funds and their customers' payment data) or skip Lightning altogether.

This is not a niche problem. There are hundreds of thousands of independent developers, content creators, game makers, and small merchants who already believe in Bitcoin, already have customers willing to pay in sats, and have no viable path to non-custodial Lightning commerce today.

---

## What Already Exists — and Where It Falls Short

The Lightning ecosystem has made tremendous progress. Several projects address pieces of this problem:

| Project | Type | What It Does Well | The Gap |
|---------|------|-------------------|---------|
| [BTCPay Server](https://github.com/btcpayserver/btcpayserver) | Self-hosted, non-custodial | Comprehensive, battle-tested, full-featured | Still requires the merchant to solve inbound liquidity; designed before LSPS2 existed |
| [LNbits](https://github.com/lnbits/lnbits) | Self-hosted, flexible | Extensible, lightweight, active ecosystem | Custodial by default; same liquidity problem applies when running your own underlying node |
| Strike / OpenNode | Hosted, custodial | Simple setup, no infrastructure knowledge needed | Surrenders custody and payment data; no self-sovereignty |
| [Breez SDK](https://github.com/breez/breez-sdk) | Mobile-focused library | Excellent LSPS2 integration for mobile wallets | Designed for end-user apps, not server-side merchant commerce flows |
| Hosted nodes (Voltage, etc.) | Managed node as a service | Reduces operational burden | Inbound liquidity still the merchant's problem; ongoing cost without solving the core issue |

BTCPay Server deserves particular respect: it is excellent, widely used, and has done more for non-custodial Lightning commerce than any other project. But it was designed before the [LSPS2 JIT channel standard](https://github.com/BitcoinAndLightningLayerSpecs/lsp) existed, targets technically sophisticated operators, and is genuinely complex to configure correctly. Lightning Commerce is not competing with BTCPay — it targets a different audience entirely: the long tail of non-technical merchants and creators who need something closer to "deploy and receive" than "configure and administer."

The gap Lightning Commerce fills is specific: **a minimal, self-sovereign, self-hosted commerce toolkit where the inbound liquidity problem is solved automatically, by design, on the very first payment.**

---

## The Solution: Lightning Commerce

Lightning Commerce consists of two components that work together:

### node-service

A lightweight Rust HTTP server built on [ldk-node](https://github.com/lightningdevkit/ldk-node), the high-level Lightning node library from the Lightning Dev Kit team. It runs in a single Docker container on any cheap VPS, [Fly.io](https://fly.io) instance, or [Railway](https://railway.app) deployment.

The node-service exposes a simple REST API:

- `POST /api/invoice` — create a JIT invoice backed by LSPS2
- `GET /api/invoice/:hash` — check payment status
- `GET /api/node/info` — node health and channel info
- `GET /health` — liveness probe

That's it. No routing configuration, no graph syncing, no liquidity management dashboard. The complexity lives inside ldk-node and the LSPS2 protocol — invisible to the merchant.

### storefront

A Next.js template deployable to Vercel with a single button click. It connects to the node-service API to generate Lightning invoices, display QR codes, and confirm payments in real time. The product catalog is a JSON file the merchant edits directly — no database required for v1.

The full setup is: `docker compose up`, copy your mnemonic, deploy to Vercel. **A merchant with no prior Lightning experience can be ready to accept payments in under 30 minutes.**

---

## The Secret Weapon: LSPS2 JIT Channels

The primitive that makes this possible is [LSPS2](https://github.com/lightning/blips/blob/master/blip-0052.md) (also known as bLIP-52, or "Just-in-Time channels"). It is an open standard that defines how a Lightning Service Provider (LSP) can automatically open a channel to a node *at the moment the first payment arrives* — with the channel opening fee deducted from that payment.

Here is what happens when a new Lightning Commerce merchant receives their very first payment:

```
Customer wallet ──pays──► LSP
                              │
                LSP detects merchant has no inbound capacity
                              │
                LSP opens channel to merchant node (JIT)
                              │
                Payment forwarded through new channel
                              │
                Channel fee deducted from payment amount
                              │
                              ▼
                    Merchant node receives payment
                    Channel is now open for future payments
```

From the merchant's perspective: they created an invoice, a customer scanned it, and funds arrived. The channel opening happened automatically, in the background, funded by the LSP. **The merchant never bought liquidity. The merchant's first customer's payment was also the moment their node became fully operational.**

This is the same protocol that powers [Phoenix wallet](https://phoenix.acinq.co/) — one of the most user-friendly Lightning wallets available — where users receive their first payment without any channel setup. LSPS2 has been validated at scale in that mobile context. Lightning Commerce brings it to the server-side merchant context.

The technical integration uses ldk-node's `receive_payment_via_jit_channel` and `receive_variable_amount_via_jit_channel`, backed by the [lightning-liquidity](https://github.com/lightningdevkit/lightning-liquidity) crate that implements the LSPS2 client protocol.

---

## Getting Funds Out: Two Payout Paths

A common concern with any Lightning node is: how do you get your sats into cold storage? Lightning Commerce supports two paths, neither of which requires closing channels:

**Lightning payout**: The merchant provides a BOLT11 invoice from their primary wallet (hardware wallet app, Phoenix, etc.) and the node pays it directly. Instant, cheap, no on-chain transaction.

**On-chain sweep**: For merchants who want to move funds to a Bitcoin address without touching Lightning at all, Lightning Commerce integrates submarine swaps — an atomic exchange of Lightning sats for on-chain bitcoin. Using an open-source swap service like [Boltz](https://github.com/BoltzExchange/boltz-client), the node pays a Lightning invoice and receives bitcoin at the specified address, with no channel closing required.

Both paths give merchants a self-sovereign route from "payment received" to "cold storage" without requiring any understanding of channel mechanics.

---

## No Vendor Lock-In: The LSPS Open Standard

One of the most important design decisions in Lightning Commerce is what it does *not* do: it does not hardcode a specific LSP.

Because LSPS2 is an open standard, any LSPS2-compatible LSP can serve as the channel provider. Current options include:

- [ACINQ](https://acinq.co/) (the LSP behind Phoenix wallet)
- [Olympus by Zeus](https://zeusln.com/)
- [Voltage LSP](https://voltage.cloud/)
- Any future LSPS2-compatible provider

Switching between them is a single environment variable change. This is the open, competitive LSP marketplace the LSPS standards are explicitly designed to create — where LSPs compete on fee rates, reliability, and terms, and merchants are never locked into a single provider's pricing or availability.

---

## The Road Ahead

### The Always-On Requirement — and How It Will Disappear

There is one honest infrastructure constraint in Lightning Commerce today: the node-service must be always-on. A continuously running Docker container is required for the node to detect incoming payments and manage channel state.

This is a real operational requirement, but it is likely a *temporary* one.

Two features currently in active development within the Lightning Dev Kit will change this fundamentally:

**Async payments**: When complete, a merchant's LSP will be able to hold incoming HTLCs while the node is offline, then wake the node via a webhook notification (LSPS5 / bLIP-55) to claim the payment. The node only needs to be online briefly — to claim what the LSP is already holding. No payment is lost during downtime.

**Trampoline payments**: Trampoline routing improves payment reliability for lightweight nodes with limited routing graph knowledge. A trampoline node (typically the LSP) handles pathfinding on behalf of the lightweight node, reducing the computational and storage burden of running a routing-capable node significantly.

Combined with LSPS5 webhook notifications, these features open the path toward a truly serverless merchant node — one that wakes on demand to claim payments rather than running continuously. Lightning Commerce is designed to integrate both as they land in ldk-node. The always-on server is a current constraint, not a permanent design choice.

### AI Agents, L402, and Machine-to-Machine Commerce

Looking further ahead: the [L402 protocol](https://docs.lightning.engineering/the-lightning-network/l402) (HTTP 402 + Lightning invoices + macaroon credentials) enables HTTP clients — including AI agents — to autonomously pay for and receive resources without human interaction. An agent encounters a `402 Payment Required` response, pays the attached Lightning invoice, and immediately receives the purchased resource.

Because Lightning Commerce already manages a ldk-node with full invoice creation and payment detection, adding L402 support is a thin middleware layer: the node-service issues a macaroon tied to a product and price, returns a `402` with the invoice, and on retry verifies the preimage as the bearer credential.

Projects like [Fewsats](https://fewsats.com) are building the buyer side of this equation — enabling AI agents to autonomously purchase goods and services over Lightning. Lightning Commerce is the complementary merchant side: a non-custodial, self-sovereign, Bitcoin-native commerce node that any LSPS2-compatible LSP can serve and any L402-capable agent can buy from. Independent, composable, and built on open standards.

---

## Get Involved

Lightning Commerce is open-source under the MIT license. The project is in active development, and this is the stage where early contributors have the most impact.

- **Star and watch the repository** to follow progress as the node-service and storefront come together
- **Open issues** if you spot gaps in the design, have experience with LSPS2 integration, or want to discuss the architecture
- **Contribute** if you work with ldk-node, Rust, Next.js, or Lightning infrastructure — there is meaningful work to do at every layer of the stack
- **Connect** on [X/Twitter](https://x.com/LedesmaNando) if you want to discuss the project directly

The long tail of independent creators and merchants who want to accept Bitcoin non-custodially is enormous. The tooling to serve them hasn't existed — until now.
