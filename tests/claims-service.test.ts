import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/cli-signatures.json";
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
    resolveTxt: async () => [],
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
    const lowActivity = deps({ getRepoMetadata: async () => ({ ...meta, archived: false, commitCount: 2 }) });
    const review = await processClaim(req, lowActivity, true);
    expect(review).toMatchObject({ ok: true, inReview: true });
    expect(review.checks.at(-1)).toMatchObject({ id: "repo", ok: true });
    expect(review.checks.at(-1)?.detail).toContain("manual review");
    expect(lowActivity.saveClaim).toHaveBeenCalledWith(expect.objectContaining({ pending: true }));
    const dry = await processClaim(req, deps({ getRepoMetadata: async () => ({ ...meta, archived: false, commitCount: 2 }) }), false);
    expect(dry).toMatchObject({ ok: true, inReview: true });
  });

  it("is idempotent for a claim already waiting for review", async () => {
    const pending = { id: 2, status: "pending" } as Claim;
    const d = deps({ getHistory: async () => ({ existing: pending, identityClaimsLast24h: 0, otherClaimants: 0 }) });
    expect(await processClaim(req, d, true)).toMatchObject({ ok: true, inReview: true, claim: pending });
    expect(d.saveClaim).not.toHaveBeenCalled();
  });

  describe("unclaim with the real CLI fixture", () => {
    const cli = fixture as { identity: string; cases: { name: string; message: string; signature: string }[] };
    const un = cli.cases.find((c) => c.name === "valid-unclaim")!;
    const unReq = { message: un.message, signature: un.signature };
    const clock = () => new Date("2026-10-07T12:00:00Z");
    const existing = { id: 7, status: "active" } as Claim;

    it("withdraws when a claim exists, without needing the proof file", async () => {
      const d = deps({
        now: clock,
        fetcher: async () => ({ status: 404, body: "" }),
        getHistory: async () => ({ existing, identityClaimsLast24h: 0, otherClaimants: 0 }),
      });
      const r = await processClaim(unReq, d, true);
      expect(r.ok).toBe(true);
      expect(d.saveClaim).toHaveBeenCalledWith(expect.objectContaining({ action: "unclaim", identity: cli.identity }));
    });

    it("rejects an unclaim without an existing claim", async () => {
      const d = deps({ now: clock });
      const r = await processClaim(unReq, d, true);
      expect(r.ok).toBe(false);
      expect(r.checks.at(-1)).toMatchObject({ id: "proof", ok: false });
      expect(d.saveClaim).not.toHaveBeenCalled();
    });
  });
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
