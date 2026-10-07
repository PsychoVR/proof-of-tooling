import { describe, expect, it, vi } from "vitest";
import cli from "./fixtures/cli-signatures.json";
import { processClaim, type ClaimsDeps } from "@/lib/claims-service";
import type { Claim } from "@/lib/types";

// DEMO vector (claim dated 2026-10-06) and the real CLI fixtures (dated 2026-10-07).
const ID = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const SIG = "3mDMjcmqN9DhAaUDL1MFJAmrd2wzkWpQU4obWEVWa7AqkW9Umj2uf8eLcPqacvQqe7ZkQwmSAMwHE5LWVDxKCHVu";
const demo = { message: `proof-of-tooling v1 | claim | github.com/example/demo-tool | ${ID} | 2026-10-06`, signature: SIG };
const unclaim = cli.cases.find((c) => c.name === "valid-unclaim")!;
const claimFx = cli.cases.find((c) => c.name === "valid-claim")!;

const stored = (status: Claim["status"], signedDate: string) => ({ id: 9, status, signedDate }) as Claim;

function deps(existing: Claim | null, over: Partial<ClaimsDeps> = {}): ClaimsDeps {
  return {
    now: () => new Date("2026-10-07T12:00:00Z"),
    fetcher: async () => ({ status: 200, body: JSON.stringify({ identities: [ID, cli.identity] }) }),
    resolveTxt: async () => [],
    findValidatorCluster: async () => "mainnet",
    getRepoMetadata: async () => ({ isPrivate: false, archived: false, isFork: false, commitCount: 40, ownCommits: 40, createdAt: "2026-01-01T00:00:00Z" }),
    getHistory: async () => ({ existing, identityClaimsLast24h: 0, otherClaimants: 0 }),
    saveClaim: vi.fn(async () => ({ id: 1, status: "active" }) as Claim),
    ...over,
  };
}

describe("earlier decisions win over replayed signatures (A2, M6)", () => {
  it("a rejected claim stays rejected: no resubmission, no unclaim", async () => {
    const d = deps(stored("rejected", "2026-10-06"));
    const r = await processClaim(demo, d, true);
    expect(r.ok).toBe(false);
    expect(r.checks.at(-1)).toMatchObject({ id: "status", ok: false });
    const un = deps(stored("rejected", "2026-10-01"));
    expect((await processClaim({ message: unclaim.message, signature: unclaim.signature }, un, true)).ok).toBe(false);
    expect(d.saveClaim).not.toHaveBeenCalled();
    expect(un.saveClaim).not.toHaveBeenCalled();
  });

  it("a message dated before the stored one is refused, for claims and unclaims", async () => {
    const d = deps(stored("active", "2026-10-07")); // stored is newer than the 2026-10-06 demo claim
    const r = await processClaim(demo, d, true);
    expect(r.checks.at(-1)).toMatchObject({ id: "date", ok: false, detail: "A newer signed message already exists for this tool." });
    // an old unclaim (2026-10-07) must not withdraw a claim signed later
    const newer = deps(stored("active", "2026-10-08"), { fetcher: async () => ({ status: 200, body: "{}" }) });
    const un = await processClaim({ message: unclaim.message, signature: unclaim.signature }, newer, true);
    expect(un.ok).toBe(false);
    expect(newer.saveClaim).not.toHaveBeenCalled();
  });

  it("an unclaim signed the same day beats a claim; a later claim is allowed again", async () => {
    const same = deps(stored("withdrawn", "2026-10-07"));
    const r = await processClaim({ message: claimFx.message, signature: claimFx.signature }, same, true);
    expect(r.ok).toBe(false);
    expect(r.checks.at(-1)).toMatchObject({ id: "date", ok: false });
    // the demo claim is dated before the withdrawal, so it is stale too
    expect((await processClaim(demo, same, true)).ok).toBe(false);
    // a claim dated after the unclaim goes through
    const earlier = deps(stored("withdrawn", "2026-10-05"));
    expect((await processClaim(demo, earlier, true)).ok).toBe(true);
    expect(earlier.saveClaim).toHaveBeenCalledOnce();
  });

  it("an unclaim on the same day as an active claim withdraws it", async () => {
    const d = deps(stored("active", "2026-10-07"));
    const r = await processClaim({ message: unclaim.message, signature: unclaim.signature }, d, true);
    expect(r.ok).toBe(true);
    expect(d.saveClaim).toHaveBeenCalledWith(expect.objectContaining({ action: "unclaim" }));
  });

  it("a stale claim can be renewed by signing again, and a pending one is not re-queued", async () => {
    const renew = deps(stored("stale", "2026-10-05"));
    expect((await processClaim(demo, renew, true)).ok).toBe(true);
    expect(renew.saveClaim).toHaveBeenCalledOnce();
    const pending = deps(stored("pending", "2026-10-06"));
    expect(await processClaim(demo, pending, true)).toMatchObject({ ok: true, inReview: true });
    expect(pending.saveClaim).not.toHaveBeenCalled();
  });
});
