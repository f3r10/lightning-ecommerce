// @lightning-ecommerce/core
// Typed HTTP client for the node-service REST API.

export { createInvoice, getInvoice, getNodeInfo, closeChannels } from "./client.js";
export { NodeServiceError } from "./errors.js";
export type {
  CreateInvoiceRequest,
  InvoiceResponse,
  NodeInfoResponse,
  CloseChannelsResponse,
  NodeServiceConfig,
} from "./types.js";
