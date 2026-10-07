import { gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { claimFailures } from "@/db/schema";
import type { ClaimResponse } from "@/lib/types";

export type FailureKind = "check" | "register";

/** Reason recorded when the request itself broke (a 500), not one of the verification steps. */
export const INTERNAL_REASON = "error";

/**
 * The step that stopped a request, or null when it did not fail. A request waiting for manual
 * review passed every check, so it is not a failure.
 */
export function failureReason(result: Pick<ClaimResponse, "ok" | "inReview" | "checks">): string | null {
  if (result.ok || result.inReview) return null;
  return result.checks.find((c) => !c.ok)?.id ?? "unknown";
}

/** Stores one failure. Never throws: losing a statistic must not break a claim request. */
export async function recordClaimFailure(kind: FailureKind, reason: string): Promise<void> {
  try {
    await getDb().insert(claimFailures).values({ kind, reason });
  } catch {
    console.warn("could not record a claim failure");
  }
}

const RETENTION_MS = 30 * 86_400_000;

/** Deletes failures older than 30 days; returns how many. */
export async function pruneClaimFailures(now: Date = new Date(), db = getDb()): Promise<number> {
  const [res] = await db.delete(claimFailures).where(lt(claimFailures.createdAt, new Date(now.getTime() - RETENTION_MS)));
  return res.affectedRows;
}

export interface FailureCount {
  reason: string;
  kind: FailureKind;
  count: number;
}

/** Failures since `since`, grouped by step and request kind, most frequent first. */
export async function failuresSince(since: Date, db = getDb()): Promise<FailureCount[]> {
  const rows = await db
    .select({ reason: claimFailures.reason, kind: claimFailures.kind, count: sql<number>`count(*)` })
    .from(claimFailures)
    .where(gte(claimFailures.createdAt, since))
    .groupBy(claimFailures.reason, claimFailures.kind);
  return rows
    .map((r) => ({ reason: r.reason, kind: r.kind, count: Number(r.count) }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason) || a.kind.localeCompare(b.kind));
}
