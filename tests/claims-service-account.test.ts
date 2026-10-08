import { describe, expect, it, vi } from "vitest";
import cli from "./fixtures/cli-signatures.json";
import { ACCOUNT_PROOF_REASON, processClaim, type ClaimsDeps } from "@/lib/claims-service";
import type { Claim } from "@/lib/types";

const claim = cli.cases.find((c) => c.name === "valid-claim")!;
const REPO_FILE = "https://api.github.com/repos/psychovr/proof-of-tooling/contents/.proof-of-tooling.json";
const listed = { status: 200, body: JSON.stringify({ identities: [cli.identity] }) };

function deps(answers: (url: string) => { status: number; body: string }): ClaimsDeps {
  return {
    now: () => new Date("2026-10-07T12:00:00Z"),
    fetcher: async (u) => answers(u),
    resolveTxt: async () => [],
    findValidatorCluster: async () => "mainnet",
    getRepoMetadata: async () => ({ isPrivate: false, archived: false, isFork: false, commitCount: 40, ownCommits: 40, createdAt: "2026-01-01T00:00:00Z" }),
    getHistory: async () => ({ existing: null, identityClaimsLast24h: 0, otherClaimants: 0 }),
    saveClaim: vi.fn(async (i) => ({ id: 1, status: i.pending ? "pending" : "active" }) as Claim),
  };
}

describe("account-level proof never auto-approves (M2)", () => {
  it("a match in the owner's .github repo sends a clean claim to review", async () => {
    const d = deps((u) => (u === REPO_FILE ? { status: 404, body: "" } : listed));
    const r = await processClaim(claim, d, true);
    expect(r.ok).toBe(true);
    expect(r.inReview).toBe(true);
    expect(r.checks.find((c) => c.id === "repo")?.detail).toContain(ACCOUNT_PROOF_REASON);
    expect(d.saveClaim).toHaveBeenCalledWith(expect.objectContaining({ pending: true }));
  });

  it("keeps the other review reasons next to it", async () => {
    const d = deps((u) => (u === REPO_FILE ? { status: 404, body: "" } : listed));
    d.getHistory = async () => ({ existing: null, identityClaimsLast24h: 0, otherClaimants: 1 });
    const r = await processClaim(claim, d, true);
    expect(r.checks.find((c) => c.id === "repo")?.detail).toContain("URL also claimed by other validators. Ownership proved");
  });

  it("the repo's own file still activates the claim", async () => {
    const d = deps(() => listed);
    const r = await processClaim(claim, d, true);
    expect(r.ok).toBe(true);
    expect(r.inReview).toBe(false);
    expect(d.saveClaim).toHaveBeenCalledWith(expect.objectContaining({ pending: false }));
  });

  it("an account-level proof still respects the pending limit", async () => {
    const d = deps((u) => (u === REPO_FILE ? { status: 404, body: "" } : listed));
    d.getHistory = async () => ({ existing: null, identityClaimsLast24h: 0, otherClaimants: 0, pendingClaims: 3 });
    const r = await processClaim(claim, d, true);
    expect(r.ok).toBe(false);
    expect(d.saveClaim).not.toHaveBeenCalled();
  });
});
