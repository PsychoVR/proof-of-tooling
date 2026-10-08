import { createHash } from "node:crypto";
import { and, count, eq, exists, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, jobRuns, poolCandidates, validatorPoolScan, validatorPoolStake, validatorSfdp, validators } from "@/db/schema";
import { clusterRpcUrl, ENABLED_CLUSTERS } from "@/lib/clusters";
import { loadApprovedPools } from "@/lib/pool-registry";
import { createSafeFetcher } from "@/lib/safe-fetch";
import { discoverStakePools, type PoolCandidate } from "@/lib/solana/pool-discovery";
import { fetchEpoch, fetchValidatorPools, type PoolRpcOptions, type PoolStake } from "@/lib/solana/pool-stake";
import { fetchSfdpApproved, SFDP_MAX_BYTES } from "@/lib/solana/sfdp";
import {
  buildAuthorityIndex,
  SANCTUM_MULTI_PROGRAM,
  SANCTUM_SPL_PROGRAM,
  SPL_STAKE_POOL_PROGRAM,
  STAKE_POOLS,
  type StakePoolDef,
} from "@/lib/solana/stake-pools";
import type { Fetcher } from "@/lib/claims";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Validators scanned per run (10 credits each on Helius); the rest wait for the next run. */
export const MAX_PER_RUN = 50;
const POOL = 3;
/** Below this many verified validators every one is scanned daily; from here on 1/7 of them per day. */
export const DAILY_BELOW = 50;
/** A validator scanned less than this long ago is not scanned again (the cron may fire more than once a day). */
export const MIN_RESCAN_MS = 20 * HOUR;
/** In weekly mode a validator whose day was missed is picked up once its last scan is this old. */
export const CATCH_UP_MS = 8 * DAY;
export const DISCOVERY_EVERY_MS = 6.5 * DAY;
export const SFDP_EVERY_MS = 20 * HOUR;
/** No new scans start after this long into a run, so the endpoint answers inside its time limit. */
export const RUN_BUDGET_MS = 240_000;

/** Programs whose stake pools are listed as candidates. Only approved ones are ever attributed or shown. */
export const DISCOVERY_PROGRAMS: readonly string[] = [SPL_STAKE_POOL_PROGRAM, SANCTUM_SPL_PROGRAM, SANCTUM_MULTI_PROGRAM];

export interface PoolTarget {
  identity: string;
  voteAccount: string;
  /** Last successful scan, or null if it never had one. */
  scannedAt: Date | null;
}

/** Day slot (0-6) a validator is scanned on in weekly mode: stable, evenly spread, independent of the other validators. */
export function slotOf(identity: string): number {
  return createHash("sha256").update(identity).digest().readUInt32BE(0) % 7;
}

export const todaySlot = (now: Date) => Math.floor(now.getTime() / DAY) % 7;

export type PoolsMode = "daily" | "weekly";
export const modeFor = (verified: number): PoolsMode => (verified < DAILY_BELOW ? "daily" : "weekly");

/**
 * Validators to scan now: never-scanned ones first, then the oldest scans. Daily mode scans everyone not scanned
 * in the last 20 hours; weekly mode scans those whose slot is today (plus any that missed their day), capped at `max`.
 */
export function selectDue(targets: readonly PoolTarget[], now: Date, max = MAX_PER_RUN): { mode: PoolsMode; due: PoolTarget[] } {
  const mode = modeFor(targets.length);
  const slot = todaySlot(now);
  const age = (t: PoolTarget) => (t.scannedAt ? now.getTime() - t.scannedAt.getTime() : Infinity);
  const due = targets.filter((t) => {
    if (age(t) < MIN_RESCAN_MS) return false;
    if (mode === "daily" || !t.scannedAt) return true;
    return slotOf(t.identity) === slot || age(t) >= CATCH_UP_MS;
  });
  due.sort((a, b) => (age(b) === age(a) ? (a.identity < b.identity ? -1 : 1) : age(b) > age(a) ? 1 : -1));
  return { mode, due: due.slice(0, max) };
}

export interface PoolsDeps {
  now: () => Date;
  /** Verified validators (active claim, enabled cluster) with their vote account and last scan. */
  targets: () => Promise<PoolTarget[]>;
  /** Pools an admin approved, merged into the static registry. */
  approvedPools: () => Promise<StakePoolDef[]>;
  epoch: () => Promise<number>;
  scan: (voteAccount: string, index: ReturnType<typeof buildAuthorityIndex>, epoch: number) => Promise<PoolStake[]>;
  /** Replaces the stored pools of one validator and stamps the scan. */
  saveScan: (identity: string, pools: PoolStake[], epoch: number) => Promise<void>;
  lastRun: (name: string) => Promise<Date | null>;
  markRun: (name: string) => Promise<void>;
  discover: (program: string) => Promise<PoolCandidate[]>;
  /** Upserts candidates without touching status, name or logo. Returns how many were new. */
  saveCandidates: (list: PoolCandidate[]) => Promise<number>;
  /** Approved SFDP identities among the given ones, or null if the list could not be read. */
  fetchSfdp: (identities: string[]) => Promise<Set<string> | null>;
  saveSfdp: (identities: string[], approved: Set<string> | null) => Promise<void>;
  /** Drops everything stored for identities that are no longer verified. Returns how many rows went. */
  remove: (keep: string[]) => Promise<number>;
}

export interface PoolsReport {
  mode: PoolsMode;
  verified: number;
  due: number;
  scanned: number;
  /** Scan errors (RPC or parsing): the previous data of that validator is kept. */
  failed: number;
  /** Validators left for the next run because of the per-run cap or the time budget. */
  deferred: number;
  /** With at least one pool at or above the threshold, among the scanned ones. */
  withPools: number;
  removed: number;
  epochError: boolean;
  discovery: { programs: number; found: number; added: number } | null;
  sfdp: { participants: number; ok: boolean } | null;
}

export interface RunOptions {
  /** Scan only this validator, now (subject to the 20 h rescan guard), skipping discovery, SFDP and cleanup. */
  only?: string;
  budgetMs?: number;
}

const SFDP_RUN = "sfdp";
const DISCOVERY_RUN = "pool-discovery";

const emptyReport = (mode: PoolsMode, verified: number): PoolsReport => ({
  mode,
  verified,
  due: 0,
  scanned: 0,
  failed: 0,
  deferred: 0,
  withPools: 0,
  removed: 0,
  epochError: false,
  discovery: null,
  sfdp: null,
});

const isDue = async (deps: PoolsDeps, name: string, every: number) => {
  const last = await deps.lastRun(name);
  return !last || deps.now().getTime() - last.getTime() >= every;
};

/**
 * Refreshes which stake pools delegate to each verified validator, which candidate pools exist on chain, and
 * which validators are SFDP participants. One failing validator never stops the others and never erases its
 * previous data. Spends about 10 RPC credits per scanned validator, plus 1 per run for the epoch and 10 per
 * discovered program once a week.
 */
export async function runPools(deps: PoolsDeps = defaultPoolsDeps, opts: RunOptions = {}): Promise<PoolsReport> {
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? RUN_BUDGET_MS;
  const all = await deps.targets();
  const now = deps.now();

  let mode = modeFor(all.length);
  let due: PoolTarget[];
  if (opts.only) {
    const t = all.find((x) => x.identity === opts.only);
    due = t && (!t.scannedAt || now.getTime() - t.scannedAt.getTime() >= MIN_RESCAN_MS) ? [t] : [];
  } else {
    ({ mode, due } = selectDue(all, now));
  }
  const report = emptyReport(mode, all.length);
  report.due = due.length;

  if (!opts.only) report.removed = await deps.remove(all.map((t) => t.identity));

  if (due.length > 0) {
    let epoch: number | null = null;
    try {
      epoch = await deps.epoch();
    } catch {
      report.epochError = true;
    }
    if (epoch !== null) {
      const index = buildAuthorityIndex(STAKE_POOLS, await deps.approvedPools());
      let next = 0;
      const worker = async () => {
        while (next < due.length) {
          if (Date.now() - started > budgetMs) return;
          const t = due[next++];
          try {
            const pools = await deps.scan(t.voteAccount, index, epoch);
            await deps.saveScan(t.identity, pools, epoch);
            report.scanned++;
            if (pools.length > 0) report.withPools++;
          } catch {
            report.failed++;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(POOL, due.length) }, worker));
      report.deferred = Math.max(0, due.length - next);
    }
  }
  if (opts.only) return report;

  if (await isDue(deps, DISCOVERY_RUN, DISCOVERY_EVERY_MS)) {
    const found: PoolCandidate[] = [];
    let okPrograms = 0;
    for (const program of DISCOVERY_PROGRAMS) {
      try {
        found.push(...(await deps.discover(program)));
        okPrograms++;
      } catch {
        // The next weekly run tries again; candidates already stored stay.
      }
    }
    const added = okPrograms > 0 ? await deps.saveCandidates(found) : 0;
    if (okPrograms > 0) await deps.markRun(DISCOVERY_RUN);
    report.discovery = { programs: okPrograms, found: found.length, added };
  }

  if (all.length > 0 && (await isDue(deps, SFDP_RUN, SFDP_EVERY_MS))) {
    const identities = all.map((t) => t.identity);
    let approved: Set<string> | null = null;
    try {
      approved = await deps.fetchSfdp(identities);
    } catch {
      approved = null;
    }
    await deps.saveSfdp(identities, approved);
    await deps.markRun(SFDP_RUN);
    report.sfdp = { participants: approved?.size ?? 0, ok: approved !== null };
  }
  return report;
}

/**
 * Scans one validator right after its claim becomes active, so its badges show without waiting for the daily job.
 * Costs about 11 RPC credits and is skipped when the validator was scanned in the last 20 hours. Never throws and
 * never blocks the caller: call it without awaiting.
 */
export async function refreshPoolsFor(identity: string, deps: PoolsDeps = defaultPoolsDeps): Promise<PoolsReport | null> {
  try {
    return await runPools(deps, { only: identity });
  } catch {
    return null;
  }
}

// ---- real dependencies ----

const db = () => getDb();

const rpcOptions = (): PoolRpcOptions => ({ rpcUrl: clusterRpcUrl("mainnet"), timeoutMs: 90_000 });

let sfdpFetcher: Fetcher | undefined;

const chunks = <T>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export const defaultPoolsDeps: PoolsDeps = {
  now: () => new Date(),
  async targets() {
    const rows = await db()
      .select({ identity: validators.identity, voteAccount: validators.voteAccount, scannedAt: validatorPoolScan.scannedAt })
      .from(validators)
      .leftJoin(validatorPoolScan, eq(validatorPoolScan.identity, validators.identity))
      .where(
        and(
          inArray(validators.cluster, [...ENABLED_CLUSTERS]),
          exists(db().select({ one: claims.id }).from(claims).where(and(eq(claims.identity, validators.identity), eq(claims.status, "active")))),
        ),
      );
    const seen = new Set<string>();
    const out: PoolTarget[] = [];
    for (const r of rows) {
      if (seen.has(r.identity)) continue;
      seen.add(r.identity);
      out.push({ identity: r.identity, voteAccount: r.voteAccount, scannedAt: r.scannedAt });
    }
    return out;
  },
  approvedPools: loadApprovedPools,
  epoch: () => fetchEpoch(rpcOptions()),
  scan: (voteAccount, index, epoch) => fetchValidatorPools(voteAccount, index, epoch, rpcOptions()),
  async saveScan(identity, pools, epoch) {
    await db().transaction(async (tx) => {
      const ids = pools.map((p) => p.poolId);
      await tx
        .delete(validatorPoolStake)
        .where(ids.length > 0 ? and(eq(validatorPoolStake.identity, identity), notInArray(validatorPoolStake.poolId, ids)) : eq(validatorPoolStake.identity, identity));
      for (const p of pools) {
        await tx
          .insert(validatorPoolStake)
          .values({ identity, poolId: p.poolId, lamports: p.lamports })
          .onDuplicateKeyUpdate({ set: { lamports: p.lamports, updatedAt: sql`CURRENT_TIMESTAMP` } });
      }
      await tx
        .insert(validatorPoolScan)
        .values({ identity, epoch })
        .onDuplicateKeyUpdate({ set: { epoch, scannedAt: sql`CURRENT_TIMESTAMP` } });
    });
  },
  async lastRun(name) {
    const [row] = await db().select({ at: jobRuns.lastRunAt }).from(jobRuns).where(eq(jobRuns.name, name)).limit(1);
    return row?.at ?? null;
  },
  async markRun(name) {
    await db().insert(jobRuns).values({ name }).onDuplicateKeyUpdate({ set: { lastRunAt: sql`CURRENT_TIMESTAMP` } });
  },
  discover: (program) => discoverStakePools(program, rpcOptions()),
  async saveCandidates(list) {
    // Pools of the static registry are already known; listing them as candidates would only add noise.
    const known = new Set(STAKE_POOLS.flatMap((p) => p.authorities.flatMap((a) => (a.kind === "spl-pool" ? [a.pool] : []))));
    const fresh = list.filter((c) => !known.has(c.pool));
    const [before] = await db().select({ n: count() }).from(poolCandidates);
    for (const part of chunks(fresh, 400)) {
      await db()
        .insert(poolCandidates)
        .values(part.map((c) => ({ pool: c.pool, poolMint: c.poolMint, validatorList: c.validatorList, withdrawAuthority: c.withdrawAuthority, program: c.program })))
        .onDuplicateKeyUpdate({
          set: {
            poolMint: sql`values(${poolCandidates.poolMint})`,
            validatorList: sql`values(${poolCandidates.validatorList})`,
            withdrawAuthority: sql`values(${poolCandidates.withdrawAuthority})`,
            program: sql`values(${poolCandidates.program})`,
            lastSeen: sql`CURRENT_TIMESTAMP`,
          },
        });
    }
    const [after] = await db().select({ n: count() }).from(poolCandidates);
    return Number(after.n) - Number(before.n);
  },
  async fetchSfdp(identities) {
    sfdpFetcher ??= createSafeFetcher({ maxBytes: SFDP_MAX_BYTES, timeoutMs: 30_000 });
    return fetchSfdpApproved(identities, sfdpFetcher);
  },
  async saveSfdp(identities, approved) {
    const at = new Date();
    for (const part of chunks(identities, 400)) {
      if (approved === null) {
        // The list could not be read: keep the last known value and only record the attempt.
        await db().update(validatorSfdp).set({ checkedAt: at }).where(inArray(validatorSfdp.identity, part));
        continue;
      }
      await db()
        .insert(validatorSfdp)
        .values(part.map((identity) => ({ identity, participant: approved.has(identity), checkedAt: at, lastOkAt: at })))
        .onDuplicateKeyUpdate({ set: { participant: sql`values(${validatorSfdp.participant})`, checkedAt: at, lastOkAt: at } });
    }
  },
  async remove(keep) {
    const keepSet = new Set(keep);
    let removed = 0;
    for (const table of [validatorPoolStake, validatorPoolScan, validatorSfdp]) {
      const stored = [...new Set((await db().select({ identity: table.identity }).from(table)).map((r) => r.identity))];
      const gone = stored.filter((id) => !keepSet.has(id));
      for (const part of chunks(gone, 400)) {
        const [res] = await db().delete(table).where(inArray(table.identity, part));
        removed += res.affectedRows;
      }
    }
    return removed;
  },
};
