import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { CLI_IDENTITY, DEV_VALIDATORS as V, resetDevDb, seedDevData } from "@/db/dev-data";
import { claimDecisions, claims, seedEntries, tools, validators as validatorsTable } from "@/db/schema";
import { adminDbDeps, decideClaim, listPendingClaims } from "@/lib/admin-claims";
import { createClaimsDeps } from "@/lib/claims-deps";
import { processClaim } from "@/lib/claims-service";
import { getLeaderboard, getRegistry, getStats, getToolBySlug, getTools, getValidatorProfile } from "@/lib/queries";
import { eq } from "drizzle-orm";
import cli from "../fixtures/cli-signatures.json";

const rows = async <T>(q: ReturnType<typeof sql>) => (await getDb().execute(q))[0] as unknown as T[];

beforeAll(async () => {
  await resetDevDb();
  await seedDevData();
});

afterAll(async () => {
  await resetDevDb();
  await seedDevData();
});

describe("engine", () => {
  it("runs on MariaDB 11.8, like production", async () => {
    const [r] = await rows<{ v: string }>(sql`SELECT VERSION() AS v`);
    expect(String(r.v)).toMatch(/^(5\.5\.5-)?11\.8\./);
  });
});

describe("binary collation on keys and signatures (migration 0003)", () => {
  it("uses ascii_bin for identity, vote_account and signature columns", async () => {
    const cols = await rows<{ t: string; c: string; k: string }>(sql`
      SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLLATION_NAME AS k FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('identity', 'vote_account', 'signature') ORDER BY 1, 2`);
    expect(cols.length).toBe(10);
    for (const c of cols) expect(c.k, `${c.t}.${c.c}`).toBe("ascii_bin");
  });

  it("uses ascii_bin for the stake pool tables too (migration 0010)", async () => {
    const cols = await rows<{ t: string; c: string; k: string }>(sql`
      SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLLATION_NAME AS k FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('validator_pool_stake', 'validator_pool_scan', 'validator_sfdp', 'pool_candidates', 'job_runs')
        AND CHARACTER_SET_NAME = 'ascii' ORDER BY 1, 2`);
    expect(cols.map((c) => `${c.t}.${c.c}`)).toEqual([
      "job_runs.name",
      "pool_candidates.pool",
      "pool_candidates.pool_mint",
      "pool_candidates.program",
      "pool_candidates.validator_list",
      "pool_candidates.withdraw_authority",
      "validator_pool_scan.identity",
      "validator_pool_stake.identity",
      "validator_pool_stake.pool_id",
      "validator_sfdp.identity",
    ]);
    for (const c of cols) expect(c.k, `${c.t}.${c.c}`).toBe("ascii_bin");
  });

  it("treats keys that differ only by case as different", async () => {
    const lower = "a".repeat(43) + "b";
    const upper = "A".repeat(43) + "B";
    await getDb().insert(validatorsTable).values([
      { identity: lower, cluster: "mainnet", voteAccount: "v".repeat(44), name: "Lower", activatedStake: BigInt(1) },
      { identity: upper, cluster: "mainnet", voteAccount: "V".repeat(44), name: "Upper", activatedStake: BigInt(1) },
    ]);
    try {
      expect((await getValidatorProfile(lower))?.validator.name).toBe("Lower");
      expect((await getValidatorProfile(upper))?.validator.name).toBe("Upper");
      expect(await getValidatorProfile("a".repeat(43) + "B")).toBeNull(); // mixed case matches neither
    } finally {
      await getDb().execute(sql`DELETE FROM validators WHERE identity IN (${lower}, ${upper})`);
    }
  });
});

describe("getStats", () => {
  it("counts seeded and actively claimed tools, never pending ones", async () => {
    const s = await getStats();
    expect(s).toMatchObject({ toolsTotal: 7, toolsClaimed: 3, toolsUnclaimed: 4, validatorsWithTools: 2, validatorsTotal: 8 });
    expect(Object.values(s.byCategory).reduce((a, b) => a + b, 0)).toBe(7);
    expect(s.byCategory.Explorer).toBe(3);
    expect(s.byCategory.Library).toBe(0); // the pending-only tool is not counted
  });
});

describe("getLeaderboard: only signed claims rank a validator", () => {
  it("ranks validators by signed tools and ignores seeds, stale and pending claims", async () => {
    const lb = await getLeaderboard({});
    expect(lb.total).toBe(2);
    expect(lb.items.map((r) => [r.validator.name, r.toolCount])).toEqual([["Pumpkin's Pool", 2], ["Overclock", 1]]);
    expect(lb.items[0].tools.map((t) => t.status)).toEqual(["signed", "signed"]);
    expect(lb.items[0].validator.activatedStake).toBe("900000000000000");
  });

  it("does not hand seed entries to a validator that copies another one's name", async () => {
    const lb = await getLeaderboard({});
    expect(lb.items.map((r) => r.validator.identity)).not.toContain(V.impostor.identity);
    const profile = await getValidatorProfile(V.impostor.identity);
    expect(profile?.validator.name).toBe(" overclock ");
    expect(profile?.tools).toEqual([]);
    // the real Overclock only has what it signed, and stale-only validators are not ranked
    expect((await getValidatorProfile(V.overclock.identity))?.tools.map((t) => t.name)).toEqual(["Mithril"]);
    expect(lb.items.map((r) => r.validator.name)).not.toContain("Laine");
  });

  it("restricts to enabled clusters and paginates", async () => {
    expect((await getLeaderboard({ cluster: "testnet" })).total).toBe(0);
    const p = await getLeaderboard({ page: 2, pageSize: 1 });
    expect(p).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(p.items[0].validator.name).toBe("Overclock");
  });
});

describe("getValidatorProfile", () => {
  it("works for a validator with no tools, and returns null for unknown identities", async () => {
    const p = await getValidatorProfile(V.quiet.identity);
    expect(p?.tools).toEqual([]);
    expect(await getValidatorProfile("1".repeat(44))).toBeNull();
  });

  it("lists signed and pending tools of the validator itself", async () => {
    const pk = await getValidatorProfile(V.pumpkin.identity);
    expect(pk?.tools.map((t) => [t.name, t.status]).sort()).toEqual([["RugAlert", "claimed"], ["Watchtower", "claimed"]]);
    expect(pk?.endorsements).toHaveLength(1);
    const bl = await getValidatorProfile(V.blockLogic.identity);
    expect(bl?.tools.map((t) => [t.name, t.status, t.claims.map((c) => c.status)])).toEqual([["New Tool", "unclaimed", ["pending"]]]);
  });

  it("resolves the identity used by the CLI fixtures as a mainnet validator", async () => {
    expect((await getValidatorProfile(CLI_IDENTITY))?.validator.cluster).toBe("mainnet");
  });

  it("ignores validators of clusters that are not enabled", async () => {
    const ghost = "G".repeat(44);
    await getDb().insert(validatorsTable).values({ identity: ghost, cluster: "testnet", voteAccount: "H".repeat(44), name: "Ghost", activatedStake: BigInt(1) });
    try {
      expect(await getValidatorProfile(ghost)).toBeNull();
      expect((await getStats()).validatorsTotal).toBe(8);
    } finally {
      await getDb().execute(sql`DELETE FROM validators WHERE identity = ${ghost}`);
    }
  });
});

describe("getTools / getToolBySlug", () => {
  it("lists unclaimed tools with the seed name as plain owner text, hiding pending-only ones", async () => {
    const un = await getTools({ status: "unclaimed" });
    expect(un.map((t) => [t.name, t.owner]).sort()).toEqual([
      ["Alpenglow Explorer", { name: "Valid Blocks", identity: null, sourceUrl: expect.stringMatching(/^https:\/\//) }],
      ["Solana Dashboards", { name: "Valid Blocks", identity: null, sourceUrl: expect.stringMatching(/^https:\/\//) }],
      ["Stakewiz", expect.objectContaining({ identity: V.laine.identity })], // stale claim names its signer
      ["validators.app", { name: "Block Logic", identity: null, sourceUrl: expect.stringMatching(/^https:\/\//) }],
    ].sort());
    expect((await getTools({})).map((t) => t.name)).not.toContain("New Tool");
    expect((await getTools({ category: "Explorer" })).map((t) => t.name).sort()).toEqual(["Alpenglow Explorer", "Stakewiz", "validators.app"]);
    expect((await getTools({ status: "claimed" })).map((t) => t.name).sort()).toEqual(["Mithril", "RugAlert", "Watchtower"]);
  });

  it("finds a tool by slug with its canonical url", async () => {
    expect(await getToolBySlug("mithril")).toMatchObject({ name: "Mithril", url: "github.com/overclock-validator/mithril", kind: "repo", status: "claimed" });
    expect(await getToolBySlug("nope")).toBeNull();
  });
});

describe("getRegistry", () => {
  it("lists active and stale claims only", async () => {
    const r = await getRegistry();
    expect(r.entries.map((e) => [e.tool.name, e.status]).sort()).toEqual([["Mithril", "active"], ["RugAlert", "active"], ["Stakewiz", "stale"], ["Watchtower", "active"]]);
  });
});

describe("seedUnclaimed against MariaDB", () => {
  it("is idempotent, adds the full list and skips tools that have claims", async () => {
    const { seedUnclaimed } = await import("@/lib/seed");
    const { SEED_TOOLS } = await import("@/db/seed-data");
    const n = SEED_TOOLS.length;
    // The dev data holds 7 of the entries; 4 of them (mithril, watchtower, rugalert, stakewiz) have claims.
    expect(await seedUnclaimed()).toEqual({ tools: n, newTools: n - 7, newEntries: n - 7, updatedEntries: 0, skippedClaimed: 4 });
    expect(await seedUnclaimed()).toEqual({ tools: n, newTools: 0, newEntries: 0, updatedEntries: 0, skippedClaimed: 4 });
    await resetDevDb();
    expect(await seedUnclaimed()).toEqual({ tools: n, newTools: n, newEntries: n, updatedEntries: 0, skippedClaimed: 0 });
    expect(await seedUnclaimed()).toEqual({ tools: n, newTools: 0, newEntries: 0, updatedEntries: 0, skippedClaimed: 0 });
    await resetDevDb();
    await seedDevData();
  });

  it("updates the seed entry of an unclaimed tool but never that of a claimed one", async () => {
    const { seedUnclaimed } = await import("@/lib/seed");
    const db = getDb();
    const entryOf = async (slug: string) => {
      const [row] = await db
        .select({ name: seedEntries.validatorName, source: seedEntries.sourceUrl })
        .from(seedEntries)
        .innerJoin(tools, eq(tools.id, seedEntries.toolId))
        .where(eq(tools.slug, slug));
      return row;
    };
    const fresh = await entryOf("alpenglow-explorer");
    const claimedBefore = await entryOf("stakewiz");
    await db.update(seedEntries).set({ validatorName: "Old Name", sourceUrl: "https://old.example/page" }).where(sql`1=1`);
    expect(await seedUnclaimed()).toMatchObject({ updatedEntries: 3, skippedClaimed: 4 });
    expect(await entryOf("alpenglow-explorer")).toEqual(fresh); // unclaimed: refreshed from the list
    expect(await entryOf("stakewiz")).toEqual({ name: "Old Name", source: "https://old.example/page" }); // claimed: untouched
    expect(claimedBefore.name).not.toBe("Old Name");
    await resetDevDb();
    await seedDevData();
  });
});

// ---- claim flow against the real database, with the real CLI signatures ----

const valid = cli.cases.find((c) => c.name === "valid-claim")!;
const unclaim = cli.cases.find((c) => c.name === "valid-unclaim")!;
const TOOL = "github.com/psychovr/proof-of-tooling";
const clock = () => new Date("2026-10-07T12:00:00Z");
const healthy = { isPrivate: false, archived: false, isFork: false, commitCount: 40, ownCommits: 40, createdAt: "2026-01-01T00:00:00Z" };
const flowDeps = () => ({
  ...createClaimsDeps(),
  now: clock,
  fetcher: async () => ({ status: 200, body: JSON.stringify({ identities: [CLI_IDENTITY] }) }),
  getRepoMetadata: async () => healthy,
});
const claimRow = async () => (await getDb().select().from(claims).where(eq(claims.identity, CLI_IDENTITY)))[0];

describe("claim lifecycle on MariaDB (A2, M6)", () => {
  beforeEach(async () => {
    await resetDevDb();
    await seedDevData();
  });

  it("registers a claim, and repeating it changes nothing", async () => {
    const d = flowDeps();
    expect((await processClaim({ message: valid.message, signature: valid.signature, category: "Meta", toolName: "Proof of Tooling" }, d, true)).ok).toBe(true);
    const first = await claimRow();
    expect(first).toMatchObject({ status: "active", signedDate: "2026-10-07" });
    expect((await processClaim({ message: valid.message, signature: valid.signature }, d, true)).ok).toBe(true);
    expect(await getDb().select().from(claims).where(eq(claims.identity, CLI_IDENTITY))).toHaveLength(1);
  });

  it("keeps a rejected claim rejected: it cannot be resubmitted or withdrawn", async () => {
    const d = flowDeps();
    await processClaim({ message: valid.message, signature: valid.signature }, d, true);
    await getDb().update(claims).set({ status: "rejected" }).where(eq(claims.identity, CLI_IDENTITY));
    const again = await processClaim({ message: valid.message, signature: valid.signature }, d, true);
    expect(again.ok).toBe(false);
    expect(again.checks.at(-1)).toMatchObject({ id: "status", ok: false });
    const un = await processClaim({ message: unclaim.message, signature: unclaim.signature }, d, true);
    expect(un.ok).toBe(false);
    expect((await claimRow()).status).toBe("rejected");
  });

  it("the storage guard alone also keeps a rejected row rejected", async () => {
    const d = flowDeps();
    await processClaim({ message: valid.message, signature: valid.signature }, d, true);
    await getDb().update(claims).set({ status: "rejected" }).where(eq(claims.identity, CLI_IDENTITY));
    const saved = await d.saveClaim({ toolUrl: TOOL, identity: CLI_IDENTITY, cluster: "mainnet", message: valid.message, signature: valid.signature, signedDate: "2026-10-07", action: "claim" });
    expect(saved.status).toBe("rejected");
  });

  it("an unclaim signed the same day wins; the public claim signature cannot reactivate it", async () => {
    const d = flowDeps();
    await processClaim({ message: valid.message, signature: valid.signature }, d, true);
    expect((await processClaim({ message: unclaim.message, signature: unclaim.signature }, d, true)).ok).toBe(true);
    expect((await claimRow()).status).toBe("withdrawn");
    const replay = await processClaim({ message: valid.message, signature: valid.signature }, d, true);
    expect(replay.ok).toBe(false);
    expect(replay.checks.at(-1)).toMatchObject({ id: "date", ok: false });
    expect((await claimRow()).status).toBe("withdrawn");
  });

  it("an older signed message never overwrites a newer stored one", async () => {
    const d = flowDeps();
    await processClaim({ message: valid.message, signature: valid.signature }, d, true);
    const saved = await d.saveClaim({ toolUrl: TOOL, identity: CLI_IDENTITY, cluster: "mainnet", message: "older", signature: "1".repeat(64), signedDate: "2026-10-01", action: "unclaim" });
    expect(saved).toMatchObject({ status: "active", signedDate: "2026-10-07", message: valid.message });
  });
});

describe("web tools on MariaDB (A3)", () => {
  it("counts the identity's other web tools under the same registrable domain only", async () => {
    await resetDevDb();
    await seedDevData();
    const d = createClaimsDeps();
    const pk = V.pumpkin.identity;
    // Pumpkin signed watchtower and rugalert, both under pumpkinspool.com
    expect((await d.getHistory("pumpkinspool.com/another", pk)).sameDomainClaims).toBe(2);
    expect((await d.getHistory("pumpkinspool.com/watchtower", pk)).sameDomainClaims).toBe(1); // itself excluded
    expect((await d.getHistory("blog.pumpkinspool.com", pk)).sameDomainClaims).toBe(2); // subdomain, same domain
    expect((await d.getHistory("other-domain.com", pk)).sameDomainClaims).toBe(0);
    expect((await d.getHistory("pumpkinspool.com/another", V.quiet.identity)).sameDomainClaims).toBe(0);
  });
});

// ---- moderation (M9) ----

describe("moderation on MariaDB", () => {
  beforeEach(async () => {
    await resetDevDb();
    await seedDevData();
  });
  const okProof = { ...adminDbDeps, checkProof: async () => ({ id: "proof" as const, ok: true }) };
  const badProof = { ...adminDbDeps, checkProof: async () => ({ id: "proof" as const, ok: false, detail: "gone" }) };

  it("lists pending claims with an etag", async () => {
    const list = (await listPendingClaims()).items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ toolName: "New Tool", toolUrl: "github.com/blocklogic/new-tool", identity: V.blockLogic.identity });
    expect(list[0].etag).toMatch(/^[0-9a-f]{32}$/);
  });

  it("requires the etag, applies approve once, re-checks the proof and writes the audit trail", async () => {
    const [p] = (await listPendingClaims()).items;
    const before = await getStats();
    expect(await decideClaim(p.id, "approve", { actor: "rafa", ifMatch: null }, okProof)).toEqual({ ok: false, code: "precondition_required" });
    expect(await decideClaim(p.id, "approve", { actor: "rafa", ifMatch: "0".repeat(32) }, okProof)).toEqual({ ok: false, code: "precondition_failed" });
    expect(await decideClaim(p.id, "approve", { actor: "rafa", ifMatch: p.etag }, badProof)).toEqual({ ok: false, code: "proof_invalid", detail: "gone" });
    expect((await listPendingClaims()).items).toHaveLength(1); // nothing applied yet
    expect(await decideClaim(p.id, "approve", { actor: "rafa", ifMatch: p.etag }, okProof)).toEqual({ ok: true, id: p.id, status: "active" });
    expect(await decideClaim(p.id, "approve", { actor: "rafa", ifMatch: p.etag }, okProof)).toEqual({ ok: false, code: "not_found" });
    const after = await getStats();
    expect(after.toolsClaimed).toBe(before.toolsClaimed + 1);
    expect(after.toolsTotal).toBe(before.toolsTotal + 1);
    const log = await getDb().select().from(claimDecisions);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ claimId: p.id, decision: "approve", previousStatus: "pending", actor: "rafa" });
  });

  it("does not apply a decision if the claim changed after it was reviewed", async () => {
    const [p] = (await listPendingClaims()).items;
    await getDb().update(claims).set({ message: `${p.message} ` }).where(eq(claims.id, p.id));
    expect(await decideClaim(p.id, "reject", { actor: "a", ifMatch: p.etag }, okProof)).toEqual({ ok: false, code: "precondition_failed" });
    expect((await listPendingClaims()).items[0].id).toBe(p.id);
  });

  it("reject does not need the proof file and is audited", async () => {
    const [p] = (await listPendingClaims()).items;
    expect(await decideClaim(p.id, "reject", { actor: "rafa", ifMatch: p.etag }, badProof)).toEqual({ ok: true, id: p.id, status: "rejected" });
    expect((await getDb().select().from(claimDecisions))[0]).toMatchObject({ decision: "reject", actor: "rafa" });
    expect((await getRegistry()).entries.map((e) => e.tool.name)).not.toContain("New Tool");
  });
});

// ---- N1: transactional saveClaim ----

describe("saveClaim transaction (N1)", () => {
  beforeEach(async () => {
    await resetDevDb();
    await seedDevData();
  });
  const input = (over: Partial<Parameters<ReturnType<typeof createClaimsDeps>["saveClaim"]>[0]> = {}) => ({
    toolUrl: TOOL,
    identity: CLI_IDENTITY,
    cluster: "mainnet" as const,
    message: "m",
    signature: "s".repeat(64),
    signedDate: "2026-10-07",
    action: "claim" as const,
    category: "Meta" as const,
    toolName: "Proof of Tooling",
    ...over,
  });

  it("claim -> unclaim -> claim dated later: the owner can claim again", async () => {
    const d = createClaimsDeps();
    expect((await d.saveClaim(input({ message: "claim-1" }))).status).toBe("active");
    expect((await d.saveClaim(input({ message: "unclaim-1", action: "unclaim" }))).status).toBe("withdrawn");
    // a claim signed the same day loses against the unclaim...
    expect(await d.saveClaim(input({ message: "claim-same-day" }))).toMatchObject({ status: "withdrawn", message: "unclaim-1" });
    // ...but one signed later re-activates it and replaces message, signature and date
    const again = await d.saveClaim(input({ message: "claim-2", signature: "t".repeat(64), signedDate: "2026-10-08" }));
    expect(again).toMatchObject({ status: "active", message: "claim-2", signedDate: "2026-10-08", signature: "t".repeat(64) });
    const row = await claimRow();
    expect(row).toMatchObject({ status: "active", message: "claim-2", signedDate: "2026-10-08" });
    expect(await getDb().select().from(claims).where(eq(claims.identity, CLI_IDENTITY))).toHaveLength(1);
  });

  it("a later claim after an unclaim can also go to review (pending)", async () => {
    const d = createClaimsDeps();
    await d.saveClaim(input());
    await d.saveClaim(input({ action: "unclaim", message: "u" }));
    expect((await d.saveClaim(input({ signedDate: "2026-10-09", pending: true }))).status).toBe("pending");
  });

  it("older messages and rejected rows are kept as they are", async () => {
    const d = createClaimsDeps();
    await d.saveClaim(input({ message: "new", signedDate: "2026-10-08" }));
    expect(await d.saveClaim(input({ message: "old", signedDate: "2026-10-06", action: "unclaim" }))).toMatchObject({ status: "active", message: "new" });
    await getDb().update(claims).set({ status: "rejected" }).where(eq(claims.identity, CLI_IDENTITY));
    expect(await d.saveClaim(input({ message: "later", signedDate: "2026-10-20" }))).toMatchObject({ status: "rejected", message: "new" });
  });

  it("concurrent identical requests leave one consistent row", async () => {
    const d = createClaimsDeps();
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => d.saveClaim(input({ message: `m${i}` }))));
    expect(results.every((r) => r.status === "active")).toBe(true);
    expect(await getDb().select().from(claims).where(eq(claims.identity, CLI_IDENTITY))).toHaveLength(1);
    expect((await getDb().select().from(tools).where(eq(tools.url, TOOL)))).toHaveLength(1);
  });

  it("a claim and an unclaim racing on the same day always end withdrawn", async () => {
    const d = createClaimsDeps();
    await d.saveClaim(input({ message: "first" }));
    for (let i = 0; i < 5; i++) {
      await Promise.all([d.saveClaim(input({ message: `claim-${i}` })), d.saveClaim(input({ message: `unclaim-${i}`, action: "unclaim" }))]);
      expect((await claimRow()).status).toBe("withdrawn");
      await d.saveClaim(input({ message: `reset-${i}`, signedDate: `2026-10-${10 + i}` })); // a later claim re-activates
      expect((await claimRow()).status).toBe("active");
      await d.saveClaim(input({ message: `u-${i}`, action: "unclaim", signedDate: `2026-10-${10 + i}` }));
    }
  });

  it("gives tools with colliding slugs distinct slugs instead of failing", async () => {
    const d = createClaimsDeps();
    await d.saveClaim(input({ toolUrl: "example.com/a-b", toolName: "A", message: "1" }));
    await d.saveClaim(input({ toolUrl: "example.com/a/b", toolName: "B", message: "2" }));
    const slugs = (await getDb().select({ slug: tools.slug }).from(tools).where(sql`url LIKE 'example.com/%'`)).map((r) => r.slug);
    expect(slugs).toHaveLength(2);
    expect(new Set(slugs).size).toBe(2);
  });
});

// ---- N2: pending cap and admin pagination ----

describe("pending limit and pagination (N2)", () => {
  beforeEach(async () => {
    await resetDevDb();
    await seedDevData();
  });
  const save = (n: number, id: string = V.quiet.identity) =>
    createClaimsDeps().saveClaim({ toolUrl: `example${n}.com`, identity: id, cluster: "mainnet", message: `m${n}`, signature: "s".repeat(64), signedDate: "2026-10-07", action: "claim", pending: true, toolName: `T${n}`, category: "Library" });

  it("allows 3 pending claims per identity and refuses the 4th, atomically under concurrency", async () => {
    const { PendingLimitError } = await import("@/lib/claims-service");
    const results = await Promise.allSettled([1, 2, 3, 4, 5, 6].map((n) => save(n)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(failed).toHaveLength(3);
    for (const f of failed) expect(f.reason).toBeInstanceOf(PendingLimitError);
    const n = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM claims WHERE identity = ${V.quiet.identity} AND status = 'pending'`);
    expect(Number(n[0].n)).toBe(3);
    // failed attempts leave no orphan tools behind
    const orphan = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM tools WHERE url LIKE 'example%.com'`);
    expect(Number(orphan[0].n)).toBe(3);
  });

  it("the limit is per identity, ignores re-sending the same pending claim, and frees up after a decision", async () => {
    for (const n of [1, 2, 3]) await save(n);
    await expect(save(4)).rejects.toThrow("pending claim limit reached");
    await expect(save(1)).resolves.toMatchObject({ status: "pending" }); // same claim again: no new slot needed
    await expect(save(7, V.laine.identity)).resolves.toMatchObject({ status: "pending" }); // another identity
    const first = (await listPendingClaims()).items.find((i) => i.identity === V.quiet.identity)!;
    await decideClaim(first.id, "reject", { actor: "t", ifMatch: first.etag }, { ...adminDbDeps, checkProof: async () => ({ id: "proof" as const, ok: true }) });
    await expect(save(4)).resolves.toMatchObject({ status: "pending" });
  });

  it("paginates the pending list oldest first, with the total", async () => {
    for (const n of [1, 2, 3]) await save(n);
    for (const n of [4, 5]) await save(n, V.laine.identity);
    const all = await listPendingClaims();
    expect(all).toMatchObject({ total: 6, limit: 50, offset: 0 }); // 5 above + Block Logic's from the dev data
    const page = await listPendingClaims({ limit: 2, offset: 1 });
    expect(page).toMatchObject({ total: 6, limit: 2, offset: 1 });
    expect(page.items.map((i) => i.id)).toEqual(all.items.slice(1, 3).map((i) => i.id));
    expect((await listPendingClaims({ limit: 1000 })).limit).toBe(100);
    expect((await listPendingClaims({ limit: 0, offset: -5 }))).toMatchObject({ limit: 1, offset: 0 });
    expect((await listPendingClaims({ offset: 100 })).items).toEqual([]);
  });
});
