import bs58 from "bs58";
import { describe, expect, it, vi } from "vitest";
import { REGISTRY_RUN, runPools, type PoolsDeps, type PoolTarget } from "@/jobs/pools";
import type { PoolCandidate } from "@/lib/solana/pool-discovery";

const id = (n: number) => bs58.encode(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? n % 256 : 7)));
const targets = (n: number): PoolTarget[] => Array.from({ length: n }, (_, i) => ({ identity: id(i + 1), voteAccount: `vote${i + 1}`, scannedAt: null }));
const NOW = new Date("2026-10-16T12:00:00Z");
const SOL = 1_000_000_000n;
const cand = (pool: string): PoolCandidate => ({
  program: "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy",
  pool,
  poolMint: "m",
  validatorList: "v",
  withdrawAuthority: "w",
  totalLamports: 20_000n * SOL,
});
const boom = (m: string) => async (): Promise<never> => {
  throw new Error(m);
};

function makeDeps(over: Partial<PoolsDeps> = {}, t: PoolTarget[] = targets(3)) {
  const saved: string[] = [];
  const runs = new Map<string, Date>([[REGISTRY_RUN, new Date(NOW.getTime() - 30 * 86_400_000)]]);
  const deps: PoolsDeps = {
    now: () => NOW,
    targets: async () => t,
    approvedPools: async () => [],
    epoch: async () => 1052,
    scan: async () => [],
    saveScan: async (identity) => void saved.push(identity),
    lastRun: async (n) => runs.get(n) ?? null,
    markRun: async (n) => void runs.set(n, NOW),
    discover: async () => [],
    measure: async () => null,
    saveCandidates: async (l) => ({ added: l.length, dropped: 0 }),
    fetchSfdp: async (ids) => new Set([ids[0]]),
    saveSfdp: async () => {},
    remove: async () => 0,
    ...over,
  };
  return { deps, saved };
}

const run = async (over: Partial<PoolsDeps>, t?: PoolTarget[]) => {
  const made = makeDeps(over, t);
  return { report: await runPools(made.deps), saved: made.saved };
};

describe("each part of the pools job fails on its own", () => {
  it("a failing discovery or SFDP does not stop the validator scan, and the report says which part failed", async () => {
    const { report, saved } = await run({ discover: boom("rpc 429"), fetchSfdp: boom("sfdp 500") });
    expect(saved).toHaveLength(3);
    expect(report.scanned).toBe(3);
    const steps = report.errors.map((e) => e.step);
    expect(steps).toContain("sfdp");
    expect(steps.some((s) => s.startsWith("discovery:"))).toBe(true);
    expect(report.errors.find((e) => e.step === "sfdp")?.message).toBe("sfdp 500");
  });

  it("a failing database write in discovery or cleanup is reported and the rest still runs", async () => {
    const { report, saved } = await run({
      discover: async () => [cand("A")],
      measure: async () => ({ validators: 12, stakeLamports: 15_000n * SOL, mintName: "Some SOL" }),
      saveCandidates: boom("Unknown column validators_count in field list"),
      remove: boom("db down"),
    });
    expect(saved).toHaveLength(3);
    expect(report.sfdp).toEqual({ participants: 1, ok: true });
    expect(report.errors.map((e) => e.step)).toEqual(expect.arrayContaining(["cleanup", "discovery:save"]));
  });

  it("a validator that fails does not stop the others", async () => {
    const t = targets(3);
    const { report, saved } = await run(
      {
        scan: async (vote) => {
          if (vote === t[1].voteAccount) throw new Error("boom");
          return [];
        },
      },
      t,
    );
    expect(saved).toHaveLength(2);
    expect(report).toMatchObject({ scanned: 2, failed: 1 });
    expect(report.errors).toEqual([{ step: "scan", message: "1 of 3 validators failed: boom" }]);
  });

  it("failing to list the targets, the epoch or the SFDP save are reported, not thrown", async () => {
    expect((await run({ targets: boom("db down") })).report.errors).toEqual([{ step: "targets", message: "db down" }]);
    const epoch = (await run({ epoch: boom("rpc down") })).report;
    expect(epoch.epochError).toBe(true);
    expect(epoch.errors).toEqual(expect.arrayContaining([{ step: "epoch", message: "rpc down" }]));
    expect((await run({ saveSfdp: boom("db down") })).report.errors).toEqual([{ step: "sfdp-save", message: "db down" }]);
  });

  it("an unreadable SFDP list (null) is a failure of that step", async () => {
    const { report } = await run({ fetchSfdp: async () => null });
    expect(report.errors).toEqual([{ step: "sfdp", message: "the SFDP list could not be read" }]);
  });

  it("messages carry no urls, keys or query text", async () => {
    const { report } = await run({ fetchSfdp: boom("fetch https://mainnet.helius-rpc.com/?api-key=abc123 failed\nselect * from t") });
    const msg = report.errors[0].message;
    expect(msg).not.toMatch(/helius|abc123|select/);
    expect(msg.length).toBeLessThanOrEqual(140);
  });

  it("records the outcome of a full run, but not of a single-validator refresh", async () => {
    const recordRun = vi.fn(async () => {});
    await runPools(makeDeps({ recordRun, discover: boom("x") }).deps);
    expect(recordRun).toHaveBeenCalledTimes(1);
    await runPools(makeDeps({ recordRun }).deps, { only: targets(3)[0].identity });
    expect(recordRun).toHaveBeenCalledTimes(1);
    await expect(runPools(makeDeps({ recordRun: boom("db") }).deps)).resolves.toBeDefined();
  });

});
