import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useInvoice } from "../hooks/useInvoice.js";

const INVOICE = {
  payment_hash: "a".repeat(64),
  bolt11: "lntbs200u1ptest",
  amount_msat: 20_000_000,
  expiry_unix: 9_999_999_999,
  status: "pending" as const,
};

const server = setupServer(
  http.post("/api/lightning/invoice", () =>
    HttpResponse.json(INVOICE, { status: 201 }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("useInvoice", () => {
  it("starts with null invoice, not loading, no error", () => {
    const { result } = renderHook(() => useInvoice());
    expect(result.current.invoice).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("does not call the API on mount", () => {
    let called = false;
    server.use(
      http.post("/api/lightning/invoice", () => {
        called = true;
        return HttpResponse.json(INVOICE, { status: 201 });
      }),
    );

    renderHook(() => useInvoice());
    expect(called).toBe(false);
  });

  it("sets isLoading to true while the request is in-flight", async () => {
    let resolveRequest!: () => void;
    server.use(
      http.post("/api/lightning/invoice", () =>
        new Promise<Response>((resolve) => {
          resolveRequest = () => resolve(HttpResponse.json(INVOICE, { status: 201 }) as unknown as Response);
        }),
      ),
    );

    const { result } = renderHook(() => useInvoice());

    act(() => {
      void result.current.createInvoice({ description: "test" });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(true));

    await act(async () => { resolveRequest(); });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("stores the invoice after successful createInvoice()", async () => {
    const { result } = renderHook(() => useInvoice());

    await act(async () => {
      await result.current.createInvoice({
        amount_msat: 20_000_000,
        description: "Order #1",
      });
    });

    expect(result.current.invoice).toEqual(INVOICE);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error and clears invoice on non-2xx response", async () => {
    server.use(
      http.post("/api/lightning/invoice", () =>
        HttpResponse.json(
          { error: "amount_msat must be at least 12000000 (12000 sat)" },
          { status: 422 },
        ),
      ),
    );

    const { result } = renderHook(() => useInvoice());

    await act(async () => {
      await result.current.createInvoice({ amount_msat: 100, description: "too small" });
    });

    expect(result.current.invoice).toBeNull();
    expect(result.current.error).toMatch("12000");
    expect(result.current.isLoading).toBe(false);
  });

  it("sets error on network failure", async () => {
    server.use(
      http.post("/api/lightning/invoice", () => HttpResponse.error()),
    );

    const { result } = renderHook(() => useInvoice());

    await act(async () => {
      await result.current.createInvoice({ description: "network fail" });
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.isLoading).toBe(false);
  });

  it("reset() clears invoice, error, and isLoading", async () => {
    const { result } = renderHook(() => useInvoice());

    await act(async () => {
      await result.current.createInvoice({ description: "Order #1" });
    });
    expect(result.current.invoice).not.toBeNull();

    act(() => { result.current.reset(); });

    expect(result.current.invoice).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
