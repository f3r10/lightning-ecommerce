export interface CreateInvoiceRequest {
  /** Payment amount in millisatoshis. Omit for a variable-amount invoice. */
  amount_msat?: number;
  /** Invoice description shown in the payer's wallet. Required. */
  description: string;
  /** Invoice lifetime in seconds. Defaults to 3600. */
  expiry_secs?: number;
  /** Your internal order / product reference. Stored in the database. */
  product_id?: string;
  /** Maximum LSP opening fee you are willing to pay, in millisatoshis. */
  max_lsp_fee_msat?: number;
}

export interface InvoiceResponse {
  /** 64-char hex payment hash. Use this to poll for payment status. */
  payment_hash: string;
  /** Full BOLT11 invoice string. Present this (or a QR code of it) to the payer. */
  bolt11: string;
  /** Amount in millisatoshis. null for variable-amount invoices. */
  amount_msat: number | null;
  /** Unix timestamp (seconds) when the invoice expires. */
  expiry_unix: number;
  /** Current payment status. */
  status: "pending" | "succeeded";
}

export interface NodeInfoResponse {
  /** Compressed public key of the LDK node, hex-encoded. */
  node_id: string;
  /** Configured network, e.g. "Signet" or "Mainnet". */
  network: string;
  /** Number of open Lightning channels. */
  num_channels: number;
  /** Whether the LSP peer is currently connected. */
  lsp_connected: boolean;
  /** Spendable on-chain balance in satoshis. */
  onchain_balance_sats: number;
  /** A fresh bech32 on-chain address for funding the node. */
  onchain_address: string;
}

export interface CloseChannelsResponse {
  /** Total number of channels found. */
  total: number;
  /** Number of channels successfully closed. */
  closed: number;
  /** Per-channel error strings for any channels that failed to close. */
  errors: string[];
}

export interface NodeServiceConfig {
  /**
   * Base URL of the running node-service instance.
   * Example: "https://payments.mystore.com"
   * Do not include a trailing slash.
   */
  url: string;
  /**
   * Value of the ADMIN_API_KEY environment variable set in node-service.
   * Used as a Bearer token on protected endpoints.
   * Never expose this in client-side code.
   */
  apiKey: string;
}
