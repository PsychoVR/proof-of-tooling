import { describe, expect, it, vi } from "vitest";
import { processClaim, type ClaimsDeps } from "@/lib/claims-service";
import { createRateLimiter } from "@/lib/rate-limit";
import type { Claim } from "@/lib/types";

const ID = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const SIG = "3mDMjcmqN9DhAaUDL1MFJAmrd2wzkWpQU4obWEVWa7AqkW9Umj2uf8eLcPqacvQqe7ZkQwmSAMwHE5LWVDxKCHVu";
const MSG = `proof-of-tooling v1 | claim | github.com/example/demo-tool | ${ID} | 2026-10-06`;
const req = { message: MSG, signature: SIG };
const claim = { id: 1, status: "active" } as Claim;

function deps(over: Partial<ClaimsDeps> = {}): ClaimsDeps {
  return {
    now: () => new Date("2026-10-07T00:00:00Z"),
    fetcher: async () => ({ status: 200, body: JSON.stringify({ identities: [ID] }) }),
    findValidatorCluster: async () => "mainnet",
    getRepoMetadata: async () => ({ isPrivate: false, archived: false, isFork: false, commitCount: 40, ownCommits: 40, createdAt: "2026-01-01T00:00:00Z" }),
    getHistory: async () => ({ existing: null, identityClaimsLast24h: 0, otherClaimants: 0 }),
    saveClaim: vi.fn(async () => claim),
    ...over,
  };
}

describe("processClaim", () => {
  it("stores a fully valid claim", async () => {
    const d = deps();
    const r = await processClaim(req, d, true);
    expect(r.ok).toBe(true);
    expect(r.claim).toBe(claim);
    expect(r.checks.map((c) => c.id)).toEqual(["format", "date", "encoding", "signature", "validator", "proof", "repo"]);
    expect(d.saveClaim).toHaveBeenCalledOnce();
  });

  it("check mode does not store", async () => {
    const d = deps();
    const r = await processClaim(req, d, false);
    expect(r.ok).toBe(true);
    expect(d.saveClaim).not.toHaveBeenCalled();
  });

  it("stops at signature failures", async () => {
    expect((await processClaim({ ...req, signature: "abc" }, deps(), true)).ok).toBe(false);
    expect((await processClaim({ message: "junk", signature: SIG }, deps(), true)).checks[0].id).toBe("format");
  });

  it("rejects unknown validators", async () => {
    const r = await processClaim(req, deps({ findValidatorCluster: async () => null }), true);
    expect(r.checks.at(-1)).toMatchObject({ id: "validator", ok: false });
  });

  it("is idempotent for an existing active claim", async () => {
    const d = deps({ getHistory: async () => ({ existing: claim, identityClaimsLast24h: 0, otherClaimants: 0 }) });
    const r = await processClaim(req, d, true);
    expect(r).toMatchObject({ ok: true, claim });
    expect(d.saveClaim).not.toHaveBeenCalled();
  });

  it("fails when the proof file is missing", async () => {
    const r = await processClaim(req, deps({ fetcher: async () => ({ status: 404, body: "" }) }), true);
    expect(r.checks.at(-1)).toMatchObject({ id: "proof", ok: false });
  });

  it("fails when repo metadata is unavailable", async () => {
    const r = await processClaim(req, deps({ getRepoMetadata: async () => null }), true);
    expect(r.checks.at(-1)).toMatchObject({ id: "repo", ok: false });
  });

  it("rejects and queues for review according to the rules", async () => {
    const meta = { isPrivate: false, archived: true, isFork: false, commitCount: 40, ownCommits: 40, createdAt: "2026-01-01T00:00:00Z" };
    const rejected = await processClaim(req, deps({ getRepoMetadata: async () => meta }), true);
    expect(rejected.checks.at(-1)?.detail).toContain("archived");
    const review = await processClaim(req, deps({ getRepoMetadata: async () => ({ ...meta, archived: false, commitCount: 2 }) }), true);
    expect(review.checks.at(-1)?.detail).toContain("manual review");
  });

  // These need a real signed fixture for a web URL / unclaim (not available yet).
  it.todo("skips repo rules for web tools");
  it.todo("withdraws on a valid unclaim and rejects an unclaim without an existing claim");
});

describe("createRateLimiter", () => {
  it("allows up to the limit per window and then recovers", () => {
    let t = 0;
    const allow = createRateLimiter(2, 1000, () => t);
    expect([allow("a"), allow("a"), allow("a"), allow("b")]).toEqual([true, true, false, true]);
    t = 1500;
    expect(allow("a")).toBe(true);
  });
});
