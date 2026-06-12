import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    setupFiles: ["./src/__tests__/setup.ts"],
    alias: {
      // server-only throws when imported outside Next.js — stub it for tests.
      "server-only": path.resolve(
        __dirname,
        "src/__tests__/stubs/server-only.ts",
      ),
    },
    // Route handler tests run in Node; hooks and component tests need a DOM.
    environmentMatchGlobs: [
      ["src/__tests__/route.test.ts", "node"],
      ["src/__tests__/use*.test.ts", "jsdom"],
      ["src/__tests__/*.test.tsx", "jsdom"],
    ],
  },
});
