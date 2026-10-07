import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Runs against the local docker database (npm run db:up) with a production build on its own port.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", grep: /@mobile/, use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 800 } } },
  ],
  webServer: {
    command: `npx next build --webpack && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      E2E_BUILD: "1", // swaps in the claim-verification test double and builds into .next-e2e
      ADMIN_SECRET: "e2e-admin-secret-0123456789abcdef",
      E2E_CLAIMS_STUB: "1",
      E2E_NOW: "2026-10-07T12:00:00Z",
      E2E_PROOF_IDENTITIES: "21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh",
    },
  },
});
