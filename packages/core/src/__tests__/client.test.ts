import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  closeChannels,
  createInvoice,
  getInvoice,
  getNodeInfo,
} from "../client.js";
import { NodeServiceError } from "../errors.js";
import type { NodeServiceConfig } from "../types.js";

const BASE_URL = "http://localhost:3001";
const config: NodeServiceConfig = { url: BASE_URL, apiKey: "test123" };

const INVOICE = {
  payment_hash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  bolt11: "lntbs200u1ptest",
  amount_msat: 20_000_000,
  expiry_unix: 9_999_999_999,
  status: "pending" as const,
};

const NODE_INFO = {
  node_id: "03abc",
  network: "Signet",
  num_channels: 1,
  lsp_connected: true,
  onchain_balance_sats: 0,
  onchain_address: "tb1qtest",
};

const server = setupServer(
  http.post(`${BASE_URL}/api/invoice`, () =>
    HttpResponse.json(INVOICE, { status: 201 }),
  ),
  http.get(`${BASE_URL}/api/invoice/:hash`, () =>
    HttpResponse.json({ ...INVOICE, status: "succeeded" }),
  ),
  http.get(`${BASE_URL}/api/node/info`, () =>
    HttpResponse.json(NODE_INFO),
  ),
  http.post(`${BASE_URL}/admin/close-channels`, () =>
    HttpResponse.json({ total: 1, closed: 1, errors: [] }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// --- createInvoice ---

describe("createInvoice", () => {
  it("returns an InvoiceResponse on success", async () => {
    const result = await createInvoice(
      { amount_msat: 20_000_000, description: "Order #1" },
      config,
    );
    expect(result.payment_hash).toBe(INVOICE.payment_hash);
    expect(result.bolt11).toBe(INVOICE.bolt11);
    expect(result.status).toBe("pending");
  });

  it("strips trailing slash from config url", async () => {
    const result = await createInvoice(
      { description: "Donation" },
      { ...config, url: `${BASE_URL}/` },
    );
    expect(result.payment_hash).toBeDefined();
  });

  it("throws NodeServiceError with status 401 on bad API key", async () => {
    server.use(
      http.post(`${BASE_URL}/api/invoice`, () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 }),
      ),
    );
    await expect(
      createInvoice({ description: "test" }, config),
    ).rejects.toBeInstanceOf(NodeServiceError);

    const err = await createInvoice({ description: "test" }, config).catch(
      (e: unknown) => e,
    );
    expect((err as NodeServiceError).status).toBe(401);
    expect((err as NodeServiceError).body).toBe("unauthorized");
  });

  it("throws NodeServiceError with status 422 when amount is below minimum", async () => {
    server.use(
      http.post(`${BASE_URL}/api/invoice`, () =>
        HttpResponse.json(
          { error: "amount_msat must be at least 12000000 (12000 sat)" },
          { status: 422 },
        ),
      ),
    );
    const err = await createInvoice(
      { amount_msat: 1_000, description: "too small" },
      config,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NodeServiceError);
    expect((err as NodeServiceError).status).toBe(422);
    expect((err as NodeServiceError).body).toMatch("12000");
  });
});

// --- getInvoice ---

describe("getInvoice", () => {
  it("returns the invoice with updated status", async () => {
    const result = await getInvoice(INVOICE.payment_hash, config);
    expect(result.status).toBe("succeeded");
    expect(result.payment_hash).toBe(INVOICE.payment_hash);
  });

  it("throws NodeServiceError with status 404 for unknown hash", async () => {
    server.use(
      http.get(`${BASE_URL}/api/invoice/:hash`, () =>
        HttpResponse.json({ error: "invoice not found" }, { status: 404 }),
      ),
    );
    const err = await getInvoice("unknown", config).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeServiceError);
    expect((err as NodeServiceError).status).toBe(404);
  });
});

// --- getNodeInfo ---

describe("getNodeInfo", () => {
  it("returns node status fields", async () => {
    const result = await getNodeInfo(config);
    expect(result.node_id).toBe("03abc");
    expect(result.lsp_connected).toBe(true);
    expect(result.num_channels).toBe(1);
  });

  it("throws NodeServiceError with status 401 on bad API key", async () => {
    server.use(
      http.get(`${BASE_URL}/api/node/info`, () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 }),
      ),
    );
    const err = await getNodeInfo(config).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeServiceError);
    expect((err as NodeServiceError).status).toBe(401);
  });
});

// --- closeChannels ---

describe("closeChannels", () => {
  it("returns close summary on success", async () => {
    const result = await closeChannels(config);
    expect(result.total).toBe(1);
    expect(result.closed).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("throws NodeServiceError with status 500 on node failure", async () => {
    server.use(
      http.post(`${BASE_URL}/admin/close-channels`, () =>
        HttpResponse.json({ error: "Internal server error" }, { status: 500 }),
      ),
    );
    const err = await closeChannels(config).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeServiceError);
    expect((err as NodeServiceError).status).toBe(500);
  });
});
