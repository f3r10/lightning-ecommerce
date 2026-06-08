import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const NODE_URL = "http://localhost:3001";
const API_KEY = "test123";

const INVOICE = {
  payment_hash: "a".repeat(64),
  bolt11: "lntbs200u1ptest",
  amount_msat: 20_000_000,
  expiry_unix: 9_999_999_999,
  status: "pending",
};

const server = setupServer(
  http.post(`${NODE_URL}/api/invoice`, () =>
    HttpResponse.json(INVOICE, { status: 201 }),
  ),
  http.get(`${NODE_URL}/api/invoice/:hash`, () =>
    HttpResponse.json({ ...INVOICE, status: "succeeded" }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("LIGHTNING_NODE_URL", NODE_URL);
  vi.stubEnv("LIGHTNING_API_KEY", API_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Lazy-import so env stubs are in place before the module reads process.env.
async function getHandler() {
  return import("../server/route.js");
}

// --- POST /api/lightning/invoice ---

describe("POST /invoice", () => {
  it("proxies invoice creation and returns 201", async () => {
    const { POST } = await getHandler();
    const req = new Request("http://app.com/api/lightning/invoice", {
      method: "POST",
      body: JSON.stringify({ amount_msat: 20_000_000, description: "Order #1" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json() as typeof INVOICE;
    expect(body.payment_hash).toBe(INVOICE.payment_hash);
    expect(body.status).toBe("pending");
  });

  it("returns 400 when body is not valid JSON", async () => {
    const { POST } = await getHandler();
    const req = new Request("http://app.com/api/lightning/invoice", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("forwards 422 from node-service when amount is below minimum", async () => {
    server.use(
      http.post(`${NODE_URL}/api/invoice`, () =>
        HttpResponse.json(
          { error: "amount_msat must be at least 12000000 (12000 sat)" },
          { status: 422 },
        ),
      ),
    );
    const { POST } = await getHandler();
    const req = new Request("http://app.com/api/lightning/invoice", {
      method: "POST",
      body: JSON.stringify({ amount_msat: 1_000, description: "too small" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch("12000");
  });

  it("returns 500 with message when env vars are missing", async () => {
    vi.unstubAllEnvs();
    const { POST } = await getHandler();
    const req = new Request("http://app.com/api/lightning/invoice", {
      method: "POST",
      body: JSON.stringify({ description: "test" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch("LIGHTNING_NODE_URL");
  });

  it("returns 404 for unknown POST paths", async () => {
    const { POST } = await getHandler();
    const req = new Request("http://app.com/api/lightning/unknown", {
      method: "POST",
      body: "{}",
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});

// --- GET /api/lightning/invoice/:hash ---

describe("GET /invoice/:hash", () => {
  it("proxies invoice status and returns 200", async () => {
    const { GET } = await getHandler();
    const req = new Request(
      `http://app.com/api/lightning/invoice/${"a".repeat(64)}`,
    );

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json() as typeof INVOICE;
    expect(body.status).toBe("succeeded");
  });

  it("forwards 404 from node-service for unknown hash", async () => {
    server.use(
      http.get(`${NODE_URL}/api/invoice/:hash`, () =>
        HttpResponse.json({ error: "invoice not found" }, { status: 404 }),
      ),
    );
    const { GET } = await getHandler();
    const req = new Request(
      `http://app.com/api/lightning/invoice/${"b".repeat(64)}`,
    );

    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns 404 for GET paths that are not /invoice/:hash", async () => {
    const { GET } = await getHandler();
    const req = new Request("http://app.com/api/lightning/unknown");

    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns 404 when hash is not 64 hex chars", async () => {
    const { GET } = await getHandler();
    const req = new Request("http://app.com/api/lightning/invoice/short");

    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});
