import type { ClaimsDeps } from "@/lib/claims-service";

/**
 * Production build: there is no test double. The Playwright build swaps this module for
 * lib/claims-stub.e2e.ts (see next.config.ts), so the deployed bundle contains none of that code.
 */
export function e2eOverrides(): Partial<ClaimsDeps> | null {
  return null;
}
