import { describe, expect, it, vi } from "vitest";

// There is no CLI-signed fixture for a web URL, so signature verification is stubbed here.
// The signature path itself is covered by the real fixtures in tests/claims/verify.test.ts.
vi.mock("@/lib/claims/verify", async (orig) => ({
  ...(await orig<typeof import("@/lib/claims/verify")>()),
  verifyClaimSignature: () => ({ ok: true, checks: [{ id: "signature", ok: true }] }),
}));

const { processClaim } = await import("@/lib/claims-service");
type Deps = import("@/lib/claims-service").ClaimsDeps;

const ID = "21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh";
const req = { message: `proof-of-tooling v1 | claim | example.com | ${ID} | 2026-10-07`, signature: "x" };

describe("processClaim for web tools", () => {
  it("checks the well-known proof file and skips repo rules", async () => {
    const fetched: string[] = [];
    const getRepoMetadata = vi.fn();
    const saveClaim = vi.fn(async () => ({ id: 1, status: "active" }) as never);
    const deps: Deps = {
      now: () => new Date("2026-10-07T12:00:00Z"),
      fetcher: async (url) => {
        fetched.push(url);
        return { status: 200, body: JSON.stringify({ identities: [ID] }) };
      },
      findValidatorCluster: async () => "testnet",
      getRepoMetadata,
      getHistory: async () => ({ existing: null, identityClaimsLast24h: 0, otherClaimants: 0 }),
      saveClaim,
    };
    const r = await processClaim(req, deps, true);
    expect(r.ok).toBe(true);
    expect(fetched).toEqual(["https://example.com/.well-known/proof-of-tooling.json"]);
    expect(getRepoMetadata).not.toHaveBeenCalled();
    expect(r.checks.map((c) => c.id)).not.toContain("repo");
    expect(saveClaim).toHaveBeenCalledOnce();
  });
});
