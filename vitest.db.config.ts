import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests against the local MariaDB (npm run db:up). Not part of `npm run test`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    setupFiles: ["tests/db/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
