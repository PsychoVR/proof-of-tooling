import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claims/verify", async (orig) => ({
  ...(await orig<typeof import("@/lib/claims/verify")>()),
  verifyClaimSignature: () => ({ ok: true, checks: [{ id: "signature", ok: true }] }),
}));

const { processClaim, PendingLimitError, RuleRejectedError, ToolQuotaError, UnknownValidatorError } = await import("@/lib/claims-service");
type Deps = import("@/lib/claims-service").ClaimsDeps;

const ID = "21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh";
const claimMsg = (url: string, action = "claim") => ({ message: `proof-of-tooling v1 | ${action} | ${url} | ${ID} | 2026-10-07`, signature: "x" });
const healthy = { isPrivate: false, archived: false, isFork: false, commitCount: 40, ownCommits: 40, createdAt: "2026-01-01T00:00:00Z" };

function setup(saveClaim: Deps["saveClaim"], history: Partial<Awaited<ReturnType<Deps["getHistory"]>>> = {}) {
  const deps: Deps = {
    now: () => new Date("2026-10-07T12:00:00Z"),
    fetcher: async () => ({ status: 200, body: JSON.stringify({ identities: [ID] }) }),
    resolveTxt: async () => [],
    findValidatorCluster: async () => "mainnet",
    getRepoMetadata: async () => healthy,
    getHistory: async () => ({ existing: null, identityClaimsLast24h: 0, otherClaimants: 0, ...history }),
    saveClaim,
  };
  return deps;
}
const stored = (status: string) => vi.fn(async () => ({ id: 1, status }) as never);

describe("processClaim passes the rule inputs to storage and maps its errors (V2, V3, V4)", () => {
  it("passes now and the fetched repo metadata for repos, and now alone for web tools", async () => {
    const save = stored("active");
    await processClaim(claimMsg("github.com/o/r"), setup(save), true);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ recheck: { now: new Date("2026-10-07T12:00:00Z"), repo: healthy } }));
    await processClaim(claimMsg("example.com"), setup(save), true);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ recheck: { now: new Date("2026-10-07T12:00:00Z"), repo: undefined } }));
  });

  it("an unclaim sends no rule inputs", async () => {
    const save = stored("withdrawn");
    const existing = { id: 1, toolId: 1, identity: ID, cluster: "mainnet", message: "", signature: "", signedDate: "2026-10-06", status: "active", verifiedAt: "", lastCheckedAt: null } as never;
    await processClaim(claimMsg("example.com", "unclaim"), setup(save, { existing }), true);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ recheck: undefined }));
  });

  it("reports in review when storage escalated an accepted claim to pending", async () => {
    const r = await processClaim(claimMsg("example.com"), setup(stored("pending")), true);
    expect(r).toMatchObject({ ok: true, inReview: true });
  });

  it("maps typed storage errors to clean failed checks", async () => {
    const fail = (err: Error, url = "example.com") => processClaim(claimMsg(url), setup(vi.fn(async () => { throw err; })), true);
    expect((await fail(new PendingLimitError())).checks.at(-1)).toMatchObject({ id: "rules", ok: false });
    expect((await fail(new UnknownValidatorError())).checks.at(-1)).toMatchObject({ id: "validator", ok: false });
    expect((await fail(new ToolQuotaError())).checks.at(-1)).toMatchObject({ id: "rules", ok: false });
    expect((await fail(new RuleRejectedError(["no"]))).checks.at(-1)).toMatchObject({ id: "rules", ok: false, detail: "no" });
    expect((await fail(new RuleRejectedError(["no"]), "github.com/o/r")).checks.at(-1)).toMatchObject({ id: "repo", ok: false });
  });

  it("rethrows unexpected storage errors", async () => {
    await expect(processClaim(claimMsg("example.com"), setup(vi.fn(async () => { throw new Error("db down"); })), true)).rejects.toThrow("db down");
  });

  it("the new counters from the history feed the rules (N6)", async () => {
    const save = stored("pending");
    const r = await processClaim(claimMsg("example.com"), setup(save, { identityActiveClaims: 25 }), true);
    expect(r.checks.at(-1)?.detail).toContain("25 or more active claims");
    const r2 = await processClaim(claimMsg("example.com"), setup(save, { domainClaimsAllIdentities: 10 }), true);
    expect(r2.checks.at(-1)?.detail).toContain("This domain");
  });
});
