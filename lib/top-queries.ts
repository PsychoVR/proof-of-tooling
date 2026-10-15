import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, tools, topSnapshots, validatorIcons, validators } from "@/db/schema";
import { ENABLED_CLUSTERS } from "@/lib/clusters";
import { getPoolBadges } from "@/lib/queries";
import { isTopVisible, monthStart, previousMonth, rankBuilders, TOP_SIZE, type BuilderCount, type LiveTopEntry, type TopEntry } from "@/lib/top";
import { displayName } from "@/lib/ui/format";
import { iconPath } from "@/lib/validator-icons";

type Db = ReturnType<typeof getDb>;

interface Ranked extends BuilderCount {
  name: string;
}

/**
 * Tools with an active (signed) claim per validator identity. Unclaimed tools never count, and neither do
 * pending, stale, withdrawn or rejected claims. `before` limits the claims to those verified before that
 * instant (used by the monthly snapshot).
 */
async function builderCounts(db: Db, before?: Date): Promise<{ validatorsWithClaims: number; rows: Ranked[] }> {
  const live = await db
    .select({ identity: claims.identity, toolId: claims.toolId, verifiedAt: claims.verifiedAt })
    .from(claims)
    .where(and(eq(claims.status, "active"), before ? lt(claims.verifiedAt, before) : undefined));
  const identities = [...new Set(live.map((c) => c.identity))];
  if (identities.length === 0) return { validatorsWithClaims: 0, rows: [] };
  const known = await db
    .select({ identity: validators.identity, name: validators.name, cluster: validators.cluster })
    .from(validators)
    .where(and(inArray(validators.identity, identities), inArray(validators.cluster, [...ENABLED_CLUSTERS])));
  const names = new Map<string, string | null>();
  for (const v of known) if (!names.has(v.identity) || v.cluster === "mainnet") names.set(v.identity, v.name);

  const byIdentity = new Map<string, { tools: Set<number>; first: Date }>();
  for (const c of live) {
    if (!names.has(c.identity)) continue;
    const e = byIdentity.get(c.identity) ?? { tools: new Set<number>(), first: c.verifiedAt };
    e.tools.add(c.toolId);
    if (c.verifiedAt < e.first) e.first = c.verifiedAt;
    byIdentity.set(c.identity, e);
  }
  const rows = [...byIdentity].map(([identity, e]) => ({
    identity,
    toolCount: e.tools.size,
    firstClaimAt: e.first,
    name: displayName({ name: names.get(identity) ?? null, identity }),
  }));
  return { validatorsWithClaims: rows.length, rows };
}

const toEntry = (r: Ranked & { rank: number }): TopEntry => ({
  rank: r.rank,
  identity: r.identity,
  name: r.name,
  toolCount: r.toolCount,
  firstClaimAt: r.firstClaimAt.toISOString(),
});

export interface TopBoard {
  visible: boolean;
  validatorsWithClaims: number;
  entries: LiveTopEntry[];
}

/** The live Top 10, with icons and stake badges. Empty (and not visible) below the minimum number of validators. */
export async function getTopBoard(db: Db = getDb()): Promise<TopBoard> {
  const { validatorsWithClaims, rows } = await builderCounts(db);
  if (!isTopVisible(validatorsWithClaims)) return { visible: false, validatorsWithClaims, entries: [] };
  const top = rankBuilders(rows, TOP_SIZE);
  const ids = top.map((t) => t.identity);
  const [badges, icons] = await Promise.all([
    getPoolBadges(ids),
    db.select({ identity: validatorIcons.identity }).from(validatorIcons).where(inArray(validatorIcons.identity, ids)),
  ]);
  const hasIcon = new Set(icons.map((i) => i.identity));
  return {
    visible: true,
    validatorsWithClaims,
    entries: top.map((t) => ({
      ...toEntry(t),
      iconUrl: hasIcon.has(t.identity) ? iconPath(t.identity) : null,
      pools: badges.get(t.identity)?.pools ?? [],
      sfdp: badges.get(t.identity)?.sfdp ?? null,
    })),
  };
}

export interface NewTool {
  toolName: string;
  toolSlug: string;
  identity: string;
  validatorName: string;
  claimedAt: string;
}

/** Tools claimed (active claim) in the current UTC month, newest first, with their validator. */
export async function getNewThisMonth(now: Date = new Date(), limit = 12, db: Db = getDb()): Promise<NewTool[]> {
  const rows = await db
    .select({ toolName: tools.name, toolSlug: tools.slug, identity: claims.identity, claimedAt: claims.verifiedAt })
    .from(claims)
    .innerJoin(tools, eq(tools.id, claims.toolId))
    .where(and(eq(claims.status, "active"), gte(claims.verifiedAt, monthStart(now))))
    .orderBy(desc(claims.verifiedAt), desc(claims.id))
    .limit(limit);
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.identity))];
  const names = await db
    .select({ identity: validators.identity, name: validators.name })
    .from(validators)
    .where(and(inArray(validators.identity, ids), inArray(validators.cluster, [...ENABLED_CLUSTERS])));
  const nameOf = new Map(names.map((n) => [n.identity, n.name]));
  return rows
    .filter((r) => nameOf.has(r.identity))
    .map((r) => ({
      toolName: r.toolName,
      toolSlug: r.toolSlug,
      identity: r.identity,
      validatorName: displayName({ name: nameOf.get(r.identity) ?? null, identity: r.identity }),
      claimedAt: r.claimedAt.toISOString(),
    }));
}

export type SnapshotOutcome = "saved" | "exists" | "skipped";

/**
 * On the first day of a month (UTC), freezes the previous month's ranking if it is not stored yet.
 * Counts the claims verified before the month started. Nothing is saved when the board would not have
 * been visible. Safe to run any number of times: an existing snapshot is never touched.
 */
export async function saveMonthlySnapshot(now: Date = new Date(), db: Db = getDb()): Promise<SnapshotOutcome> {
  if (now.getUTCDate() !== 1) return "skipped";
  const month = previousMonth(now);
  const [existing] = await db.select({ month: topSnapshots.month }).from(topSnapshots).where(eq(topSnapshots.month, month));
  if (existing) return "exists";
  const { validatorsWithClaims, rows } = await builderCounts(db, monthStart(now));
  if (!isTopVisible(validatorsWithClaims)) return "skipped";
  const entries = rankBuilders(rows, TOP_SIZE).map(toEntry);
  await db
    .insert(topSnapshots)
    .values({ month, validators: validatorsWithClaims, entries: JSON.stringify(entries) })
    .onDuplicateKeyUpdate({ set: { month } });
  return "saved";
}

export interface Snapshot {
  month: string;
  createdAt: string;
  validators: number;
  entries: (TopEntry & { iconUrl: string | null })[];
}

function parseEntries(raw: string): TopEntry[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as TopEntry[]) : [];
  } catch {
    return [];
  }
}

export async function getSnapshot(month: string, db: Db = getDb()): Promise<Snapshot | null> {
  const [row] = await db.select().from(topSnapshots).where(eq(topSnapshots.month, month));
  if (!row) return null;
  const entries = parseEntries(row.entries);
  const ids = entries.map((e) => e.identity);
  const icons = ids.length ? await db.select({ identity: validatorIcons.identity }).from(validatorIcons).where(inArray(validatorIcons.identity, ids)) : [];
  const hasIcon = new Set(icons.map((i) => i.identity));
  return {
    month: row.month,
    createdAt: row.createdAt.toISOString(),
    validators: row.validators,
    entries: entries.map((e) => ({ ...e, iconUrl: hasIcon.has(e.identity) ? iconPath(e.identity) : null })),
  };
}

/** Months with a stored snapshot, newest first, with the champion of each. */
export async function listSnapshots(db: Db = getDb()): Promise<{ month: string; winner: TopEntry | null; validators: number }[]> {
  const rows = await db.select().from(topSnapshots).orderBy(desc(topSnapshots.month));
  return rows.map((r) => ({ month: r.month, validators: r.validators, winner: parseEntries(r.entries)[0] ?? null }));
}
