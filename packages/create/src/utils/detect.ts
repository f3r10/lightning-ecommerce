import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const NEXT_CONFIG_NAMES = [
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "next.config.cjs",
  "next.config.mts",
];

export type Router = "app" | "pages";
export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

/** Walk up from startDir until we find a package.json. */
export function findProjectRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (let i = 0; i < 15; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir);
}

/** Returns true when the directory looks like a Next.js project. */
export function isNextJsProject(root: string): boolean {
  if (NEXT_CONFIG_NAMES.some((n) => existsSync(join(root, n)))) return true;
  try {
    const raw = readFileSync(join(root, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const allDeps = {
      ...(pkg["dependencies"] as Record<string, string> | undefined ?? {}),
      ...(pkg["devDependencies"] as Record<string, string> | undefined ?? {}),
    };
    return "next" in allDeps;
  } catch {
    return false;
  }
}

/** Detect whether the project uses App Router, Pages Router, or neither. */
export function detectRouter(root: string): Router | null {
  const appCandidates = ["app", join("src", "app")];
  for (const c of appCandidates) {
    if (existsSync(join(root, c))) return "app";
  }
  const pagesCandidates = ["pages", join("src", "pages")];
  for (const c of pagesCandidates) {
    if (existsSync(join(root, c))) return "pages";
  }
  return null;
}

/** Returns true when the project has a tsconfig (TypeScript). */
export function detectTypeScript(root: string): boolean {
  return (
    existsSync(join(root, "tsconfig.json")) ||
    existsSync(join(root, "next-env.d.ts"))
  );
}

/** Infer the package manager from lock files. */
export function detectPackageManager(root: string): PackageManager {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb"))) return "bun";
  return "npm";
}

/**
 * Return the default route file path relative to the project root,
 * respecting src/ layout and TypeScript.
 */
export function defaultRoutePath(root: string, useTypeScript: boolean): string {
  const appBase = existsSync(join(root, "src", "app")) ? "src/app" : "app";
  const ext = useTypeScript ? "ts" : "js";
  return `${appBase}/api/lightning/route.${ext}`;
}

/** Return the install command arguments for adding the package. */
export function installArgs(pm: PackageManager): [string, string[]] {
  const pkg = "@lightning-ecommerce/nextjs";
  switch (pm) {
    case "pnpm": return ["pnpm", ["add", pkg]];
    case "yarn": return ["yarn", ["add", pkg]];
    case "bun":  return ["bun", ["add", pkg]];
    case "npm":  return ["npm", ["install", pkg]];
  }
}
