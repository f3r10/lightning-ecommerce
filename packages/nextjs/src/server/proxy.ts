import "server-only";
import {
  createInvoice,
  getInvoice,
  NodeServiceError,
} from "@lightning-ecommerce/core";
import type { CreateInvoiceRequest, NodeServiceConfig } from "@lightning-ecommerce/core";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(err: unknown): Response {
  if (err instanceof NodeServiceError) {
    return json({ error: err.body }, err.status);
  }
  if (err instanceof Error) {
    return json({ error: err.message }, 500);
  }
  return json({ error: "Internal server error" }, 500);
}

export async function proxyInvoiceCreate(request: Request): Promise<Response> {
  let config: NodeServiceConfig;
  try {
    config = (await import("./config.js")).getServerConfig();
  } catch (err) {
    return errorResponse(err);
  }

  let body: CreateInvoiceRequest;
  try {
    body = (await request.json()) as CreateInvoiceRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const invoice = await createInvoice(body, config);
    return json(invoice, 201);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function proxyInvoiceGet(paymentHash: string): Promise<Response> {
  let config: NodeServiceConfig;
  try {
    config = (await import("./config.js")).getServerConfig();
  } catch (err) {
    return errorResponse(err);
  }

  try {
    const invoice = await getInvoice(paymentHash, config);
    return json(invoice);
  } catch (err) {
    return errorResponse(err);
  }
}
