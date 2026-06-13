import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export function writeFileSafe(absPath: string, content: string): void {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf8");
}

/**
 * Append Lightning env vars to the target file.
 * Returns false (and does nothing) if either key already exists in the file.
 */
export function appendEnvVars(
  envPath: string,
  nodeUrl: string,
  apiKey: string,
): boolean {
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (
    existing.includes("LIGHTNING_NODE_URL") ||
    existing.includes("LIGHTNING_API_KEY")
  ) {
    return false;
  }
  const block = `\n# lightning-ecommerce\nLIGHTNING_NODE_URL=${nodeUrl}\nLIGHTNING_API_KEY=${apiKey}\n`;
  appendFileSync(envPath, block, "utf8");
  return true;
}

/** Content for the Next.js App Router route handler. */
export function routeHandlerContent(): string {
  return `export { GET, POST } from "@lightning-ecommerce/nextjs/server/route";\n`;
}
