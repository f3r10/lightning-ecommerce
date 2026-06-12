"use client";

import { useEffect, useState } from "react";
import type { CreateInvoiceRequest, InvoiceResponse } from "@lightning-ecommerce/core";
import { useInvoice } from "../hooks/useInvoice.js";
import { usePaymentStatus } from "../hooks/usePaymentStatus.js";
import { CopyButton } from "./CopyButton.js";
import { ExpiryCountdown } from "./ExpiryCountdown.js";
import { QRCode } from "./QRCode.js";

type CheckoutState = "idle" | "loading" | "awaiting" | "succeeded" | "error";

export interface LightningCheckoutProps {
  /** Invoice description shown in the payer's wallet. Required. */
  description: string;
  /** Called once the payment is confirmed. */
  onSuccess: (invoice: InvoiceResponse) => void;
  /** Fixed payment amount in millisatoshis. Omit together with variableAmount. */
  amount_msat?: number;
  /** Set to true to create a variable-amount invoice. */
  variableAmount?: boolean;
  /** Called if invoice creation fails or the invoice expires unpaid. */
  onError?: (error: string) => void;
  /** Invoice lifetime in seconds. Defaults to 3600. */
  expiry_secs?: number;
  /** Your internal order / product reference. */
  product_id?: string;
  /** Label for the "Pay" button. Defaults to "Pay X sat" or "Pay with Lightning". */
  buttonLabel?: string;
  /** Applied to the outermost element for custom styling. */
  className?: string;
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "12px",
    padding: "24px",
    fontFamily: "sans-serif",
  },
  button: {
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
    borderRadius: "8px",
    border: "none",
    background: "#f7931a",
    color: "#fff",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  walletLink: {
    padding: "10px 20px",
    fontSize: "14px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    textDecoration: "none",
    color: "inherit",
  },
  successText: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#22c55e",
    margin: 0,
  },
  errorText: {
    fontSize: "14px",
    color: "red",
    margin: 0,
    textAlign: "center" as const,
  },
} as const;

export function LightningCheckout({
  description,
  onSuccess,
  amount_msat,
  variableAmount = false,
  onError,
  expiry_secs,
  product_id,
  buttonLabel,
  className,
}: LightningCheckoutProps) {
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");

  const { invoice, createInvoice, error: invoiceError, reset } = useInvoice();

  // Transition from loading once useInvoice settles.
  useEffect(() => {
    if (checkoutState !== "loading") return;
    if (invoice !== null) {
      setCheckoutState("awaiting");
    } else if (invoiceError !== null) {
      setCheckoutState("error");
      onError?.(invoiceError);
    }
  }, [invoice, invoiceError, checkoutState, onError]);

  usePaymentStatus(
    checkoutState === "awaiting" ? (invoice?.payment_hash ?? null) : null,
    {
      onSuccess: (inv) => {
        setCheckoutState("succeeded");
        onSuccess(inv);
      },
      onExpired: () => {
        setCheckoutState("error");
        onError?.("Invoice expired before payment was received.");
      },
    },
  );

  const handlePay = () => {
    setCheckoutState("loading");
    const options: CreateInvoiceRequest = {
      description,
      ...(!variableAmount && amount_msat !== undefined ? { amount_msat } : {}),
      ...(expiry_secs !== undefined ? { expiry_secs } : {}),
      ...(product_id !== undefined ? { product_id } : {}),
    };
    void createInvoice(options);
  };

  const handleReset = () => {
    reset();
    setCheckoutState("idle");
  };

  const defaultButtonLabel =
    buttonLabel ??
    (amount_msat != null
      ? `Pay ${(amount_msat / 1000).toLocaleString()} sat`
      : "Pay with Lightning");

  if (checkoutState === "idle" || checkoutState === "loading") {
    const isLoading = checkoutState === "loading";
    return (
      <div className={className} style={styles.container}>
        <button
          type="button"
          onClick={handlePay}
          disabled={isLoading}
          style={
            isLoading
              ? { ...styles.button, ...styles.buttonDisabled }
              : styles.button
          }
        >
          {isLoading ? "Generating invoice…" : defaultButtonLabel}
        </button>
      </div>
    );
  }

  if (checkoutState === "awaiting" && invoice) {
    return (
      <div className={className} style={styles.container}>
        <QRCode value={invoice.bolt11} size={240} />
        <div style={styles.actions}>
          <CopyButton text={invoice.bolt11} />
          <a
            href={`lightning:${invoice.bolt11}`}
            style={styles.walletLink}
            rel="noopener noreferrer"
          >
            Open in wallet
          </a>
        </div>
        <ExpiryCountdown expiryUnix={invoice.expiry_unix} />
      </div>
    );
  }

  if (checkoutState === "succeeded") {
    return (
      <div className={className} style={styles.container}>
        <p style={styles.successText}>Payment received</p>
      </div>
    );
  }

  // error state
  return (
    <div className={className} style={styles.container}>
      <p style={styles.errorText}>
        {invoiceError ?? "Payment failed or the invoice expired."}
      </p>
      <button type="button" onClick={handleReset} style={styles.button}>
        Try again
      </button>
    </div>
  );
}
