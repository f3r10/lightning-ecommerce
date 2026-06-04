export class NodeServiceError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    const message = `node-service responded with ${status}: ${body}`;
    super(message);
    this.name = "NodeServiceError";
    this.status = status;
    this.body = body;
  }
}

export async function parseErrorResponse(res: Response): Promise<NodeServiceError> {
  let body: string;
  try {
    const json = await res.json() as { error?: unknown };
    body = typeof json.error === "string" ? json.error : JSON.stringify(json);
  } catch {
    body = await res.text().catch(() => "(unreadable response body)");
  }
  return new NodeServiceError(res.status, body);
}
