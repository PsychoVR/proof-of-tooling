import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/db/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["lib/claims/**/*.ts"],
      exclude: ["lib/claims/index.ts"],
    },
  },
});
