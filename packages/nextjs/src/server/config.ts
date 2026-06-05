import "server-only";
import type { NodeServiceConfig } from "@lightning-ecommerce/core";

/**
 * Read node-service connection details from server-side environment variables.
 *
 * Required env vars (set these in your Vercel project settings):
 *   LIGHTNING_NODE_URL  — base URL of your running node-service, e.g. https://pay.mystore.com
 *   LIGHTNING_API_KEY   — value of ADMIN_API_KEY in node-service .env (never expose client-side)
 *
 * Throws if either variable is missing so misconfiguration surfaces immediately
 * rather than producing a confusing 401 or network error.
 */
export function getServerConfig(): NodeServiceConfig {
  const url = process.env["LIGHTNING_NODE_URL"];
  const apiKey = process.env["LIGHTNING_API_KEY"];

  if (!url || !apiKey) {
    const missing = [
      !url && "LIGHTNING_NODE_URL",
      !apiKey && "LIGHTNING_API_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `lightning-ecommerce: missing required environment variable(s): ${missing}. ` +
        "Set them in your Vercel project settings or .env.local file.",
    );
  }

  return { url, apiKey };
}
