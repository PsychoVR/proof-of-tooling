import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, tools } from "@/db/schema";
import { pruneOrphanTools } from "@/jobs/prune";
import { checkProofFile, type Fetcher } from "@/lib/claims";
import { safeFetcher } from "@/lib/safe-fetch";
import type { ClaimCheckResult } from "@/lib/types";

export interface ActiveClaim {
  id: number;
  toolUrl: string;
  identity: string;
  /** Consecutive failed checks so far. */
  failures: number;
}

/** Consecutive real failures after which an active claim turns stale. */
export const MAX_FAILURES = 2;

/** The proof file could not be reached: inconclusive, so the claim is left untouched. */
export class ProofUnreachableError extends Error {}

/**
 * checkProofFile reports a thrown fetch as a failed proof. Wrapping the fetcher tells those apart
 * from real failures (HTTP errors, missing identity, bad JSON): a network error is rethrown.
 */
export async function checkReachable(
  toolUrl: string,
  identity: string,
  fetcher: Fetcher,
  check: typeof checkProofFile = checkProofFile,
): Promise<ClaimCheckResult> {
  let threw = false;
  const res = await check(toolUrl, identity, async (url) => {
    try {
      return await fetcher(url);
    } catch (err) {
      threw = true;
      throw err;
    }
  });
  if (threw) throw new ProofUnreachableError("proof file unreachable");
  return res;
}

export interface ReverifyDeps {
  listActive: () => Promise<ActiveClaim[]>;
  check: (toolUrl: string, identity: string) => Promise<ClaimCheckResult>;
  markOk: (id: number, now: Date) => Promise<void>;
  /** Records a failed check; `failures` is the new consecutive count. */
  markFailed: (id: number, now: Date, failures: number) => Promise<void>;
  markStale: (id: number, now: Date) => Promise<void>;
  /** Removes orphan tools; returns how many. */
  prune?: () => Promise<number>;
  now?: () => Date;
  concurrency?: number;
}

export interface ReverifyReport {
  checked: number;
  ok: number;
  failedOnce: number;
  staled: number;
  skipped: number;
  pruned: number;
}

const defaults: ReverifyDeps = {
  listActive: async () =>
    getDb()
      .select({
        id: claims.id,
        toolUrl: tools.url,
        identity: claims.identity,
        failures: claims.failures,
      })
      .from(claims)
      .innerJoin(tools, eq(tools.id, claims.toolId))
      .where(eq(claims.status, "active")),
  check: (toolUrl, identity) => checkReachable(toolUrl, identity, safeFetcher),
  markOk: async (id, now) => {
    await getDb().update(claims).set({ verifiedAt: now, lastCheckedAt: now, failures: 0 }).where(eq(claims.id, id));
  },
  markFailed: async (id, now, failures) => {
    await getDb().update(claims).set({ lastCheckedAt: now, failures }).where(eq(claims.id, id));
  },
  markStale: async (id, now) => {
    await getDb()
      .update(claims)
      .set({ status: "stale", lastCheckedAt: now, failures: MAX_FAILURES })
      .where(and(eq(claims.id, id), eq(claims.status, "active")));
  },
};

export async function runReverify(overrides: Partial<ReverifyDeps> = {}): Promise<ReverifyReport> {
  const deps: ReverifyDeps = { ...defaults, ...overrides };
  const list = await deps.listActive();
  const report: ReverifyReport = { checked: 0, ok: 0, failedOnce: 0, staled: 0, skipped: 0, pruned: 0 };
  const size = deps.concurrency ?? 5;
  const now = (deps.now ?? (() => new Date()))();

  const one = async (c: ActiveClaim) => {
    let res: ClaimCheckResult;
    try {
      res = await deps.check(c.toolUrl, c.identity);
    } catch {
      // Network error: inconclusive, leave the claim and its failure count untouched.
      report.skipped++;
      return;
    }
    report.checked++;
    if (res.ok) {
      await deps.markOk(c.id, now);
      report.ok++;
    } else if (c.failures + 1 >= MAX_FAILURES) {
      await deps.markStale(c.id, now);
      report.staled++;
    } else {
      await deps.markFailed(c.id, now, c.failures + 1);
      report.failedOnce++;
    }
  };

  for (let i = 0; i < list.length; i += size) {
    await Promise.all(list.slice(i, i + size).map(one));
  }
  try {
    report.pruned = await (deps.prune ?? (() => pruneOrphanTools(now)))();
  } catch {
    // Housekeeping only: a failure here must not hide the verification results.
  }
  return report;
}
