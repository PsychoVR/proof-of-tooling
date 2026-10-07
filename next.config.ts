import path from "node:path";
import type { NextConfig } from "next";

// The Playwright build (E2E_BUILD=1) gets its own output folder and swaps in the claim-verification
// test double. A normal build never contains it: scripts/check-prod-bundle.mjs fails the build if it does.
const e2e = process.env.E2E_BUILD === "1";

const nextConfig: NextConfig = {
  distDir: e2e ? ".next-e2e" : ".next",
  webpack(config, { webpack }) {
    if (e2e) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/[\\/]claims-stub$/, path.resolve("lib/claims-stub.e2e.ts")),
      );
    }
    return config;
  },
};

export default nextConfig;
