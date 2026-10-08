// Pure row -> API shape logic, kept free of DB access so it can be unit tested.
import type { claims, endorsements, tools, validators } from "@/db/schema";
import { iconPath } from "@/lib/validator-icons";
import {
  CATEGORIES,
  type Category,
  type Claim,
  type Cluster,
  type Endorsement,
  type LeaderboardRow,
  type LeaderboardToolStatus,
  type Stats,
  type Tool,
  type ToolWithClaims,
  type Validator,
} from "@/lib/types";

export type ValidatorRow = typeof validators.$inferSelect;
export type ToolRow = typeof tools.$inferSelect;
export type ClaimRow = typeof claims.$inferSelect;
export type EndorsementRow = typeof endorsements.$inferSelect;

const iso = (d: Date) => d.toISOString();

/**
 * `hasIcon`: our own stored copy of the on-chain icon exists. `iconUrl` in the API is then the path that
 * serves it; the third-party url from validator-info never leaves the server.
 */
export function mapValidator(r: ValidatorRow, hasIcon = false): Validator {
  return {
    identity: r.identity,
    cluster: r.cluster,
    voteAccount: r.voteAccount,
    name: r.name,
    website: r.website,
    iconUrl: hasIcon ? iconPath(r.identity) : null,
    activatedStake: r.activatedStake.toString(),
    version: r.version,
    delinquent: r.delinquent,
    updatedAt: iso(r.updatedAt),
  };
}

export function mapTool(r: ToolRow): Tool {
  return {
    id: r.id,
    slug: r.slug,
    url: r.url,
    name: r.name,
    category: r.category,
    kind: r.kind,
    isFork: r.isFork,
    stars: r.stars,
    lastCommitAt: r.lastCommitAt ? iso(r.lastCommitAt) : null,
    health: r.health,
    createdAt: iso(r.createdAt),
  };
}

export function mapClaim(r: ClaimRow): Claim {
  return {
    id: r.id,
    toolId: r.toolId,
    identity: r.identity,
    cluster: r.cluster,
    message: r.message,
    signature: r.signature,
    signedDate: r.signedDate,
    status: r.status,
    verifiedAt: iso(r.verifiedAt),
    lastCheckedAt: r.lastCheckedAt ? iso(r.lastCheckedAt) : null,
  };
}

export function mapEndorsement(r: EndorsementRow): Endorsement {
  return {
    id: r.id,
    toolId: r.toolId,
    identity: r.identity,
    message: r.message,
    signature: r.signature,
    createdAt: iso(r.createdAt),
  };
}

export type ValidatorName = { identity: string; cluster: Cluster; name: string | null; hasIcon?: boolean };

const nameKey = (identity: string, cluster: string) => `${identity}:${cluster}`;

export type SeedRef = { toolId: number; validatorName: string; sourceUrl?: string };

export function buildToolsWithClaims(
  toolRows: ToolRow[],
  claimRows: ClaimRow[],
  names: ValidatorName[],
  seeds: SeedRef[] = [],
): ToolWithClaims[] {
  const seedByTool = new Map<number, { name: string; sourceUrl: string | null }>();
  for (const sd of seeds) {
    if (!seedByTool.has(sd.toolId)) seedByTool.set(sd.toolId, { name: sd.validatorName, sourceUrl: sd.sourceUrl ?? null });
  }
  const nameMap = new Map(names.map((n) => [nameKey(n.identity, n.cluster), n.name]));
  const iconSet = new Set(names.filter((n) => n.hasIcon).map((n) => nameKey(n.identity, n.cluster)));
  const byTool = new Map<number, Claim[]>();
  for (const c of claimRows) {
    if (c.status !== "active" && c.status !== "stale" && c.status !== "pending") continue;
    const list = byTool.get(c.toolId) ?? [];
    list.push(mapClaim(c));
    byTool.set(c.toolId, list);
  }
  return toolRows.map((t) => {
    const cl = byTool.get(t.id) ?? [];
    const active = cl.filter((c) => c.status === "active");
    const lead = active[0] ?? cl.find((c) => c.status === "stale"); // pending claims never name an owner
    const seed = seedByTool.get(t.id);
    const seedName = seed?.name;
    const leadName = lead ? (nameMap.get(nameKey(lead.identity, lead.cluster)) ?? null) : null;
    const owner: ToolWithClaims["owner"] = lead
      ? { name: leadName ?? seedName ?? lead.identity, identity: lead.identity, sourceUrl: active.length === 0 ? (seed?.sourceUrl ?? null) : null }
      : seed
        ? { name: seed.name, identity: null, sourceUrl: seed.sourceUrl }
        : null;
    return {
      ...mapTool(t),
      status: active.length > 0 ? "claimed" : "unclaimed",
      owner,
      claims: cl,
      claimedBy: active.map((c) => ({
        identity: c.identity,
        cluster: c.cluster,
        name: nameMap.get(nameKey(c.identity, c.cluster)) ?? null,
        iconUrl: iconSet.has(nameKey(c.identity, c.cluster)) ? iconPath(c.identity) : null,
      })),
    };
  });
}

export function buildStats(
  toolRows: Pick<ToolRow, "id" | "category">[],
  activeClaims: Pick<ClaimRow, "toolId" | "identity">[],
  validatorsTotal: number,
  updatedAt: Date | null,
  now = new Date(),
): Stats {
  const known = new Set(toolRows.map((t) => t.id));
  const claimedTools = new Set(activeClaims.filter((c) => known.has(c.toolId)).map((c) => c.toolId));
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const t of toolRows) byCategory[t.category]++;
  return {
    toolsTotal: toolRows.length,
    toolsClaimed: claimedTools.size,
    toolsUnclaimed: toolRows.length - claimedTools.size,
    validatorsWithTools: new Set(activeClaims.map((c) => c.identity)).size,
    validatorsTotal,
    byCategory,
    updatedAt: iso(updatedAt ?? now),
  };
}

type LeaderTool = LeaderboardRow["tools"][number];

/**
 * Validators ranked by signed tools. Seed entries are never attributed to a validator (their
 * names are untrusted free text); a tool only counts for a validator through its own signed
 * claim. Expired (stale) claims are listed but do not count.
 */
export function buildLeaderboard(
  validatorRows: ValidatorRow[],
  liveClaims: Pick<ClaimRow, "toolId" | "identity" | "cluster" | "status">[],
  toolRows: ToolRow[],
  page: number,
  pageSize: number,
  iconIdentities: ReadonlySet<string> = new Set(),
): { items: LeaderboardRow[]; total: number } {
  const toolById = new Map(toolRows.map((t) => [t.id, t]));
  // tool id -> "signed" if any active claim, else "stale", per validator
  const claimsByKey = new Map<string, Map<number, LeaderboardToolStatus>>();
  for (const c of liveClaims) {
    if (c.status !== "active" && c.status !== "stale") continue;
    const k = nameKey(c.identity, c.cluster);
    const map = claimsByKey.get(k) ?? claimsByKey.set(k, new Map()).get(k)!;
    if (c.status === "active" || !map.has(c.toolId)) map.set(c.toolId, c.status === "active" ? "signed" : "stale");
  }

  const rows: LeaderboardRow[] = [];
  for (const v of validatorRows) {
    const claimed = claimsByKey.get(nameKey(v.identity, v.cluster)) ?? new Map<number, LeaderboardToolStatus>();
    const list: LeaderTool[] = [];
    for (const [id, status] of claimed) {
      const t = toolById.get(id);
      if (t) list.push({ id: t.id, slug: t.slug, name: t.name, category: t.category, url: t.url, status });
    }
    const signed = list.filter((t) => t.status === "signed").length;
    if (signed === 0) continue;
    list.sort((a, b) => a.name.localeCompare(b.name));
    rows.push({ validator: mapValidator(v, iconIdentities.has(v.identity)), toolCount: signed, claimedCount: signed, tools: list });
  }
  rows.sort((a, b) => {
    if (b.toolCount !== a.toolCount) return b.toolCount - a.toolCount;
    const sa = BigInt(a.validator.activatedStake);
    const sb = BigInt(b.validator.activatedStake);
    return sb > sa ? 1 : sb < sa ? -1 : 0;
  });
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), total: rows.length };
}
