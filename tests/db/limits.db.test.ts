import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { DEV_VALIDATORS as V, resetDevDb, seedDevData } from "@/db/dev-data";
import { claims, tools } from "@/db/schema";
import { createClaimsDeps } from "@/lib/claims-deps";
import { RuleRejectedError, ToolQuotaError, UnknownValidatorError } from "@/lib/claims-service";
import { MAX_TOOLS_CREATED_PER_IDENTITY } from "@/lib/claims";

const now = new Date("2026-10-07T12:00:00Z");
const healthy = { isPrivate: false, archived: false, isFork: false, commitCount: 40, ownCommits: 40, createdAt: "2026-01-01T00:00:00Z" };
const base = { cluster: "mainnet" as const, signature: "s".repeat(64), signedDate: "2026-10-07", action: "claim" as const, category: "Library" as const };
const save = (toolUrl: string, identity: string, over: Record<string, unknown> = {}) =>
  createClaimsDeps().saveClaim({ ...base, toolUrl, identity, message: `m-${toolUrl}`, toolName: toolUrl, ...over });
const status = async (url: string, identity: string) =>
  (await getDb().select({ s: claims.status }).from(claims).innerJoin(tools, eq(tools.id, claims.toolId)).where(and(eq(tools.url, url), eq(claims.identity, identity))))[0]?.s;

beforeEach(async () => {
  await resetDevDb();
  await seedDevData();
});
afterAll(async () => {
  await resetDevDb();
  await seedDevData();
});

describe("storage guards", () => {
  it("V2: an identity that is not in validators stores nothing, not even a tool", async () => {
    await expect(save("ghost.example.com", "1".repeat(43))).rejects.toBeInstanceOf(UnknownValidatorError);
    expect(await getDb().select().from(tools).where(eq(tools.url, "ghost.example.com"))).toHaveLength(0);
  });

  it("V3: the rules are re-evaluated inside the transaction (a repo that fails them is refused)", async () => {
    await expect(save("github.com/o/priv", V.quiet.identity, { recheck: { now, repo: { ...healthy, isPrivate: true } } })).rejects.toBeInstanceOf(RuleRejectedError);
    expect(await getDb().select().from(tools).where(eq(tools.url, "github.com/o/priv"))).toHaveLength(0);
    await expect(save("github.com/o/norepo", V.quiet.identity, { recheck: { now } })).rejects.toThrow("repository metadata");
    // a young repo is not refused but goes to review
    expect(await save("github.com/o/young", V.quiet.identity, { recheck: { now, repo: { ...healthy, createdAt: "2026-10-05T00:00:00Z" } } })).toMatchObject({ status: "pending" });
  });

  it("V4: an identity can create at most 20 tools through claims; unclaiming frees nothing; other tools are still claimable", async () => {
    const id = V.laine.identity;
    for (let i = 0; i < MAX_TOOLS_CREATED_PER_IDENTITY; i++) await save(`t${i}.example.com`, id);
    await expect(save("t-over.example.com", id)).rejects.toBeInstanceOf(ToolQuotaError);
    await save("t0.example.com", id, { action: "unclaim", signedDate: "2026-10-08" });
    await expect(save("t-over.example.com", id)).rejects.toBeInstanceOf(ToolQuotaError);
    expect(await getDb().select().from(tools).where(eq(tools.url, "t-over.example.com"))).toHaveLength(0);
    // claiming a tool somebody else created, or a seeded one, creates nothing and is allowed
    await save("t1.example.com", V.quiet.identity);
    await expect(save("t1.example.com", id)).resolves.toMatchObject({ status: "active" });
    const [{ url }] = await getDb().select({ url: tools.url }).from(tools).where(eq(tools.slug, "watchtower"));
    await expect(save(url, id)).resolves.toMatchObject({ status: "active" });
    // another identity is unaffected
    await expect(save("t-over.example.com", V.quiet.identity)).resolves.toMatchObject({ status: "active" });
  });

  it("N6: ten claims under one domain across identities, then new ones go to review", async () => {
    const ids = [V.pumpkin, V.validBlocks, V.overclock, V.laine].map((v) => v.identity);
    for (let i = 0; i < 12; i++) await save(`t${i}.big.example.org`, ids[i % 4], { recheck: { now } });
    const s = await Promise.all(Array.from({ length: 12 }, (_, i) => status(`t${i}.big.example.org`, ids[i % 4])));
    expect(s.filter((x) => x === "active")).toHaveLength(10);
    expect(s.filter((x) => x === "pending")).toHaveLength(2);
  });

  it("N6: an identity with 25 active claims sends the next one to review", async () => {
    const id = V.quiet.identity;
    for (let i = 0; i < 26; i++) await getDb().insert(tools).values({ slug: `bulk-${i}`, url: `bulk${i}.other${i}.com`, name: "B", category: "Library", kind: "web" });
    const bulk = await getDb().select({ id: tools.id }).from(tools).where(sql`url LIKE 'bulk%'`).orderBy(tools.id);
    for (const t of bulk.slice(0, 25)) await getDb().insert(claims).values({ toolId: t.id, identity: id, cluster: "mainnet", message: "m", signature: "s", signedDate: "2026-09-01", status: "active", verifiedAt: new Date("2026-09-01T00:00:00Z") });
    expect(await save("bulk25.other25.com", id, { recheck: { now } })).toMatchObject({ status: "pending" });
  });
});

describe("findValidatorCluster ignores stale validators (B5)", () => {
  it("returns the cluster for a fresh row and null once the row is older than 3 days", async () => {
    const d = createClaimsDeps();
    expect(await d.findValidatorCluster(V.quiet.identity)).toBe("mainnet");
    await getDb().execute(sql`UPDATE validators SET updated_at = NOW() - INTERVAL 4 DAY WHERE identity = ${V.quiet.identity}`);
    expect(await d.findValidatorCluster(V.quiet.identity)).toBeNull();
    await getDb().execute(sql`UPDATE validators SET updated_at = NOW() - INTERVAL 2 DAY WHERE identity = ${V.quiet.identity}`);
    expect(await d.findValidatorCluster(V.quiet.identity)).toBe("mainnet");
  });
});

describe("pruneOrphanTools and the failure counter (V4, B6)", () => {
  it("removes only old tools with no seed entry, claim or endorsement", async () => {
    const { pruneOrphanTools } = await import("@/jobs/prune");
    const mk = (slug: string) => getDb().insert(tools).values({ slug, url: `${slug}.example.com`, name: slug, category: "Library", kind: "web" });
    for (const s of ["orphan-old", "orphan-new", "claimed-old"]) await mk(s);
    await getDb().execute(sql`UPDATE tools SET created_at = NOW() - INTERVAL 3 DAY WHERE slug IN ('orphan-old', 'claimed-old')`);
    await save("claimed-old.example.com", V.quiet.identity);
    expect(await pruneOrphanTools(new Date())).toBe(1);
    const left = (await getDb().select({ slug: tools.slug }).from(tools).where(sql`url LIKE '%.example.com'`)).map((r) => r.slug).sort();
    expect(left).toEqual(["claimed-old", "orphan-new"]);
    expect(await getDb().select().from(tools).where(eq(tools.slug, "watchtower"))).toHaveLength(1);
  });

  it("runReverify with the real writers: counts failures, resets on success, stale on the second, ignores network errors", async () => {
    const { runReverify, ProofUnreachableError } = await import("@/jobs/reverify");
    await save("rv.example.com", V.quiet.identity);
    const row = async () => (await getDb().select().from(claims).where(eq(claims.identity, V.quiet.identity)))[0];
    const fail = async () => ({ id: "proof" as const, ok: false });
    const pass = async () => ({ id: "proof" as const, ok: true });
    const down = async () => {
      throw new ProofUnreachableError("down");
    };

    await runReverify({ check: fail, prune: async () => 0 });
    expect(await row()).toMatchObject({ status: "active", failures: 1 });
    await runReverify({ check: down, prune: async () => 0 });
    expect(await row()).toMatchObject({ status: "active", failures: 1 });
    await runReverify({ check: pass, prune: async () => 0 });
    expect(await row()).toMatchObject({ status: "active", failures: 0 });
    await runReverify({ check: fail, prune: async () => 0 });
    await runReverify({ check: fail, prune: async () => 0 });
    expect(await row()).toMatchObject({ status: "stale", failures: 2 });
  });
});
