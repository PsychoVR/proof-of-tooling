import bs58 from "bs58";
import { describe, expect, it, vi } from "vitest";
import {
  CATCH_UP_MS,
  DAILY_BELOW,
  MAX_PER_RUN,
  modeFor,
  refreshPoolsFor,
  runPools,
  selectDue,
  slotOf,
  todaySlot,
  type PoolsDeps,
  type PoolTarget,
} from "@/jobs/pools";
import { approvedToPools, logoPathFor, LOGO_ID_RE, poolMetaMap } from "@/lib/pool-registry";
import { buildAuthorityIndex } from "@/lib/solana/stake-pools";

const id = (n: number) => bs58.encode(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? n % 256 : i === 1 ? n >> 8 : 7)));
const targets = (n: number, scannedAt: Date | null = null): PoolTarget[] =>
  Array.from({ length: n }, (_, i) => ({ identity: id(i + 1), voteAccount: `vote${i + 1}`, scannedAt }));
// 2026-10-08 12:00 UTC
const NOW = new Date("2026-10-08T12:00:00Z");
const H = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("scheduling", () => {
  it("is daily below 50 verified validators and weekly from 50", () => {
    expect(DAILY_BELOW).toBe(50);
    expect(modeFor(0)).toBe("daily");
    expect(modeFor(49)).toBe("daily");
    expect(modeFor(50)).toBe("weekly");
  });

  it("slots are stable, in 0..6 and spread evenly over many identities", () => {
    expect(slotOf(id(1))).toBe(slotOf(id(1)));
    const counts = new Array(7).fill(0);
    for (let i = 0; i < 2100; i++) counts[slotOf(id(i))]++;
    for (const c of counts) {
      expect(c).toBeGreaterThan(220);
      expect(c).toBeLessThan(380);
    }
  });

  it("today's slot advances one per day and wraps after seven", () => {
    const d = (day: number) => new Date(Date.UTC(2026, 9, day, 3));
    const slots = [8, 9, 10, 11, 12, 13, 14].map((day) => todaySlot(d(day)));
    expect(new Set(slots).size).toBe(7);
    expect(todaySlot(d(15))).toBe(slots[0]);
  });

  it("daily mode scans everyone not scanned in the last 20 hours, never-scanned first then oldest", () => {
    const t = targets(4);
    t[0].scannedAt = ago(5 * H); // too recent
    t[1].scannedAt = ago(30 * H);
    t[2].scannedAt = ago(50 * H);
    // t[3] never scanned
    const { mode, due } = selectDue(t, NOW);
    expect(mode).toBe("daily");
    expect(due.map((x) => x.identity)).toEqual([t[3].identity, t[2].identity, t[1].identity]);
  });

  it("weekly mode scans one seventh per day, deterministic, and every validator exactly once a week", () => {
    const all = targets(70, ago(40 * H));
    const week = Array.from({ length: 7 }, (_, d) => new Date(Date.UTC(2026, 9, 5 + d, 12)));
    const picked = week.map((day) => selectDue(all.map((t) => ({ ...t, scannedAt: new Date(day.getTime() - 40 * H) })), day).due.map((x) => x.identity));
    expect(selectDue(all, week[0]).mode).toBe("weekly");
    const flat = picked.flat();
    expect(flat.length).toBe(70);
    expect(new Set(flat).size).toBe(70);
    expect(picked.every((p) => p.length > 0 && p.length < 25)).toBe(true);
    const again = selectDue(all.map((t) => ({ ...t, scannedAt: new Date(week[2].getTime() - 40 * H) })), week[2]);
    expect(again.due.map((x) => x.identity)).toEqual(picked[2]);
  });

  it("weekly mode also takes never-scanned validators, those that missed their day, and respects the 20 h guard", () => {
    const all = targets(60, ago(2 * H)); // all scanned two hours ago
    expect(selectDue(all, NOW).due).toEqual([]);
    const fresh = targets(60, ago(2 * H));
    fresh[0].scannedAt = null;
    expect(selectDue(fresh, NOW).due.map((x) => x.identity)).toContain(fresh[0].identity);
    const stale = targets(60, ago(2 * H));
    const mine = stale.find((t) => slotOf(t.identity) !== todaySlot(NOW))!;
    mine.scannedAt = new Date(NOW.getTime() - CATCH_UP_MS - H);
    expect(selectDue(stale, NOW).due.map((x) => x.identity)).toEqual([mine.identity]);
  });

  it("caps a run at MAX_PER_RUN, oldest first", () => {
    const t = targets(40).map((x, i) => ({ ...x, scannedAt: ago((100 + i) * H) }));
    expect(MAX_PER_RUN).toBe(50);
    expect(selectDue(t, NOW, 10).due.map((x) => x.identity)).toEqual(t.slice(30).reverse().map((x) => x.identity));
    const never = targets(80); // 80 never-scanned: the weekly rule still lets all of them through, the cap trims them
    expect(selectDue(never, NOW).due).toHaveLength(50);
  });
});

function makeDeps(over: Partial<PoolsDeps> = {}, t: PoolTarget[] = targets(3)) {
  const saved: { identity: string; pools: string[]; epoch: number }[] = [];
  const runs = new Map<string, Date>();
  const deps: PoolsDeps = {
    now: () => NOW,
    targets: async () => t,
    approvedPools: async () => [],
    epoch: async () => 1052,
    scan: async () => [{ poolId: "jito", lamports: 500_000_000_000n }],
    saveScan: async (identity, pools, epoch) => {
      saved.push({ identity, pools: pools.map((p) => p.poolId), epoch });
    },
    lastRun: async (n) => runs.get(n) ?? null,
    markRun: async (n) => void runs.set(n, NOW),
    discover: async () => [],
    saveCandidates: async (l) => l.length,
    fetchSfdp: async (ids) => new Set([ids[0]]),
    saveSfdp: async () => {},
    remove: async () => 0,
    ...over,
  };
  return { deps, saved, runs };
}

describe("runPools", () => {
  it("scans due validators, records them, and runs discovery and SFDP when due", async () => {
    const discover = vi.fn(async (program: string) => [
      { program, pool: `p-${program.slice(0, 4)}`, poolMint: "m", validatorList: "v", withdrawAuthority: "w" },
    ]);
    const saveSfdp = vi.fn(async () => {});
    const { deps, saved } = makeDeps({ discover, saveSfdp });
    const r = await runPools(deps);
    expect(r).toMatchObject({ mode: "daily", verified: 3, due: 3, scanned: 3, failed: 0, withPools: 3, deferred: 0, epochError: false });
    expect(saved.map((s) => s.epoch)).toEqual([1052, 1052, 1052]);
    expect(discover).toHaveBeenCalledTimes(3);
    expect(r.discovery).toEqual({ programs: 3, found: 3, added: 3 });
    expect(r.sfdp).toEqual({ participants: 1, ok: true });
    expect(saveSfdp).toHaveBeenCalledWith(expect.any(Array), expect.any(Set));
  });

  it("does the weekly and daily extras only when their time has come", async () => {
    const { deps, runs } = makeDeps();
    runs.set("pool-discovery", ago(2 * 24 * H));
    runs.set("sfdp", ago(5 * H));
    const r = await runPools(deps);
    expect(r.discovery).toBeNull();
    expect(r.sfdp).toBeNull();
    runs.set("pool-discovery", ago(7 * 24 * H));
    runs.set("sfdp", ago(21 * H));
    const r2 = await runPools(deps);
    expect(r2.discovery).not.toBeNull();
    expect(r2.sfdp).not.toBeNull();
  });

  it("one failing validator does not stop the rest and keeps its previous data", async () => {
    const t = targets(3);
    const { deps, saved } = makeDeps(
      {
        scan: async (vote) => {
          if (vote === "vote2") throw new Error("RPC getProgramAccounts failed: HTTP 429");
          return [];
        },
      },
      t,
    );
    const r = await runPools(deps);
    expect(r).toMatchObject({ scanned: 2, failed: 1, withPools: 0 });
    expect(saved.map((s) => s.identity).sort()).toEqual([t[0].identity, t[2].identity].sort());
  });

  it("a failed save also counts as a failure and does not abort the run", async () => {
    const { deps } = makeDeps({
      saveScan: vi.fn(async () => {
        throw new Error("db");
      }),
    });
    expect(await runPools(deps)).toMatchObject({ scanned: 0, failed: 3 });
  });

  it("an epoch error skips the scans without throwing", async () => {
    const scan = vi.fn(async () => []);
    const { deps } = makeDeps({
      epoch: async () => {
        throw new Error("rpc down");
      },
      scan,
    });
    const r = await runPools(deps);
    expect(r).toMatchObject({ epochError: true, scanned: 0 });
    expect(scan).not.toHaveBeenCalled();
    expect(r.sfdp).not.toBeNull();
  });

  it("makes no RPC call when nothing is due", async () => {
    const epoch = vi.fn(async () => 1);
    const { deps } = makeDeps({ epoch }, targets(3, ago(H)));
    await runPools(deps);
    expect(epoch).not.toHaveBeenCalled();
  });

  it("passes the approved pools of the database into the authority index", async () => {
    let seen: ReturnType<typeof buildAuthorityIndex> | undefined;
    const { deps } = makeDeps({
      approvedPools: async () => [
        { id: "extra", name: "Extra", logo: "/pools/extra.png", authorities: [{ kind: "address", address: "WithdrawerX", role: "withdrawer" }] },
      ],
      scan: async (_v, index) => {
        seen = index;
        return [];
      },
    });
    await runPools(deps);
    expect(seen!.withdrawers.get("WithdrawerX")).toBe("extra");
    expect(seen!.withdrawers.get("6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS")).toBe("jito");
  });

  it("discovery errors on one program keep the others; all failing keeps the schedule open", async () => {
    const saveCandidates = vi.fn(async (l: unknown[]) => l.length);
    const { deps } = makeDeps({
      discover: async (program) => {
        if (program.startsWith("SP12")) throw new Error("boom");
        return [{ program, pool: "p", poolMint: "m", validatorList: "v", withdrawAuthority: "w" }];
      },
      saveCandidates,
    });
    expect((await runPools(deps)).discovery).toEqual({ programs: 2, found: 2, added: 2 });
    const bad = makeDeps({
      discover: async () => {
        throw new Error("x");
      },
      saveCandidates,
    });
    const r = await runPools(bad.deps);
    expect(r.discovery).toEqual({ programs: 0, found: 0, added: 0 });
    expect(bad.runs.has("pool-discovery")).toBe(false);
  });

  it("when the SFDP list cannot be read the previous value is kept and the failure is reported", async () => {
    const saveSfdp = vi.fn(async () => {});
    const { deps } = makeDeps({ fetchSfdp: async () => null, saveSfdp });
    const r = await runPools(deps);
    expect(r.sfdp).toEqual({ participants: 0, ok: false });
    expect(saveSfdp).toHaveBeenCalledWith(expect.any(Array), null);
    const thrown = makeDeps({
      fetchSfdp: async () => {
        throw new Error("x");
      },
      saveSfdp,
    });
    expect((await runPools(thrown.deps)).sfdp?.ok).toBe(false);
  });

  it("stops starting scans when the time budget is spent", async () => {
    const { deps } = makeDeps({}, targets(10));
    const r = await runPools(deps, { budgetMs: -1 });
    expect(r).toMatchObject({ scanned: 0, deferred: 10 });
  });

  it("clears data of validators that lost their claim", async () => {
    const remove = vi.fn(async () => 4);
    const t = targets(2);
    const { deps } = makeDeps({ remove }, t);
    expect((await runPools(deps)).removed).toBe(4);
    expect(remove).toHaveBeenCalledWith(t.map((x) => x.identity));
  });
});

describe("refreshPoolsFor (right after a claim becomes active)", () => {
  it("scans only that validator, with no discovery, SFDP or cleanup", async () => {
    const t = targets(3);
    const remove = vi.fn(async () => 0);
    const discover = vi.fn(async () => []);
    const fetchSfdp = vi.fn(async () => new Set<string>());
    const { deps, saved } = makeDeps({ remove, discover, fetchSfdp }, t);
    const r = await refreshPoolsFor(t[1].identity, deps);
    expect(r).toMatchObject({ scanned: 1, due: 1 });
    expect(saved.map((s) => s.identity)).toEqual([t[1].identity]);
    expect(remove).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
    expect(fetchSfdp).not.toHaveBeenCalled();
  });

  it("skips unknown identities and validators scanned recently, and never throws", async () => {
    const t = targets(2);
    t[0].scannedAt = ago(2 * H);
    const { deps } = makeDeps({}, t);
    expect(await refreshPoolsFor(t[0].identity, deps)).toMatchObject({ due: 0, scanned: 0 });
    expect(await refreshPoolsFor("unknown", deps)).toMatchObject({ due: 0 });
    const broken = {
      ...deps,
      targets: async () => {
        throw new Error("db down");
      },
    };
    expect(await refreshPoolsFor("x", broken)).toBeNull();
  });
});

describe("pool registry helpers", () => {
  const rows = [
    { pool: "P1", program: "prog", name: "Brand", logoId: "brand" },
    { pool: "P2", program: "prog", name: "Other name", logoId: "brand" },
    { pool: "P3", program: "prog", name: "Sanct", logoId: "sanctum" },
    { pool: "P4", program: "prog", name: null, logoId: "x" },
    { pool: "P5", program: "prog", name: "No logo", logoId: "missing" },
  ];
  const logo = (i: string) => (i === "brand" ? "/pools/brand.png" : null);

  it("groups approved candidates by logo id, keeps registry names for registry ids, and skips incomplete rows", () => {
    const defs = approvedToPools(rows, logo);
    expect(defs.map((d) => d.id)).toEqual(["brand", "sanctum"]);
    expect(defs[0]).toMatchObject({ name: "Brand", logo: "/pools/brand.png" });
    expect(defs[0].authorities).toHaveLength(2);
    expect(defs[1]).toMatchObject({ name: "Sanctum", logo: "/pools/sanctum.png" });
    expect(poolMetaMap(defs).get("sanctum")).toEqual({ name: "Sanctum", logo: "/pools/sanctum.png" });
    expect(poolMetaMap(defs).get("brand")?.name).toBe("Brand");
    expect(poolMetaMap([]).has("brand")).toBe(false);
  });

  it("logo ids are plain slugs and resolve only to files that exist under public/pools", () => {
    for (const bad of ["../x", "A", "a/b", "a.png", "", "-a", "a".repeat(41), "a b"]) expect(LOGO_ID_RE.test(bad), bad).toBe(false);
    expect(LOGO_ID_RE.test("jito")).toBe(true);
    expect(logoPathFor("jito")).toBe("/pools/jito.png");
    expect(logoPathFor("jpool")).toBe("/pools/jpool.svg");
    expect(logoPathFor("nope")).toBeNull();
    expect(logoPathFor("../../etc/passwd")).toBeNull();
    expect(logoPathFor("x", () => true)).toBe("/pools/x.svg");
  });
});
