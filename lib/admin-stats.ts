import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { claims } from "@/db/schema";
import { CLAIM_STATUSES, type ClaimStatus } from "@/lib/types";
import { failuresSince, type FailureCount } from "@/lib/claim-failures";

export interface AdminStats {
  generatedAt: string;
  claimsByStatus: Record<ClaimStatus, number>;
  /** Claims whose verification (or manual approval) falls in the window, in any status. */
  newClaims: { last7Days: number; last30Days: number };
  /** Distinct identities with at least one active claim. */
  activeIdentities: number;
  /** Failed claim attempts of the last 7 days, grouped by the step that failed. */
  claimFailuresLast7Days: FailureCount[];
}

const DAY = 86_400_000;

export async function getAdminStats(now: Date = new Date(), db = getDb()): Promise<AdminStats> {
  const since = (days: number) => new Date(now.getTime() - days * DAY);
  const countNew = async (days: number) =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(claims).where(gte(claims.verifiedAt, since(days))))[0]?.n ?? 0);

  const [byStatus, [identities], last7, last30, failures] = await Promise.all([
    db.select({ status: claims.status, n: sql<number>`count(*)` }).from(claims).groupBy(claims.status),
    db.select({ n: sql<number>`count(distinct ${claims.identity})` }).from(claims).where(and(eq(claims.status, "active"))),
    countNew(7),
    countNew(30),
    failuresSince(since(7), db),
  ]);

  const claimsByStatus = Object.fromEntries(CLAIM_STATUSES.map((s) => [s, 0])) as Record<ClaimStatus, number>;
  for (const r of byStatus) claimsByStatus[r.status] = Number(r.n);
  return {
    generatedAt: now.toISOString(),
    claimsByStatus,
    newClaims: { last7Days: last7, last30Days: last30 },
    activeIdentities: Number(identities?.n ?? 0),
    claimFailuresLast7Days: failures,
  };
}
