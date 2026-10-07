import { sql } from "drizzle-orm";
import { validators as validatorsTable } from "@/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { CLI_IDENTITY, DEV_VALIDATORS as V, resetDevDb, seedDevData } from "@/db/dev-data";
import { decideClaim } from "@/lib/admin-claims";
import { getLeaderboard, getRegistry, getStats, getToolBySlug, getTools, getValidatorProfile } from "@/lib/queries";

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
    const [rows] = await getDb().execute(sql`SELECT VERSION() AS v`);
    expect(String((rows as unknown as { v: string }[])[0].v)).toMatch(/^(5\.5\.5-)?11\.8\..*MariaDB|^11\.8\./);
  });
});

describe("getStats", () => {
  it("counts only active claims as claimed and never pending", async () => {
    const s = await getStats();
    expect(s).toMatchObject({ toolsTotal: 7, toolsClaimed: 1, toolsUnclaimed: 6, validatorsWithTools: 1, validatorsTotal: 7 });
    expect(Object.values(s.byCategory).reduce((a, b) => a + b, 0)).toBe(7);
    expect(s.byCategory.Explorer).toBe(3);
    expect(s.byCategory.Library).toBe(0); // the pending-only tool is not counted
  });
});

describe("getLeaderboard", () => {
  it("lists validators with a claim or a name-matched seed, ranked by tool count then stake", async () => {
    const lb = await getLeaderboard({});
    expect(lb.total).toBe(5);
    expect(lb.items.map((r) => r.validator.name)).toEqual(["Pumpkin's Pool", "Valid Blocks", "Overclock", "Laine", "Block Logic"]);
    const byName: Record<string, (typeof lb.items)[number]> = Object.fromEntries(lb.items.map((r) => [r.validator.name ?? "", r]));
    expect(byName["Pumpkin's Pool"].toolCount).toBe(2);
    expect(byName["Overclock"].tools.map((t) => t.status)).toEqual(["signed"]);
    expect(byName["Overclock"].claimedCount).toBe(1);
    expect(byName["Laine"].tools.map((t) => t.status)).toEqual(["stale"]);
    // pending claims never count: Block Logic only shows its seeded tool
    expect(byName["Block Logic"].tools.map((t) => [t.name, t.status])).toEqual([["validators.app", "unclaimed"]]);
    expect(lb.items[0].validator.activatedStake).toBe("900000000000000");
  });

  it("excludes validators without tools and filters by cluster", async () => {
    const names = (await getLeaderboard({})).items.map((r) => r.validator.name);
    expect(names).not.toContain("Quiet Validator");
    expect(names).not.toContain("SunshineVR");
    expect((await getLeaderboard({ cluster: "testnet" })).total).toBe(0); // not enabled in phase 1
    expect((await getLeaderboard({ cluster: "mainnet" })).total).toBe(5);
  });

  it("paginates", async () => {
    const p = await getLeaderboard({ page: 2, pageSize: 2 });
    expect(p).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(p.items.map((r) => r.validator.name)).toEqual(["Overclock", "Laine"]);
  });
});

describe("getValidatorProfile", () => {
  it("works for a validator with no tools", async () => {
    const p = await getValidatorProfile(V.quiet.identity);
    expect(p?.validator.name).toBe("Quiet Validator");
    expect(p?.tools).toEqual([]);
  });

  it("returns null for unknown identities", async () => {
    expect(await getValidatorProfile("1".repeat(44))).toBeNull();
  });

  it("shows seeded, signed and pending tools with owners", async () => {
    const oc = await getValidatorProfile(V.overclock.identity);
    expect(oc?.tools).toHaveLength(1);
    expect(oc?.tools[0]).toMatchObject({ name: "Mithril", status: "claimed", owner: { identity: V.overclock.identity } });
    const bl = await getValidatorProfile(V.blockLogic.identity);
    const names = bl?.tools.map((t) => [t.name, t.status, t.claims.map((c) => c.status)]);
    expect(names).toContainEqual(["New Tool", "unclaimed", ["pending"]]);
    expect(names).toContainEqual(["validators.app", "unclaimed", []]);
    expect((await getValidatorProfile(V.pumpkin.identity))?.tools.map((t) => t.owner)).toEqual([
      { name: "Pumpkin's Pool", identity: null },
      { name: "Pumpkin's Pool", identity: null },
    ]);
  });

  it("includes endorsements", async () => {
    expect((await getValidatorProfile(V.pumpkin.identity))?.endorsements).toHaveLength(1);
  });

  it("resolves the identity used by the CLI fixtures as a mainnet validator", async () => {
    expect((await getValidatorProfile(CLI_IDENTITY))?.validator.cluster).toBe("mainnet");
  });

  it("ignores validators of clusters that are not enabled", async () => {
    const ghost = "G".repeat(44);
    await getDb().insert(validatorsTable).values({ identity: ghost, cluster: "testnet", voteAccount: "H".repeat(44), name: "Pumpkin's Pool", activatedStake: BigInt(1) });
    try {
      expect(await getValidatorProfile(ghost)).toBeNull();
      const lb = await getLeaderboard({});
      expect(lb.total).toBe(5);
      expect(lb.items.every((r) => r.validator.cluster === "mainnet")).toBe(true);
      expect((await getStats()).validatorsTotal).toBe(7);
    } finally {
      await getDb().execute(sql`DELETE FROM validators WHERE identity = ${ghost}`);
    }
  });
});

describe("getTools / getToolBySlug", () => {
  it("filters by category and status", async () => {
    expect((await getTools({ category: "Explorer" })).map((t) => t.name).sort()).toEqual(["Alpenglow Explorer", "Stakewiz", "validators.app"]);
    expect((await getTools({ status: "claimed" })).map((t) => t.name)).toEqual(["Mithril"]);
    expect(await getTools({ status: "unclaimed" })).toHaveLength(6);
    expect((await getTools({})).map((x) => x.name)).not.toContain("New Tool");
  });

  it("finds a tool by slug with its canonical url", async () => {
    const t = await getToolBySlug("mithril");
    expect(t).toMatchObject({ name: "Mithril", url: "github.com/Overclock-Validator/mithril", kind: "repo", status: "claimed" });
    expect(await getToolBySlug("nope")).toBeNull();
  });
});

describe("getRegistry", () => {
  it("lists active and stale claims only", async () => {
    const r = await getRegistry();
    expect(r.entries.map((e) => [e.tool.name, e.status]).sort()).toEqual([["Mithril", "active"], ["Stakewiz", "stale"]]);
  });
});

describe("seedUnclaimed against MariaDB", () => {
  it("is idempotent and leaves existing tools untouched", async () => {
    const { seedUnclaimed } = await import("@/lib/seed");
    // the dev data already contains every seed tool and entry
    expect(await seedUnclaimed()).toEqual({ tools: 7, newTools: 0, newEntries: 0 });
    await resetDevDb();
    expect(await seedUnclaimed()).toEqual({ tools: 7, newTools: 7, newEntries: 7 });
    expect(await seedUnclaimed()).toEqual({ tools: 7, newTools: 0, newEntries: 0 });
    await resetDevDb();
    await seedDevData();
  });
});

describe("moderation", () => {
  it("approving a pending claim makes it count; a second decision is a no-op", async () => {
    const before = await getStats();
    const [rows] = await getDb().execute(sql`SELECT id FROM claims WHERE status = 'pending'`);
    const id = (rows as unknown as { id: number }[])[0].id;
    expect(await decideClaim(id, "approve")).toBe(true);
    expect(await decideClaim(id, "reject")).toBe(false);
    const after = await getStats();
    expect(after.toolsClaimed).toBe(before.toolsClaimed + 1);
    expect(after.toolsTotal).toBe(before.toolsTotal + 1);
    expect((await getRegistry()).entries.map((e) => e.tool.name)).toContain("New Tool");
  });
});
