import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    alias: {
      // server-only throws when imported outside Next.js — stub it for tests.
      "server-only": path.resolve(
        __dirname,
        "src/__tests__/stubs/server-only.ts",
      ),
    },
  },
});
