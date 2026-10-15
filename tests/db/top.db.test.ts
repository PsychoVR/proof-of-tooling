import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { DEV_VALIDATORS as V, resetDevDb, seedDevData } from "@/db/dev-data";
import { claims, topSnapshots, tools } from "@/db/schema";
import { runReverify } from "@/jobs/reverify";
import { getNewThisMonth, getSnapshot, getTopBoard, listSnapshots, saveMonthlySnapshot } from "@/lib/top-queries";

let n = 0;
/** Gives an identity an extra tool with a claim in the given status, verified at `at`. */
async function addClaim(identity: string, at: string, status: "active" | "stale" | "pending" = "active") {
  const i = ++n;
  const [t] = await getDb().insert(tools).values({ slug: `top-${i}`, url: `top${i}.example.com`, name: `Top ${i}`, category: "Library", kind: "web" }).$returningId();
  await getDb().insert(claims).values({ toolId: t.id, identity, cluster: "mainnet", message: `m${i}`, signature: "s", signedDate: "2026-09-01", status, verifiedAt: new Date(at) });
}

beforeEach(async () => {
  n = 0;
  await resetDevDb();
  await seedDevData();
});
afterAll(async () => {
  await resetDevDb();
  await seedDevData();
});

describe("getTopBoard", () => {
  it("is hidden below 5 validators with active claims, and only active claims count", async () => {
    // Dev data: Overclock (1) and Pumpkin (2) are active, Laine is stale, Block Logic pending.
    await addClaim(V.validBlocks.identity, "2026-10-01T00:00:00Z", "pending");
    await addClaim(V.quiet.identity, "2026-10-01T00:00:00Z", "stale");
    const hidden = await getTopBoard();
    expect(hidden).toMatchObject({ visible: false, validatorsWithClaims: 2, entries: [] });
    await addClaim(V.validBlocks.identity, "2026-10-01T00:00:00Z");
    await addClaim(V.quiet.identity, "2026-10-01T00:00:00Z");
    expect((await getTopBoard()).visible).toBe(false); // 4 validators
    await addClaim(V.laine.identity, "2026-10-01T00:00:00Z");
    expect(await getTopBoard()).toMatchObject({ visible: true, validatorsWithClaims: 5 });
  });

  it("ranks by tools, breaks ties by the first claim and never counts unclaimed tools", async () => {
    await addClaim(V.validBlocks.identity, "2026-10-01T00:00:00Z");
    await addClaim(V.validBlocks.identity, "2026-10-02T00:00:00Z");
    await addClaim(V.validBlocks.identity, "2026-10-03T00:00:00Z");
    await addClaim(V.quiet.identity, "2020-01-01T00:00:00Z"); // 1 tool, signed before Overclock
    await addClaim(V.laine.identity, "2026-10-04T00:00:00Z"); // 1 tool, signed last
    await getDb().update(claims).set({ verifiedAt: new Date("2026-10-02T00:00:00Z") }).where(eq(claims.identity, V.overclock.identity));
    await getDb().update(claims).set({ verifiedAt: new Date("2026-10-01T00:00:00Z") }).where(eq(claims.identity, V.pumpkin.identity));
    const board = await getTopBoard();
    expect(board.entries.map((e) => [e.rank, e.identity, e.toolCount])).toEqual([
      [1, V.validBlocks.identity, 3],
      [2, V.pumpkin.identity, 2],
      [3, V.quiet.identity, 1],
      [4, V.overclock.identity, 1],
      [5, V.laine.identity, 1],
    ]);
    // dev data also holds unclaimed seed tools: they never appear in anybody's count
    expect(board.entries.reduce((s, e) => s + e.toolCount, 0)).toBe(8);
    // icon and stake badges come with the live entries
    const pumpkin = board.entries.find((e) => e.identity === V.pumpkin.identity)!;
    expect(pumpkin.iconUrl).toContain(V.pumpkin.identity);
    expect(pumpkin.pools.length).toBeGreaterThan(0);
  });
});

describe("getNewThisMonth", () => {
  it("lists the active claims of the current UTC month with their validator, newest first", async () => {
    const now = new Date("2026-10-20T12:00:00Z");
    await getDb().update(claims).set({ verifiedAt: new Date("2026-09-01T00:00:00Z") });
    await addClaim(V.quiet.identity, "2026-09-30T23:59:00Z");
    await addClaim(V.quiet.identity, "2026-10-02T00:00:00Z");
    await addClaim(V.laine.identity, "2026-10-10T00:00:00Z");
    await addClaim(V.laine.identity, "2026-10-11T00:00:00Z", "pending");
    const items = await getNewThisMonth(now);
    expect(items.map((i) => [i.toolName, i.validatorName])).toEqual([["Top 3", "Laine"], ["Top 2", "Quiet Validator"]]);
  });
});

describe("monthly snapshot", () => {
  async function fiveBuilders() {
    for (const [v, k] of [[V.validBlocks, 3], [V.quiet, 2], [V.laine, 1]] as const) {
      for (let i = 0; i < k; i++) await addClaim(v.identity, `2026-10-0${i + 1}T00:00:00Z`);
    }
    await getDb().update(claims).set({ verifiedAt: new Date("2026-10-05T00:00:00Z") });
  }

  it("is saved on day 1 for the previous month, only once, and not on other days", async () => {
    await fiveBuilders();
    expect(await saveMonthlySnapshot(new Date("2026-11-02T00:10:00Z"))).toBe("skipped");
    expect(await listSnapshots()).toEqual([]);
    expect(await saveMonthlySnapshot(new Date("2026-11-01T00:10:00Z"))).toBe("saved");
    expect(await saveMonthlySnapshot(new Date("2026-11-01T06:00:00Z"))).toBe("exists");
    const snap = await getSnapshot("2026-10");
    expect(snap).toMatchObject({ month: "2026-10", validators: 5 });
    expect(snap!.entries.map((e) => [e.rank, e.toolCount])).toEqual([[1, 3], [2, 2], [3, 2], [4, 1], [5, 1]]);
    expect(snap!.entries[0].name).toBe("Valid Blocks");
    expect((await listSnapshots())[0]).toMatchObject({ month: "2026-10", winner: { name: "Valid Blocks", toolCount: 3 } });
  });

  it("does not change when claims change later, and ignores claims made after the month ended", async () => {
    await fiveBuilders();
    await addClaim(V.laine.identity, "2026-11-01T00:05:00Z"); // verified after the month closed
    await saveMonthlySnapshot(new Date("2026-11-01T00:10:00Z"));
    const before = await getSnapshot("2026-10");
    expect(before!.entries.find((e) => e.name === "Laine")!.toolCount).toBe(1);
    await getDb().update(claims).set({ status: "withdrawn" }).where(eq(claims.identity, V.validBlocks.identity));
    await addClaim(V.laine.identity, "2026-11-10T00:00:00Z");
    await addClaim(V.blockLogic.identity, "2026-11-10T00:00:00Z"); // a fifth validator for November
    expect(await saveMonthlySnapshot(new Date("2026-12-01T00:10:00Z"))).toBe("saved"); // November is a new month
    expect(await getSnapshot("2026-10")).toEqual(before);
    expect((await getSnapshot("2026-11"))!.entries[0].name).not.toBe("Valid Blocks");
  });

  it("saves nothing when fewer than 5 validators had claims", async () => {
    expect(await saveMonthlySnapshot(new Date("2026-11-01T00:10:00Z"))).toBe("skipped");
    expect(await getDb().select().from(topSnapshots)).toHaveLength(0);
  });

  it("is taken by the daily verification job on day 1 and reported once", async () => {
    await fiveBuilders();
    const deps = { listActive: async () => [], check: async () => ({ id: "proof" as const, ok: true }), prune: async () => 0, now: () => new Date("2026-11-01T00:10:00Z") } as never;
    expect((await runReverify(deps)).snapshot).toBe("saved");
    expect((await runReverify(deps)).snapshot).toBeUndefined();
    expect((await getSnapshot("2026-10"))!.entries).toHaveLength(5);
  });
});
