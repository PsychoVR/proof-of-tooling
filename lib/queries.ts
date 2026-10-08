import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ENABLED_CLUSTERS, isEnabledCluster } from "@/lib/clusters";
import { claims, endorsements, seedEntries, tools, validatorIcons, validatorPoolStake, validatorSfdp, validators } from "@/db/schema";
import { loadApprovedPools, poolMetaMap } from "@/lib/pool-registry";
import {
  buildLeaderboard,
  buildStats,
  buildToolsWithClaims,
  mapEndorsement,
  mapValidator,
  type ClaimRow,
  type ToolRow,
} from "@/lib/query-mappers";
import type {
  Category,
  Cluster,
  LeaderboardResponse,
  PoolBadge,
  RegistryResponse,
  SfdpStatus,
  Stats,
  ToolStatus,
  ToolWithClaims,
  ValidatorProfile,
} from "@/lib/types";

// Registry and leaderboard only list claims that count; profile and tool pages also show pending ones.
const PUBLIC_CLAIM_STATUSES = ["active", "stale"] as const;
const DISPLAY_CLAIM_STATUSES = ["active", "stale", "pending"] as const;

/** Identities (among the given ones) that have a stored icon. */
async function withIcons(identities: string[]): Promise<Set<string>> {
  if (identities.length === 0) return new Set();
  const rows = await getDb().select({ identity: validatorIcons.identity }).from(validatorIcons).where(inArray(validatorIcons.identity, identities));
  return new Set(rows.map((r) => r.identity));
}

const LAMPORTS_PER_SOL = 1_000_000_000n;

/**
 * Stake pool badges and SFDP status of verified validators, read from our own tables (never from the RPC).
 * Pools that are not in the registry or approved are never returned, whatever a stale row says.
 * Callers pass only identities with an active claim; every one of them gets an entry.
 */
export async function getPoolBadges(identities: string[]): Promise<Map<string, { pools: PoolBadge[]; sfdp: SfdpStatus | null }>> {
  const out = new Map<string, { pools: PoolBadge[]; sfdp: SfdpStatus | null }>();
  if (identities.length === 0) return out;
  const db = getDb();
  const [stake, sfdpRows, approved] = await Promise.all([
    db.select().from(validatorPoolStake).where(inArray(validatorPoolStake.identity, identities)),
    db.select().from(validatorSfdp).where(inArray(validatorSfdp.identity, identities)),
    loadApprovedPools(),
  ]);
  const meta = poolMetaMap(approved);
  for (const id of identities) out.set(id, { pools: [], sfdp: null });
  for (const r of stake) {
    const m = meta.get(r.poolId);
    if (!m) continue;
    out.get(r.identity)?.pools.push({ id: r.poolId, name: m.name, logo: m.logo, sol: Number((r.lamports + LAMPORTS_PER_SOL / 2n) / LAMPORTS_PER_SOL) });
  }
  for (const v of out.values()) v.pools.sort((a, b) => b.sol - a.sol || (a.id < b.id ? -1 : 1));
  for (const r of sfdpRows) {
    if (r.lastOkAt) {
      const e = out.get(r.identity);
      if (e) e.sfdp = { participant: r.participant, checkedAt: r.lastOkAt.toISOString() };
    }
  }
  return out;
}

async function withClaims(toolRows: ToolRow[]): Promise<ToolWithClaims[]> {
  if (toolRows.length === 0) return [];
  const db = getDb();
  const claimRows: ClaimRow[] = await db
    .select()
    .from(claims)
    .where(and(inArray(claims.toolId, toolRows.map((t) => t.id)), inArray(claims.status, [...DISPLAY_CLAIM_STATUSES])));
  const seeds = await db
    .select({ toolId: seedEntries.toolId, validatorName: seedEntries.validatorName, sourceUrl: seedEntries.sourceUrl })
    .from(seedEntries)
    .where(inArray(seedEntries.toolId, toolRows.map((t) => t.id)));
  const ids = [...new Set(claimRows.map((c) => c.identity))];
  const names = ids.length
    ? await db
        .select({ identity: validators.identity, cluster: validators.cluster, name: validators.name })
        .from(validators)
        .where(inArray(validators.identity, ids))
    : [];
  const icons = await withIcons(ids);
  return buildToolsWithClaims(toolRows, claimRows, names.map((n) => ({ ...n, hasIcon: icons.has(n.identity) })), seeds);
}

export async function getStats(): Promise<Stats> {
  const db = getDb();
  const [allTools, activeClaims, seedRows, [v]] = await Promise.all([
    db.select({ id: tools.id, category: tools.category }).from(tools),
    db.select({ toolId: claims.toolId, identity: claims.identity }).from(claims).where(eq(claims.status, "active")),
    db.select({ toolId: seedEntries.toolId }).from(seedEntries),
    db.select({ total: sql<number>`count(*)`, updatedAt: max(validators.updatedAt) }).from(validators).where(inArray(validators.cluster, [...ENABLED_CLUSTERS])),
  ]);
  // A tool counts when it is seeded or has an active claim; pending, stale-only and withdrawn ones do not.
  const counted = new Set([...activeClaims.map((c) => c.toolId), ...seedRows.map((s) => s.toolId)]);
  const toolRows = allTools.filter((t) => counted.has(t.id));
  return buildStats(toolRows, activeClaims, Number(v?.total ?? 0), v?.updatedAt ?? null);
}

export async function getLeaderboard(opts: {
  cluster?: Cluster;
  page?: number;
  pageSize?: number;
}): Promise<LeaderboardResponse> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 25)));
  if (opts.cluster && !isEnabledCluster(opts.cluster)) return { items: [], page, pageSize, total: 0 };
  const db = getDb();

  const [liveClaims, toolRows] = await Promise.all([
    db
      .select({ toolId: claims.toolId, identity: claims.identity, cluster: claims.cluster, status: claims.status })
      .from(claims)
      .where(inArray(claims.status, [...PUBLIC_CLAIM_STATUSES])),
    db.select().from(tools),
  ]);

  const identities = [...new Set(liveClaims.map((c) => c.identity))];
  if (identities.length === 0) return { items: [], page, pageSize, total: 0 };
  const match = inArray(validators.identity, identities);

  const validatorRows = await db
    .select()
    .from(validators)
    .where(and(opts.cluster ? eq(validators.cluster, opts.cluster) : inArray(validators.cluster, [...ENABLED_CLUSTERS]), match))
    .orderBy(desc(validators.activatedStake));

  const built = buildLeaderboard(validatorRows, liveClaims, toolRows, page, pageSize, await withIcons(identities));
  // Badges only for validators whose claim is active (verified): stale or pending ones show none.
  const verified = new Set(liveClaims.filter((c) => c.status === "active").map((c) => c.identity));
  const badges = await getPoolBadges(built.items.map((i) => i.validator.identity).filter((id) => verified.has(id)));
  const items = built.items.map((row) => {
    const b = badges.get(row.validator.identity);
    return b ? { ...row, pools: b.pools, sfdp: b.sfdp } : row;
  });
  return { items, page, pageSize, total: built.total };
}

export async function getValidatorProfile(identity: string): Promise<ValidatorProfile | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(validators)
    .where(and(eq(validators.identity, identity), inArray(validators.cluster, [...ENABLED_CLUSTERS])));
  if (rows.length === 0) return null;
  // One identity may exist on several clusters: prefer mainnet, then the largest stake.
  const best = [...rows].sort((a, b) => {
    if ((a.cluster === "mainnet") !== (b.cluster === "mainnet")) return a.cluster === "mainnet" ? -1 : 1;
    return a.activatedStake > b.activatedStake ? -1 : a.activatedStake < b.activatedStake ? 1 : 0;
  })[0];

  const [claimed, endorsementRows] = await Promise.all([
    db
      .select({ toolId: claims.toolId, status: claims.status })
      .from(claims)
      .where(and(eq(claims.identity, identity), inArray(claims.status, [...DISPLAY_CLAIM_STATUSES]))),
    db.select().from(endorsements).where(eq(endorsements.identity, identity)),
  ]);
  const toolIds = [...new Set(claimed.map((r) => r.toolId))];
  const toolRows = toolIds.length ? await db.select().from(tools).where(inArray(tools.id, toolIds)) : [];

  const badges = claimed.some((c) => c.status === "active") ? (await getPoolBadges([best.identity])).get(best.identity) : undefined;
  return {
    validator: mapValidator(best, (await withIcons([best.identity])).has(best.identity)),
    tools: await withClaims(toolRows),
    endorsements: endorsementRows.map(mapEndorsement),
    ...(badges ? { pools: badges.pools, sfdp: badges.sfdp } : {}),
  };
}

export async function getTools(opts: {
  category?: Category;
  status?: ToolStatus;
}): Promise<ToolWithClaims[]> {
  const rows = await getDb()
    .select()
    .from(tools)
    .where(opts.category ? eq(tools.category, opts.category) : undefined)
    .orderBy(tools.name);
  // An owner exists only for seeded tools or tools with an active or stale claim, so
  // pending-only (and withdrawn or rejected) ones stay out of the public listing.
  const all = (await withClaims(rows)).filter((t) => t.owner !== null);
  return opts.status ? all.filter((t) => t.status === opts.status) : all;
}

export async function getToolBySlug(slug: string): Promise<ToolWithClaims | null> {
  const rows = await getDb().select().from(tools).where(eq(tools.slug, slug)).limit(1);
  return (await withClaims(rows))[0] ?? null;
}

/** Tool by canonical url (normalizeToolUrl form), with its claims; null when the url is not listed. */
export async function getToolByUrl(url: string): Promise<ToolWithClaims | null> {
  const rows = await getDb().select().from(tools).where(eq(tools.url, url)).limit(1);
  return (await withClaims(rows))[0] ?? null;
}

export async function getToolSlugById(id: number): Promise<string | null> {
  const rows = await getDb().select({ slug: tools.slug }).from(tools).where(eq(tools.id, id)).limit(1);
  return rows[0]?.slug ?? null;
}

/** Full public registry: every active or stale claim with its message and signature. */
export async function getRegistry(): Promise<RegistryResponse> {
  const rows = await getDb()
    .select({ claim: claims, toolUrl: tools.url, toolName: tools.name, toolCategory: tools.category })
    .from(claims)
    .innerJoin(tools, eq(tools.id, claims.toolId))
    .where(inArray(claims.status, [...PUBLIC_CLAIM_STATUSES]))
    .orderBy(claims.id);
  return {
    generatedAt: new Date().toISOString(),
    entries: rows.map((r) => ({
      tool: { url: r.toolUrl, name: r.toolName, category: r.toolCategory },
      identity: r.claim.identity,
      cluster: r.claim.cluster,
      message: r.claim.message,
      signature: r.claim.signature,
      status: r.claim.status,
    })),
  };
}
