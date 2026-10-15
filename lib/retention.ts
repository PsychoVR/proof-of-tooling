import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { claims } from "@/db/schema";

/** Days a validator keeps its icon and stake badges after its last active claim went stale. */
export const STALE_RETENTION_DAYS = 30;
const DAY = 24 * 3_600_000;

export interface ClaimAge {
  identity: string;
  status: string;
  /** When the claim last changed state: the last check (which is when it went stale), else its verification date. */
  since: Date;
}

/**
 * Identities without an active claim whose stored icon and pool data must still be kept, because their claim went
 * stale less than 30 days ago. Stale data is hidden by the readers, not deleted, so a recovered claim shows
 * everything again at once. Validators with an active claim are handled by the jobs themselves.
 */
export function retainedFrom(rows: readonly ClaimAge[], now: Date): string[] {
  const cutoff = now.getTime() - STALE_RETENTION_DAYS * DAY;
  const active = new Set(rows.filter((r) => r.status === "active").map((r) => r.identity));
  const keep = new Set<string>();
  for (const r of rows) {
    if (r.status === "stale" && r.since.getTime() > cutoff && !active.has(r.identity)) keep.add(r.identity);
  }
  return [...keep];
}

export async function retainedIdentities(now: Date = new Date()): Promise<string[]> {
  const rows = await getDb()
    .select({ identity: claims.identity, status: claims.status, checked: claims.lastCheckedAt, verified: claims.verifiedAt })
    .from(claims)
    .where(inArray(claims.status, ["active", "stale"]));
  return retainedFrom(
    rows.map((r) => ({ identity: r.identity, status: r.status, since: r.checked ?? r.verified })),
    now,
  );
}
