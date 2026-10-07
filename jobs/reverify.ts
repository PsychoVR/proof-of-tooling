import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, tools } from "@/db/schema";
import { checkProofFile } from "@/lib/claims";
import { resolveTxt } from "@/lib/dns-txt";
import { safeFetcher } from "@/lib/safe-fetch";
import type { ClaimCheckResult } from "@/lib/types";

export interface ActiveClaim {
  id: number;
  toolUrl: string;
  identity: string;
  verifiedAt: Date;
  lastCheckedAt: Date | null;
}

export interface ReverifyDeps {
  listActive: () => Promise<ActiveClaim[]>;
  check: (toolUrl: string, identity: string) => Promise<ClaimCheckResult>;
  markOk: (id: number, now: Date) => Promise<void>;
  markFailed: (id: number, now: Date) => Promise<void>;
  markStale: (id: number, now: Date) => Promise<void>;
  now?: () => Date;
  concurrency?: number;
}

export interface ReverifyReport {
  checked: number;
  ok: number;
  failedOnce: number;
  staled: number;
  skipped: number;
}

/**
 * The schema has no failure counter. `verifiedAt` is bumped only on a successful check and
 * `lastCheckedAt` on every check, so `lastCheckedAt > verifiedAt` means the previous check
 * failed. A second consecutive failure turns the claim stale.
 */
export function previousCheckFailed(c: Pick<ActiveClaim, "verifiedAt" | "lastCheckedAt">): boolean {
  return c.lastCheckedAt !== null && c.lastCheckedAt.getTime() > c.verifiedAt.getTime();
}

const defaults: ReverifyDeps = {
  listActive: async () =>
    getDb()
      .select({
        id: claims.id,
        toolUrl: tools.url,
        identity: claims.identity,
        verifiedAt: claims.verifiedAt,
        lastCheckedAt: claims.lastCheckedAt,
      })
      .from(claims)
      .innerJoin(tools, eq(tools.id, claims.toolId))
      .where(eq(claims.status, "active")),
  check: (toolUrl, identity) => checkProofFile(toolUrl, identity, safeFetcher, resolveTxt),
  markOk: async (id, now) => {
    await getDb().update(claims).set({ verifiedAt: now, lastCheckedAt: now }).where(eq(claims.id, id));
  },
  markFailed: async (id, now) => {
    await getDb().update(claims).set({ lastCheckedAt: now }).where(eq(claims.id, id));
  },
  markStale: async (id, now) => {
    await getDb()
      .update(claims)
      .set({ status: "stale", lastCheckedAt: now })
      .where(and(eq(claims.id, id), eq(claims.status, "active")));
  },
};

export async function runReverify(deps: ReverifyDeps = defaults): Promise<ReverifyReport> {
  const list = await deps.listActive();
  const report: ReverifyReport = { checked: 0, ok: 0, failedOnce: 0, staled: 0, skipped: 0 };
  const size = deps.concurrency ?? 5;
  const now = (deps.now ?? (() => new Date()))();

  const one = async (c: ActiveClaim) => {
    let res: ClaimCheckResult;
    try {
      res = await deps.check(c.toolUrl, c.identity);
    } catch {
      // Network error: inconclusive, leave the claim untouched.
      report.skipped++;
      return;
    }
    report.checked++;
    if (res.ok) {
      await deps.markOk(c.id, now);
      report.ok++;
    } else if (previousCheckFailed(c)) {
      await deps.markStale(c.id, now);
      report.staled++;
    } else {
      await deps.markFailed(c.id, now);
      report.failedOnce++;
    }
  };

  for (let i = 0; i < list.length; i += size) {
    await Promise.all(list.slice(i, i + size).map(one));
  }
  return report;
}
