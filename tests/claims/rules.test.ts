import { describe, expect, it } from "vitest";
import { MAX_ACTIVE_PER_IDENTITY, MAX_CLAIMS_PER_DOMAIN_TOTAL, MAX_TOOLS_PER_DOMAIN, MIN_FORK_OWN_COMMITS, evaluateRepoRules, evaluateWebRules, type RepoMetadata, type RuleContext } from "@/lib/claims";

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

  it("forks need 5 own commits: 1-4 go to review, 5 are accepted (B11)", () => {
    expect(MIN_FORK_OWN_COMMITS).toBe(5);
    expect(evaluateRepoRules({ ...repo, isFork: true, ownCommits: 4 }, ctx).decision).toBe("review");
    expect(evaluateRepoRules({ ...repo, isFork: true, ownCommits: 5 }, ctx).decision).toBe("accept");
    expect(evaluateRepoRules({ ...repo, isFork: false, ownCommits: 0 }, ctx).decision).toBe("accept");
  });

  it("caps active claims per identity for repos too (N6)", () => {
    expect(evaluateRepoRules(repo, { ...ctx, identityActiveClaims: MAX_ACTIVE_PER_IDENTITY - 1 }).decision).toBe("accept");
    expect(evaluateRepoRules(repo, { ...ctx, identityActiveClaims: MAX_ACTIVE_PER_IDENTITY }).decision).toBe("review");
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

describe("evaluateWebRules", () => {
  const web = { now: NOW, identityClaimsLast24h: 0, alreadyClaimedBySameIdentity: false, otherClaimants: 0, sameDomainClaims: 0 };

  it("accepts a plain web claim", () => {
    expect(evaluateWebRules(web)).toEqual({ decision: "accept", reasons: [] });
  });

  it("applies the daily limit (5 ok, 6 review)", () => {
    expect(evaluateWebRules({ ...web, identityClaimsLast24h: 5 }).decision).toBe("accept");
    expect(evaluateWebRules({ ...web, identityClaimsLast24h: 6 }).decision).toBe("review");
  });

  it("sends to review when other validators claim the same URL", () => {
    expect(evaluateWebRules({ ...web, otherClaimants: 1 }).decision).toBe("review");
  });

  it("caps tools per registrable domain so wildcard subdomains cannot inflate the ranking", () => {
    expect(evaluateWebRules({ ...web, sameDomainClaims: MAX_TOOLS_PER_DOMAIN - 1 }).decision).toBe("accept");
    const out = evaluateWebRules({ ...web, sameDomainClaims: MAX_TOOLS_PER_DOMAIN });
    expect(out.decision).toBe("review");
    expect(out.reasons.join(" ")).toContain("under this domain");
  });

  it("caps claims under one domain across all identities (N6)", () => {
    expect(evaluateWebRules({ ...web, domainClaimsAllIdentities: MAX_CLAIMS_PER_DOMAIN_TOTAL - 1 }).decision).toBe("accept");
    const out = evaluateWebRules({ ...web, domainClaimsAllIdentities: MAX_CLAIMS_PER_DOMAIN_TOTAL });
    expect(out.decision).toBe("review");
    expect(out.reasons.join(" ")).toContain("This domain");
  });

  it("caps active claims per identity (N6)", () => {
    expect(evaluateWebRules({ ...web, identityActiveClaims: MAX_ACTIVE_PER_IDENTITY - 1 }).decision).toBe("accept");
    expect(evaluateWebRules({ ...web, identityActiveClaims: MAX_ACTIVE_PER_IDENTITY }).decision).toBe("review");
  });

  it("collects several reasons and rejects a duplicate claim by the same identity", () => {
    expect(evaluateWebRules({ ...web, otherClaimants: 1, sameDomainClaims: 9 }).reasons).toHaveLength(2);
    expect(evaluateWebRules({ ...web, alreadyClaimedBySameIdentity: true }).decision).toBe("reject");
  });
});
