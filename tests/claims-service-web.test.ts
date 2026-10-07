import { describe, expect, it, vi } from "vitest";

// There is no CLI-signed fixture for a web URL, so signature verification is stubbed here.
// The signature path itself is covered by the real fixtures in tests/claims/verify.test.ts.
vi.mock("@/lib/claims/verify", async (orig) => ({
  ...(await orig<typeof import("@/lib/claims/verify")>()),
  verifyClaimSignature: () => ({ ok: true, checks: [{ id: "signature", ok: true }] }),
}));

const { processClaim } = await import("@/lib/claims-service");
type Deps = import("@/lib/claims-service").ClaimsDeps;
type History = Awaited<ReturnType<Deps["getHistory"]>>;

const ID = "21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh";
const msg = (url: string) => ({ message: `proof-of-tooling v1 | claim | ${url} | ${ID} | 2026-10-07`, signature: "x" });

function setup(history: Partial<History> = {}) {
  const fetched: string[] = [];
  const getRepoMetadata = vi.fn();
  const saveClaim = vi.fn(async () => ({ id: 1, status: "active" }) as never);
  const deps: Deps = {
    now: () => new Date("2026-10-07T12:00:00Z"),
    fetcher: async (url) => {
      fetched.push(url);
      return { status: 200, body: JSON.stringify({ identities: [ID] }) };
    },
    findValidatorCluster: async () => "mainnet",
    getRepoMetadata,
    getHistory: async () => ({ existing: null, identityClaimsLast24h: 0, otherClaimants: 0, sameDomainClaims: 0, ...history }),
    saveClaim,
  };
  return { deps, fetched, getRepoMetadata, saveClaim };
}

describe("processClaim for web tools", () => {
  it("checks the well-known proof file and skips repo metadata", async () => {
    const s = setup();
    const r = await processClaim(msg("example.com"), s.deps, true);
    expect(r.ok).toBe(true);
    expect(r.inReview).toBe(false);
    expect(s.fetched).toEqual(["https://example.com/.well-known/proof-of-tooling.json"]);
    expect(s.getRepoMetadata).not.toHaveBeenCalled();
    expect(r.checks.map((c) => c.id)).toEqual(["signature", "validator", "proof", "rules"]);
    expect(s.saveClaim).toHaveBeenCalledOnce();
  });

  it("a proof file at the root of the domain covers any URL under it", async () => {
    const s = setup();
    const r = await processClaim(msg("pumpkinspool.com/watchtower/rugs"), s.deps, true);
    expect(r.ok).toBe(true);
    expect(s.fetched).toEqual(["https://pumpkinspool.com/.well-known/proof-of-tooling.json"]);
    expect(s.saveClaim).toHaveBeenCalledWith(expect.objectContaining({ toolUrl: "pumpkinspool.com/watchtower/rugs" }));
  });

  it("applies the anti-abuse rules to web claims too (A3): over the daily limit goes to review", async () => {
    const s = setup({ identityClaimsLast24h: 6 });
    const r = await processClaim(msg("a.example.com"), s.deps, true);
    expect(r).toMatchObject({ ok: true, inReview: true });
    expect(r.checks.at(-1)).toMatchObject({ id: "rules", ok: true });
    expect(r.checks.at(-1)?.detail).toContain("Needs manual review");
    expect(s.saveClaim).toHaveBeenCalledWith(expect.objectContaining({ pending: true }));
  });

  it("a validator cannot fill the ranking with subdomains of one domain: the 6th goes to review", async () => {
    expect((await processClaim(msg("a5.example.com"), setup({ sameDomainClaims: 4 }).deps, true)).inReview).toBe(false);
    const s = setup({ sameDomainClaims: 5 });
    const r = await processClaim(msg("a6.example.com"), s.deps, true);
    expect(r.inReview).toBe(true);
    expect(r.checks.at(-1)?.detail).toContain("under this domain");
    expect(s.saveClaim).toHaveBeenCalledWith(expect.objectContaining({ pending: true }));
  });

  it("goes to review when another validator already claimed the same URL", async () => {
    const r = await processClaim(msg("example.com/tool"), setup({ otherClaimants: 1 }).deps, false);
    expect(r).toMatchObject({ ok: true, inReview: true });
  });

  it("refuses a new claim that would go to review when the identity already has 3 waiting (N2)", async () => {
    const s = setup({ identityClaimsLast24h: 6, pendingClaims: 3 });
    const r = await processClaim(msg("a.example.com"), s.deps, true);
    expect(r.ok).toBe(false);
    expect(r.checks.at(-1)).toMatchObject({ id: "rules", ok: false });
    expect(r.checks.at(-1)?.detail).toContain("3 claims waiting for review");
    expect(s.saveClaim).not.toHaveBeenCalled();
    // below the cap it is queued as usual, and claims that do not need review are never blocked by it
    expect((await processClaim(msg("b.example.com"), setup({ identityClaimsLast24h: 6, pendingClaims: 2 }).deps, false)).inReview).toBe(true);
    expect((await processClaim(msg("c.example.com"), setup({ pendingClaims: 3 }).deps, false)).ok).toBe(true);
  });

  it("reports the limit when the storage layer hits it under its lock", async () => {
    const { PendingLimitError } = await import("@/lib/claims-service");
    const s = setup({ identityClaimsLast24h: 6 });
    s.saveClaim.mockRejectedValueOnce(new PendingLimitError());
    const r = await processClaim(msg("a.example.com"), s.deps, true);
    expect(r.ok).toBe(false);
    expect(r.checks.at(-1)).toMatchObject({ id: "rules", ok: false });
    s.saveClaim.mockRejectedValueOnce(new Error("db down"));
    await expect(processClaim(msg("b.example.com"), s.deps, true)).rejects.toThrow("db down");
  });

  it("treats a missing sameDomainClaims as zero", async () => {
    const s = setup();
    const deps = { ...s.deps, getHistory: async () => ({ existing: null, identityClaimsLast24h: 0, otherClaimants: 0 }) };
    expect((await processClaim(msg("example.com"), deps, false)).inReview).toBe(false);
  });

  it("rejects URLs that have no public registrable domain", async () => {
    for (const url of ["localhost", "10.0.0.1", "internal.invalidtld", "example.com/../x"]) {
      const s = setup();
      const r = await processClaim(msg(url), s.deps, true);
      expect(r.ok, url).toBe(false);
      expect(s.saveClaim).not.toHaveBeenCalled();
    }
  });
});
