import "server-only";

// Next.js App Router catch-all route handler.

//
// Usage (app/api/lightning/[...route]/route.ts):
//   export { GET, POST } from '@lightning-ecommerce/nextjs/server/route'

export async function GET(_request: Request): Promise<Response> {
  return new Response(JSON.stringify({ error: "not implemented" }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(_request: Request): Promise<Response> {
  return new Response(JSON.stringify({ error: "not implemented" }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
}
