import { and, desc, eq, inArray, max, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, endorsements, seedEntries, tools, validators } from "@/db/schema";
import {
  buildLeaderboard,
  buildStats,
  buildToolsWithClaims,
  mapEndorsement,
  mapValidator,
  normName,
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

const PUBLIC_CLAIM_STATUSES = ["active", "stale"] as const;

async function withClaims(toolRows: ToolRow[]): Promise<ToolWithClaims[]> {
  if (toolRows.length === 0) return [];
  const db = getDb();
  const claimRows: ClaimRow[] = await db
    .select()
    .from(claims)
    .where(and(inArray(claims.toolId, toolRows.map((t) => t.id)), inArray(claims.status, [...PUBLIC_CLAIM_STATUSES])));
  const ids = [...new Set(claimRows.map((c) => c.identity))];
  const names = ids.length
    ? await db
        .select({ identity: validators.identity, cluster: validators.cluster, name: validators.name })
        .from(validators)
        .where(inArray(validators.identity, ids))
    : [];
  return buildToolsWithClaims(toolRows, claimRows, names);
}

export async function getStats(): Promise<Stats> {
  const db = getDb();
  const [toolRows, activeClaims, [v]] = await Promise.all([
    db.select({ id: tools.id, category: tools.category }).from(tools),
    db.select({ toolId: claims.toolId, identity: claims.identity }).from(claims).where(eq(claims.status, "active")),
    db.select({ total: sql<number>`count(*)`, updatedAt: max(validators.updatedAt) }).from(validators),
  ]);
  return buildStats(toolRows, activeClaims, Number(v?.total ?? 0), v?.updatedAt ?? null);
}

export async function getLeaderboard(opts: {
  cluster?: Cluster;
  page?: number;
  pageSize?: number;
}): Promise<LeaderboardResponse> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 25)));
  const db = getDb();

  const [activeClaims, seeds, toolRows] = await Promise.all([
    db
      .select({ toolId: claims.toolId, identity: claims.identity, cluster: claims.cluster })
      .from(claims)
      .where(eq(claims.status, "active")),
    db.select({ toolId: seedEntries.toolId, validatorName: seedEntries.validatorName }).from(seedEntries),
    db.select().from(tools),
  ]);

  const identities = [...new Set(activeClaims.map((c) => c.identity))];
  const seedNames = [...new Set(seeds.map((s) => normName(s.validatorName)))];
  const match = or(
    identities.length ? inArray(validators.identity, identities) : undefined,
    seedNames.length ? inArray(sql`lower(trim(${validators.name}))`, seedNames) : undefined,
  );
  if (!match) return { items: [], page, pageSize, total: 0 };

  const validatorRows = await db
    .select()
    .from(validators)
    .where(opts.cluster ? and(eq(validators.cluster, opts.cluster), match) : match)
    .orderBy(desc(validators.activatedStake));

  const { items, total } = buildLeaderboard(validatorRows, activeClaims, seeds, toolRows, page, pageSize);
  return { items, page, pageSize, total };
}

export async function getValidatorProfile(identity: string): Promise<ValidatorProfile | null> {
  const db = getDb();
  const rows = await db.select().from(validators).where(eq(validators.identity, identity));
  if (rows.length === 0) return null;
  // One identity may exist on several clusters: prefer mainnet, then the largest stake.
  const best = [...rows].sort((a, b) => {
    if ((a.cluster === "mainnet") !== (b.cluster === "mainnet")) return a.cluster === "mainnet" ? -1 : 1;
    return a.activatedStake > b.activatedStake ? -1 : a.activatedStake < b.activatedStake ? 1 : 0;
  })[0];

  const [claimed, seeded, endorsementRows] = await Promise.all([
    db
      .select({ toolId: claims.toolId })
      .from(claims)
      .where(and(eq(claims.identity, identity), inArray(claims.status, [...PUBLIC_CLAIM_STATUSES]))),
    best.name
      ? db
          .select({ toolId: seedEntries.toolId })
          .from(seedEntries)
          .where(sql`lower(trim(${seedEntries.validatorName})) = ${normName(best.name)}`)
      : Promise.resolve([] as { toolId: number }[]),
    db.select().from(endorsements).where(eq(endorsements.identity, identity)),
  ]);
  const toolIds = [...new Set([...claimed, ...seeded].map((r) => r.toolId))];
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
  const all = await withClaims(rows);
  return opts.status ? all.filter((t) => t.status === opts.status) : all;
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
