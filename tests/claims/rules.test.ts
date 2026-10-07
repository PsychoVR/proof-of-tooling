import { describe, expect, it } from "vitest";
import { evaluateRepoRules, type RepoMetadata, type RuleContext } from "@/lib/claims";

const NOW = new Date("2026-10-07T00:00:00Z");
const repo: RepoMetadata = {
  isPrivate: false,
  archived: false,
  isFork: false,
  commitCount: 50,
  ownCommits: 50,
  createdAt: "2026-01-01T00:00:00Z",
};
const ctx: RuleContext = { now: NOW, identityClaimsLast24h: 0, alreadyClaimedBySameIdentity: false, otherClaimants: 0 };

describe("evaluateRepoRules", () => {
  it("accepts a healthy repo", () => {
    expect(evaluateRepoRules(repo, ctx)).toEqual({ decision: "accept", reasons: [] });
  });

  it.each([
    ["private", { isPrivate: true }, {}],
    ["archived", { archived: true }, {}],
    ["empty", { commitCount: 0 }, {}],
    ["fork without own commits", { isFork: true, ownCommits: 0 }, {}],
    ["duplicate claim", {}, { alreadyClaimedBySameIdentity: true }],
  ])("rejects %s", (_n, r, c) => {
    const out = evaluateRepoRules({ ...repo, ...r }, { ...ctx, ...c });
    expect(out.decision).toBe("reject");
    expect(out.reasons).toHaveLength(1);
  });

  it("accepts a fork with its own commits", () => {
    expect(evaluateRepoRules({ ...repo, isFork: true, ownCommits: 3 }, ctx).decision).toBe("accept");
  });

  it("collects every reject reason, and reject wins over review", () => {
    const out = evaluateRepoRules({ ...repo, isPrivate: true, archived: true, commitCount: 1 }, ctx);
    expect(out.decision).toBe("reject");
    expect(out.reasons).toHaveLength(2);
  });

  it("sends to review: few commits (boundary 4 vs 5)", () => {
    expect(evaluateRepoRules({ ...repo, commitCount: 4 }, ctx).decision).toBe("review");
    expect(evaluateRepoRules({ ...repo, commitCount: 5 }, ctx).decision).toBe("accept");
  });

  it("sends to review: young repo (boundary 7 days)", () => {
    expect(evaluateRepoRules({ ...repo, createdAt: "2026-10-01T00:00:01Z" }, ctx).decision).toBe("review");
    expect(evaluateRepoRules({ ...repo, createdAt: "2026-09-30T00:00:00Z" }, ctx).decision).toBe("accept");
  });

  it("sends to review: more than 5 claims in 24h (boundary 5 vs 6)", () => {
    expect(evaluateRepoRules(repo, { ...ctx, identityClaimsLast24h: 5 }).decision).toBe("accept");
    expect(evaluateRepoRules(repo, { ...ctx, identityClaimsLast24h: 6 }).decision).toBe("review");
  });

  it("sends to review: claimed by other validators", () => {
    expect(evaluateRepoRules(repo, { ...ctx, otherClaimants: 1 }).decision).toBe("review");
  });

  it("collects several review reasons", () => {
    const out = evaluateRepoRules({ ...repo, commitCount: 2 }, { ...ctx, otherClaimants: 2 });
    expect(out.reasons).toHaveLength(2);
  });
});
