import { parseErrorResponse } from "./errors.js";
import type {
  CloseChannelsResponse,
  CreateInvoiceRequest,
  InvoiceResponse,
  NodeInfoResponse,
  NodeServiceConfig,
} from "./types.js";

function baseUrl(config: NodeServiceConfig): string {
  return config.url.replace(/\/$/, "");
}

function authHeaders(config: NodeServiceConfig): HeadersInit {
  return {
    "Authorization": `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Create a BOLT11 invoice via the node-service LSPS2 JIT channel mechanism.
 *
 * For a first-time payment (no existing LSP channel), `amount_msat` must be at
 * least 12,000,000 (12,000 sat) to ensure the LSP can open a viable JIT anchor
 * channel. Subsequent payments through an existing channel have no minimum.
 * node-service enforces this and returns 422 if the amount is too low.
 */
export async function createInvoice(
  options: CreateInvoiceRequest,
  config: NodeServiceConfig,
): Promise<InvoiceResponse> {
  const res = await fetch(`${baseUrl(config)}/api/invoice`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify(options),
  });

  if (!res.ok) throw await parseErrorResponse(res);
  return res.json() as Promise<InvoiceResponse>;
}

/**
 * Retrieve the current status of an invoice by its payment hash.
 * Poll this until `status` is `"succeeded"` or the invoice has expired.
 */
export async function getInvoice(
  paymentHash: string,
  config: NodeServiceConfig,
): Promise<InvoiceResponse> {
  const res = await fetch(`${baseUrl(config)}/api/invoice/${paymentHash}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) throw await parseErrorResponse(res);
  return res.json() as Promise<InvoiceResponse>;
}

/**
 * Return the current state of the LDK node: channels, balances, LSP connection.
 */
export async function getNodeInfo(
  config: NodeServiceConfig,
): Promise<NodeInfoResponse> {
  const res = await fetch(`${baseUrl(config)}/api/node/info`, {
    method: "GET",
    headers: authHeaders(config),
  });

  if (!res.ok) throw await parseErrorResponse(res);
  return res.json() as Promise<NodeInfoResponse>;
}

/**
 * Cooperatively close all open Lightning channels.
 * Use this to recover the LSP's over-provisioned on-chain funds when the
 * LSP balance runs low. Funds settle on-chain after ~2 blocks.
 */
export async function closeChannels(
  config: NodeServiceConfig,
): Promise<CloseChannelsResponse> {
  const res = await fetch(`${baseUrl(config)}/admin/close-channels`, {
    method: "POST",
    headers: authHeaders(config),
  });

  if (!res.ok) throw await parseErrorResponse(res);
  return res.json() as Promise<CloseChannelsResponse>;
}
