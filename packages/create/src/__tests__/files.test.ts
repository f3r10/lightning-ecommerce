import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import os from "node:os";
import {
  appendEnvVars,
  routeHandlerContent,
  writeFileSafe,
} from "../utils/files.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "lightning-files-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── routeHandlerContent ───────────────────────────────────────────────────────

describe("routeHandlerContent", () => {
  it("re-exports GET and POST from the server route module", () => {
    const content = routeHandlerContent();
    expect(content).toContain("export { GET, POST }");
    expect(content).toContain("@lightning-ecommerce/nextjs/server/route");
  });
});

// ── writeFileSafe ─────────────────────────────────────────────────────────────

describe("writeFileSafe", () => {
  it("creates nested directories and writes the file", () => {
    const target = join(tmpDir, "app", "api", "lightning", "route.ts");
    writeFileSafe(target, "hello");
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("hello");
  });

  it("overwrites an existing file", () => {
    const target = join(tmpDir, "route.ts");
    writeFileSync(target, "old");
    writeFileSafe(target, "new");
    expect(readFileSync(target, "utf8")).toBe("new");
  });
});

// ── appendEnvVars ─────────────────────────────────────────────────────────────

describe("appendEnvVars", () => {
  it("creates .env.local and appends vars when file does not exist", () => {
    const envPath = join(tmpDir, ".env.local");
    const result = appendEnvVars(envPath, "https://node.example.com", "sk_test");
    expect(result).toBe(true);
    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("LIGHTNING_NODE_URL=https://node.example.com");
    expect(content).toContain("LIGHTNING_API_KEY=sk_test");
  });

  it("appends to an existing .env.local", () => {
    const envPath = join(tmpDir, ".env.local");
    writeFileSync(envPath, "EXISTING_VAR=1\n");
    appendEnvVars(envPath, "https://node.example.com", "sk_test");
    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("EXISTING_VAR=1");
    expect(content).toContain("LIGHTNING_NODE_URL=https://node.example.com");
  });

  it("returns false and does not modify the file when vars already exist", () => {
    const envPath = join(tmpDir, ".env.local");
    writeFileSync(envPath, "LIGHTNING_NODE_URL=https://old.example.com\n");
    const result = appendEnvVars(envPath, "https://new.example.com", "key");
    expect(result).toBe(false);
    const content = readFileSync(envPath, "utf8");
    expect(content).not.toContain("https://new.example.com");
  });
});
