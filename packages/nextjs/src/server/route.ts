import "server-only";
import { proxyInvoiceCreate, proxyInvoiceGet } from "./proxy.js";

/**
 * Next.js App Router catch-all route handler.
 *
 * Drop this into your Next.js project at:
 *   app/api/lightning/[...route]/route.ts
 *
 * Contents of that file:
 *   export { GET, POST } from '@lightning-ecommerce/nextjs/server/route'
 *
 * Then set two environment variables (Vercel dashboard or .env.local):
 *   LIGHTNING_NODE_URL   https://your-node-service.com
 *   LIGHTNING_API_KEY    your-admin-api-key
 *
 * Routes exposed to the browser (no API key required on the client):
 *   POST /api/lightning/invoice          → create a BOLT11 invoice
 *   GET  /api/lightning/invoice/:hash    → poll payment status
 */

function notFound(): Response {
  return new Response(JSON.stringify({ error: "not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

// Match /invoice at the end of the path (invoice creation).
const INVOICE_CREATE_RE = /\/invoice\/?$/;

// Match /invoice/:hash at the end of the path (status polling).
// Payment hashes are 64-char hex strings.
const INVOICE_GET_RE = /\/invoice\/([a-f0-9]{64})\/?$/i;

export async function POST(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (INVOICE_CREATE_RE.test(pathname)) {
    return proxyInvoiceCreate(request);
  }

  return notFound();
}

export async function GET(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const match = INVOICE_GET_RE.exec(pathname);

  if (match?.[1]) {
    return proxyInvoiceGet(match[1]);
  }

  return notFound();
}
