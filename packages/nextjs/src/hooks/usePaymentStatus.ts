"use client";

import { useEffect, useRef, useState } from "react";
import type { InvoiceResponse } from "@lightning-ecommerce/core";

export type PaymentStatus = "pending" | "succeeded" | "expired" | null;

export interface UsePaymentStatusOptions {
  /** Called once when the payment is confirmed. */
  onSuccess?: (invoice: InvoiceResponse) => void;
  /** Called once when the invoice expiry_unix passes before payment. */
  onExpired?: () => void;
  /** How often to poll in milliseconds. Default: 2000. */
  pollInterval?: number;
  /** Set to true to pause polling without unmounting. */
  disabled?: boolean;
}

export interface UsePaymentStatusResult {
  status: PaymentStatus;
  isPolling: boolean;
  error: string | null;
}

/**
 * Poll GET /api/lightning/invoice/:hash until the payment succeeds or expires.
 *
 * Starts polling as soon as `paymentHash` is non-null and `disabled` is false.
 * Stops automatically on success, expiry, or unmount.
 *
 * Expiry is checked locally against `expiry_unix` — node-service only emits
 * "pending" and "succeeded", never "expired".
 *
 * @example
 * const { status } = usePaymentStatus(invoice?.payment_hash ?? null, {
 *   onSuccess: () => router.push("/thank-you"),
 * });
 */
export function usePaymentStatus(
  paymentHash: string | null,
  options: UsePaymentStatusOptions = {},
): UsePaymentStatusResult {
  const { pollInterval = 2000, disabled = false } = options;

  const [status, setStatus] = useState<PaymentStatus>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep callback refs stable so the interval closure always calls the latest version.
  const onSuccessRef = useRef(options.onSuccess);
  const onExpiredRef = useRef(options.onExpired);
  useEffect(() => {
    onSuccessRef.current = options.onSuccess;
    onExpiredRef.current = options.onExpired;
  });

  useEffect(() => {
    if (!paymentHash || disabled) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/lightning/invoice/${paymentHash}`);
        if (!active) return;

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? `Request failed with status ${res.status}`);
          return;
        }

        const invoice = (await res.json()) as InvoiceResponse;
        if (!active) return;

        // Check expiry locally — node-service never emits "expired" status.
        if (invoice.expiry_unix < Date.now() / 1000) {
          setStatus("expired");
          setIsPolling(false);
          clearInterval(intervalId);
          onExpiredRef.current?.();
          return;
        }

        setStatus(invoice.status);

        if (invoice.status === "succeeded") {
          setIsPolling(false);
          clearInterval(intervalId);
          onSuccessRef.current?.(invoice);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Network error");
      }
    };

    // Poll immediately on start, then on each interval tick.
    void poll();
    const intervalId = setInterval(() => { void poll(); }, pollInterval);

    return () => {
      active = false;
      clearInterval(intervalId);
      setIsPolling(false);
    };
  }, [paymentHash, disabled, pollInterval]);

  return { status, isPolling, error };
}
