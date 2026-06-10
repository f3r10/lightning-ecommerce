"use client";

import { useCallback, useState } from "react";
import type { CreateInvoiceRequest, InvoiceResponse } from "@lightning-ecommerce/core";

export interface UseInvoiceResult {
  invoice: InvoiceResponse | null;
  createInvoice: (options: CreateInvoiceRequest) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

/**
 * Create a Lightning invoice and track its creation state.
 *
 * Does NOT create an invoice on mount — only when `createInvoice()` is called.
 * Calls POST /api/lightning/invoice (the Next.js proxy route from this package).
 *
 * @example
 * const { invoice, createInvoice, isLoading, error } = useInvoice();
 *
 * await createInvoice({ amount_msat: 20_000_000, description: "Order #42" });
 * // invoice is now set — show its bolt11 as a QR code
 */
export function useInvoice(): UseInvoiceResult {
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createInvoice = useCallback(async (options: CreateInvoiceRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/lightning/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });

      const data = (await res.json()) as InvoiceResponse & { error?: string };

      if (!res.ok) {
        setError(data.error ?? `Request failed with status ${res.status}`);
        return;
      }

      setInvoice(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setInvoice(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { invoice, createInvoice, isLoading, error, reset };
}
