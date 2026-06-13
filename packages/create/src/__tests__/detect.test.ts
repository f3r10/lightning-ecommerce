import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import {
  defaultRoutePath,
  detectPackageManager,
  detectRouter,
  detectTypeScript,
  findProjectRoot,
  installArgs,
  isNextJsProject,
} from "../utils/detect.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "lightning-create-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── findProjectRoot ──────────────────────────────────────────────────────────

describe("findProjectRoot", () => {
  it("returns the directory containing package.json", () => {
    writeFileSync(join(tmpDir, "package.json"), "{}");
    const nested = join(tmpDir, "src", "app");
    mkdirSync(nested, { recursive: true });
    expect(findProjectRoot(nested)).toBe(tmpDir);
  });

  it("returns the start dir when no package.json is found", () => {
    expect(findProjectRoot(tmpDir)).toBe(tmpDir);
  });
});

// ── isNextJsProject ──────────────────────────────────────────────────────────

describe("isNextJsProject", () => {
  it("returns true when next.config.js exists", () => {
    writeFileSync(join(tmpDir, "next.config.js"), "");
    expect(isNextJsProject(tmpDir)).toBe(true);
  });

  it("returns true when next.config.ts exists", () => {
    writeFileSync(join(tmpDir, "next.config.ts"), "");
    expect(isNextJsProject(tmpDir)).toBe(true);
  });

  it("returns true when package.json lists next as a dependency", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: { next: "^14.0.0" } }),
    );
    expect(isNextJsProject(tmpDir)).toBe(true);
  });

  it("returns false for an unrelated directory", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ name: "other" }));
    expect(isNextJsProject(tmpDir)).toBe(false);
  });
});

// ── detectRouter ─────────────────────────────────────────────────────────────

describe("detectRouter", () => {
  it("returns 'app' when app/ exists", () => {
    mkdirSync(join(tmpDir, "app"));
    expect(detectRouter(tmpDir)).toBe("app");
  });

  it("returns 'app' when src/app/ exists", () => {
    mkdirSync(join(tmpDir, "src", "app"), { recursive: true });
    expect(detectRouter(tmpDir)).toBe("app");
  });

  it("returns 'pages' when pages/ exists but not app/", () => {
    mkdirSync(join(tmpDir, "pages"));
    expect(detectRouter(tmpDir)).toBe("pages");
  });

  it("returns null when neither directory exists", () => {
    expect(detectRouter(tmpDir)).toBeNull();
  });

  it("prefers app/ over pages/ when both exist", () => {
    mkdirSync(join(tmpDir, "app"));
    mkdirSync(join(tmpDir, "pages"));
    expect(detectRouter(tmpDir)).toBe("app");
  });
});

// ── detectTypeScript ─────────────────────────────────────────────────────────

describe("detectTypeScript", () => {
  it("returns true when tsconfig.json exists", () => {
    writeFileSync(join(tmpDir, "tsconfig.json"), "{}");
    expect(detectTypeScript(tmpDir)).toBe(true);
  });

  it("returns true when next-env.d.ts exists", () => {
    writeFileSync(join(tmpDir, "next-env.d.ts"), "");
    expect(detectTypeScript(tmpDir)).toBe(true);
  });

  it("returns false when neither file exists", () => {
    expect(detectTypeScript(tmpDir)).toBe(false);
  });
});

// ── detectPackageManager ──────────────────────────────────────────────────────

describe("detectPackageManager", () => {
  it("returns 'pnpm' when pnpm-lock.yaml exists", () => {
    writeFileSync(join(tmpDir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(tmpDir)).toBe("pnpm");
  });

  it("returns 'yarn' when yarn.lock exists", () => {
    writeFileSync(join(tmpDir, "yarn.lock"), "");
    expect(detectPackageManager(tmpDir)).toBe("yarn");
  });

  it("returns 'bun' when bun.lockb exists", () => {
    writeFileSync(join(tmpDir, "bun.lockb"), "");
    expect(detectPackageManager(tmpDir)).toBe("bun");
  });

  it("defaults to 'npm' when no lock file is found", () => {
    expect(detectPackageManager(tmpDir)).toBe("npm");
  });
});

// ── defaultRoutePath ─────────────────────────────────────────────────────────

describe("defaultRoutePath", () => {
  it("returns app/api/lightning/route.ts for a TS project without src/", () => {
    expect(defaultRoutePath(tmpDir, true)).toBe("app/api/lightning/route.ts");
  });

  it("returns src/app/api/lightning/route.ts when src/app/ exists", () => {
    mkdirSync(join(tmpDir, "src", "app"), { recursive: true });
    expect(defaultRoutePath(tmpDir, true)).toBe("src/app/api/lightning/route.ts");
  });

  it("uses .js extension for non-TypeScript projects", () => {
    expect(defaultRoutePath(tmpDir, false)).toBe("app/api/lightning/route.js");
  });
});

// ── installArgs ───────────────────────────────────────────────────────────────

describe("installArgs", () => {
  it.each([
    ["pnpm", "pnpm", ["add", "@lightning-ecommerce/nextjs"]],
    ["yarn", "yarn", ["add", "@lightning-ecommerce/nextjs"]],
    ["bun",  "bun",  ["add", "@lightning-ecommerce/nextjs"]],
    ["npm",  "npm",  ["install", "@lightning-ecommerce/nextjs"]],
  ] as const)("returns correct command for %s", (pm, expectedCmd, expectedArgs) => {
    const [cmd, args] = installArgs(pm);
    expect(cmd).toBe(expectedCmd);
    expect(args).toEqual(expectedArgs);
  });
});
