import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, tools } from "@/db/schema";
import { pruneOrphanTools } from "@/jobs/prune";
import { pruneClaimFailures } from "@/lib/claim-failures";
import { checkProofFile, proofFileUrl, type Fetcher, type TxtResolver } from "@/lib/claims";
import { resolveTxt } from "@/lib/dns-txt";
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
 * from real failures (HTTP errors, missing identity, bad JSON): a network error is rethrown, but
 * only when the primary location (the repo file, or the web well-known file) threw. If the primary
 * answered with a real failure and only a secondary fetch (account-level file, home page meta tag)
 * threw, the claim is not proven and that counts as a real failure.
 */
export async function checkReachable(
  toolUrl: string,
  identity: string,
  fetcher: Fetcher,
  resolver: TxtResolver = resolveTxt,
  check: typeof checkProofFile = checkProofFile,
): Promise<ClaimCheckResult> {
  const primary = proofFileUrl(toolUrl)?.url;
  let threw = false;
  const res = await check(toolUrl, identity, async (url) => {
    try {
      return await fetcher(url);
    } catch (err) {
      if (url === primary) threw = true;
      throw err;
    }
  }, resolver);
  // A proof found by one method is conclusive even if another method's fetch failed.
  if (threw && !res.ok) throw new ProofUnreachableError("proof file unreachable");
  return res;
}

export interface ReverifyDeps {
  listActive: () => Promise<ActiveClaim[]>;
  check: (toolUrl: string, identity: string) => Promise<ClaimCheckResult>;
  markOk: (id: number, now: Date) => Promise<void>;
  /**
   * Records a failed check; `failures` is the new consecutive count. Applies only if the claim is
   * still active with `failures - 1` failures, so a concurrent re-claim is not overwritten.
   */
  markFailed: (id: number, now: Date, failures: number) => Promise<void>;
  /** Turns the claim stale, only if it is still active with `readFailures` failures (the value that was read). */
  markStale: (id: number, now: Date, readFailures: number) => Promise<void>;
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
  // verifiedAt is the claim/approval date and feeds the 24h claim counter, so the cron only
  // touches lastCheckedAt.
  markOk: async (id, now) => {
    await getDb()
      .update(claims)
      .set({ lastCheckedAt: now, failures: 0 })
      .where(and(eq(claims.id, id), eq(claims.status, "active")));
  },
  markFailed: async (id, now, failures) => {
    await getDb()
      .update(claims)
      .set({ lastCheckedAt: now, failures })
      .where(and(eq(claims.id, id), eq(claims.status, "active"), eq(claims.failures, failures - 1)));
  },
  markStale: async (id, now, readFailures) => {
    await getDb()
      .update(claims)
      .set({ status: "stale", lastCheckedAt: now, failures: MAX_FAILURES })
      .where(and(eq(claims.id, id), eq(claims.status, "active"), eq(claims.failures, readFailures)));
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
      await deps.markStale(c.id, now, c.failures);
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
    report.pruned = await (deps.prune ?? (async () => {
      const orphans = await pruneOrphanTools(now);
      await pruneClaimFailures(now);
      return orphans;
    }))();
  } catch {
    // Housekeeping only: a failure here must not hide the verification results.
  }
  return report;
}
