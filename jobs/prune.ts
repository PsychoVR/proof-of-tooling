import { and, eq, lt, notExists } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, endorsements, seedEntries, tools } from "@/db/schema";

/** Tools younger than this are never pruned, so a tool being created cannot be removed under it. */
const MIN_AGE_MS = 86_400_000;

/**
 * Deletes tools nobody refers to: no seed entry and no claim (in any status) or endorsement.
 * Claim storage creates a tool and its claim in one transaction, so these only appear when a row
 * was removed by hand; this keeps the table from growing unnoticed.
 */
export async function pruneOrphanTools(now: Date = new Date(), db = getDb()): Promise<number> {
  const ref = (t: typeof seedEntries | typeof claims | typeof endorsements) =>
    db.select({ one: t.id }).from(t).where(eq(t.toolId, tools.id));
  const [res] = await db
    .delete(tools)
    .where(and(lt(tools.createdAt, new Date(now.getTime() - MIN_AGE_MS)), notExists(ref(seedEntries)), notExists(ref(claims)), notExists(ref(endorsements))));
  return res.affectedRows;
}
