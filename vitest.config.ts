import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@breadcrumb/core": `${root}packages/core/src/index.ts`,
      "@breadcrumb/server": `${root}packages/server/src/index.ts`,
      "@breadcrumb/postgres": `${root}packages/postgres/src/index.ts`,
      "@breadcrumb/codex": `${root}packages/codex/src/index.ts`,
      "@breadcrumb/vercel": `${root}packages/vercel/src/index.ts`,
    },
  },
  test: {
    coverage: {
      reporter: ["text", "html"],
      include: ["packages/*/src/**/*.ts"],
      thresholds: {
        statements: 65,
        branches: 60,
        functions: 80,
        lines: 65,
      },
    },
    testTimeout: 10_000,
  },
});
