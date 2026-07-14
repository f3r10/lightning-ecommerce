"use client";

import { useState } from "react";
import type { InvoiceResponse } from "@lightning-ecommerce/nextjs";
import { LightningCheckout } from "@lightning-ecommerce/nextjs";

const AMOUNT_MSAT = 20_000_000; // 20,000 sat

function formatHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

function LockedCard() {
  return (
    <div
      style={{ position: "relative", borderRadius: "12px", overflow: "hidden" }}
    >
      {/* Blurred preview of the secret content */}
      <div
        style={{
          padding: "2rem",
          background: "#f3f4f6",
          filter: "blur(8px)",
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        <p style={{ fontSize: "1.1rem", margin: "0 0 0.75rem" }}>
          🎉 You did it — this is the secret content!
        </p>
        <p style={{ margin: "0 0 0.5rem" }}>
          "Stack sats and be patient. The rest takes care of itself."
        </p>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#6b7280" }}>
          Payment proof: a3f9b2c1…d84e7f90
        </p>
      </div>

      {/* Overlay with lock icon */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.65)",
          gap: "6px",
        }}
      >
        <span style={{ fontSize: "2.5rem", lineHeight: 1 }}>🔒</span>
        <span style={{ fontWeight: 600, color: "#374151" }}>
          Pay 20,000 sat to unlock
        </span>
      </div>
    </div>
  );
}

function UnlockedCard({
  invoice,
  paidAt,
}: {
  invoice: InvoiceResponse;
  paidAt: Date;
}) {
  return (
    <div
      style={{
        padding: "2rem",
        background: "#f0fdf4",
        borderRadius: "12px",
        border: "1px solid #86efac",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>✅</div>
      <h2
        style={{
          margin: "0 0 0.75rem",
          color: "#15803d",
          fontSize: "1.25rem",
        }}
      >
        Access granted!
      </h2>
      <p style={{ margin: "0 0 1.5rem", color: "#374151" }}>
        Your Lightning payment was confirmed. Here is your exclusive content:
      </p>

      <blockquote
        style={{
          margin: "0 0 1.5rem",
          padding: "1rem 1.25rem",
          background: "#fff",
          borderRadius: "8px",
          borderLeft: "4px solid #22c55e",
          textAlign: "left",
          fontStyle: "italic",
          color: "#111",
          fontSize: "1rem",
          lineHeight: 1.6,
        }}
      >
        "Stack sats and be patient. The rest takes care of itself."
      </blockquote>

      <div
        style={{
          fontSize: "0.8rem",
          color: "#6b7280",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
        }}
      >
        <span>
          Payment proof:{" "}
          <code style={{ fontFamily: "monospace" }}>
            {formatHash(invoice.payment_hash)}
          </code>
        </span>
        <span>Paid at: {paidAt.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [paid, setPaid] = useState<{
    invoice: InvoiceResponse;
    paidAt: Date;
  } | null>(null);

  return (
    <main
      style={{
        maxWidth: "480px",
        margin: "4rem auto",
        padding: "0 1.5rem",
      }}
    >
      <header style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            margin: "0 0 0.5rem",
          }}
        >
          ⚡ Pay to unlock
        </h1>
        <p style={{ color: "#6b7280", margin: 0, fontSize: "0.95rem" }}>
          A Lightning Network payment demo — pay 20,000 sat to reveal the secret.
        </p>
      </header>

      {paid === null ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          <LockedCard />
          <LightningCheckout
            description="Lightning unlock (20,000 sat)"
            amount_msat={AMOUNT_MSAT}
            onSuccess={(invoice) => setPaid({ invoice, paidAt: new Date() })}
          />
        </div>
      ) : (
        <UnlockedCard invoice={paid.invoice} paidAt={paid.paidAt} />
      )}
    </main>
  );
}
