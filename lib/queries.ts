import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ENABLED_CLUSTERS, isEnabledCluster } from "@/lib/clusters";
import { claims, endorsements, seedEntries, tools, validators } from "@/db/schema";
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
  RegistryResponse,
  Stats,
  ToolStatus,
  ToolWithClaims,
  ValidatorProfile,
} from "@/lib/types";

// Registry and leaderboard only list claims that count; profile and tool pages also show pending ones.
const PUBLIC_CLAIM_STATUSES = ["active", "stale"] as const;
const DISPLAY_CLAIM_STATUSES = ["active", "stale", "pending"] as const;

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
  return buildToolsWithClaims(toolRows, claimRows, names, seeds);
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

  const { items, total } = buildLeaderboard(validatorRows, liveClaims, toolRows, page, pageSize);
  return { items, page, pageSize, total };
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
      .select({ toolId: claims.toolId })
      .from(claims)
      .where(and(eq(claims.identity, identity), inArray(claims.status, [...DISPLAY_CLAIM_STATUSES]))),
    db.select().from(endorsements).where(eq(endorsements.identity, identity)),
  ]);
  const toolIds = [...new Set(claimed.map((r) => r.toolId))];
  const toolRows = toolIds.length ? await db.select().from(tools).where(inArray(tools.id, toolIds)) : [];

  return {
    validator: mapValidator(best),
    tools: await withClaims(toolRows),
    endorsements: endorsementRows.map(mapEndorsement),
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
