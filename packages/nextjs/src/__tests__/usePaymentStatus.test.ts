import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { usePaymentStatus } from "../hooks/usePaymentStatus.js";

const HASH = "b".repeat(64);

const PENDING_INVOICE = {
  payment_hash: HASH,
  bolt11: "lntbs200u1ptest",
  amount_msat: 20_000_000,
  expiry_unix: 9_999_999_999,
  status: "pending" as const,
};

const SUCCEEDED_INVOICE = { ...PENDING_INVOICE, status: "succeeded" as const };
const EXPIRED_INVOICE = { ...PENDING_INVOICE, expiry_unix: 1 }; // always in the past

const server = setupServer(
  http.get(`/api/lightning/invoice/${HASH}`, () =>
    HttpResponse.json(PENDING_INVOICE),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Short interval used only in tests that need to observe multiple polls.
const SHORT_INTERVAL = 50;

describe("usePaymentStatus", () => {
  it("returns null status and not polling when hash is null", () => {
    const { result } = renderHook(() => usePaymentStatus(null));
    expect(result.current.status).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });

  it("returns null status and not polling when disabled=true", () => {
    const { result } = renderHook(() =>
      usePaymentStatus(HASH, { disabled: true }),
    );
    expect(result.current.status).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });

  it("starts polling immediately when hash is provided", async () => {
    const { result } = renderHook(() => usePaymentStatus(HASH));

    await waitFor(() => expect(result.current.status).toBe("pending"));
    expect(result.current.isPolling).toBe(true);
  });

  it("calls onSuccess and stops polling when status is succeeded", async () => {
    server.use(
      http.get(`/api/lightning/invoice/${HASH}`, () =>
        HttpResponse.json(SUCCEEDED_INVOICE),
      ),
    );

    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      usePaymentStatus(HASH, { onSuccess }),
    );

    await waitFor(() => expect(result.current.status).toBe("succeeded"));
    expect(result.current.isPolling).toBe(false);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledWith(SUCCEEDED_INVOICE);
  });

  it("calls onExpired and stops polling when expiry_unix is in the past", async () => {
    server.use(
      http.get(`/api/lightning/invoice/${HASH}`, () =>
        HttpResponse.json(EXPIRED_INVOICE),
      ),
    );

    const onExpired = vi.fn();
    const { result } = renderHook(() =>
      usePaymentStatus(HASH, { onExpired }),
    );

    await waitFor(() => expect(result.current.status).toBe("expired"));
    expect(result.current.isPolling).toBe(false);
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("stops polling on unmount and makes no further requests", async () => {
    let callCount = 0;
    server.use(
      http.get(`/api/lightning/invoice/${HASH}`, () => {
        callCount++;
        return HttpResponse.json(PENDING_INVOICE);
      }),
    );

    const { unmount } = renderHook(() =>
      usePaymentStatus(HASH, { pollInterval: SHORT_INTERVAL }),
    );

    // Wait for the first poll to land.
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(1));
    const countAtUnmount = callCount;

    unmount();

    // Wait longer than two poll intervals — the count must not increase.
    await new Promise<void>((r) => setTimeout(r, SHORT_INTERVAL * 3));
    expect(callCount).toBe(countAtUnmount);
  });

  it("sets error on non-2xx response", async () => {
    server.use(
      http.get(`/api/lightning/invoice/${HASH}`, () =>
        HttpResponse.json({ error: "invoice not found" }, { status: 404 }),
      ),
    );

    const { result } = renderHook(() => usePaymentStatus(HASH));

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it("polls again after the interval elapses", async () => {
    let callCount = 0;
    server.use(
      http.get(`/api/lightning/invoice/${HASH}`, () => {
        callCount++;
        return HttpResponse.json(PENDING_INVOICE);
      }),
    );

    renderHook(() => usePaymentStatus(HASH, { pollInterval: SHORT_INTERVAL }));

    // The interval fires multiple times — verify at least 2 polls complete.
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(2));
  });
});
