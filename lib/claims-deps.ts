import { and, count, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, tools, validators } from "@/db/schema";
import { ENABLED_CLUSTERS } from "@/lib/clusters";
import { getEnv } from "@/lib/env";
import { e2eOverrides } from "@/lib/claims-stub";
import { safeFetcher } from "@/lib/safe-fetch";
import type { Fetcher, RepoMetadata } from "@/lib/claims";
import { proofFileUrl, registrableDomain } from "@/lib/claims";
import type { ClaimsDeps } from "@/lib/claims-service";
import type { Claim, Cluster } from "@/lib/types";

const FETCH_TIMEOUT_MS = 5000;

async function gh<T>(path: string): Promise<{ data: T; link: string | null } | null> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "proof-of-tooling" };
  const token = getEnv().GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  return { data: (await res.json()) as T, link: res.headers.get("link") };
}

async function getRepoMetadata(toolUrl: string): Promise<RepoMetadata | null> {
  const [, owner, repo] = toolUrl.split("/");
  const info = await gh<{
    private: boolean; archived: boolean; fork: boolean; created_at: string; default_branch: string;
    parent?: { full_name: string; default_branch: string };
  }>(`/repos/${owner}/${repo}`);
  if (!info) return null;
  const r = info.data;
  const commits = await gh<unknown[]>(`/repos/${owner}/${repo}/commits?per_page=1`);
  if (!commits) return null;
  const last = commits.link?.match(/[?&]page=(\d+)>; rel="last"/);
  const commitCount = last ? Number(last[1]) : commits.data.length;
  let ownCommits = commitCount;
  if (r.fork && r.parent) {
    const cmp = await gh<{ ahead_by: number }>(
      `/repos/${r.parent.full_name}/compare/${r.parent.default_branch}...${owner}:${r.default_branch}`,
    );
    ownCommits = cmp?.data.ahead_by ?? 0;
  }
  return { isPrivate: r.private, archived: r.archived, isFork: r.fork, commitCount, ownCommits, createdAt: r.created_at };
}

type ClaimRow = typeof claims.$inferSelect;
const toClaim = (r: ClaimRow): Claim => ({
  id: r.id,
  toolId: r.toolId,
  identity: r.identity,
  cluster: r.cluster,
  message: r.message,
  signature: r.signature,
  signedDate: r.signedDate,
  status: r.status,
  verifiedAt: r.verifiedAt.toISOString(),
  lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
});

/** Other web tools of this identity (active or pending) under the same registrable domain. */
async function sameDomainClaims(toolUrl: string, identity: string): Promise<number> {
  const domain = registrableDomain(toolUrl);
  if (!domain) return 0;
  const rows = await getDb()
    .select({ url: tools.url })
    .from(claims)
    .innerJoin(tools, eq(tools.id, claims.toolId))
    .where(and(eq(claims.identity, identity), inArray(claims.status, ["active", "pending"]), eq(tools.kind, "web")));
  return rows.filter((r) => r.url !== toolUrl && registrableDomain(r.url) === domain).length;
}

/**
 * Upsert guard, evaluated against the stored row: a rejected claim stays rejected, an older
 * signed message never overwrites a newer one, and an unclaim wins over a claim signed the same day.
 */
const applyUpdate = sql`(${claims.status} <> 'rejected' AND ${claims.signedDate} <= VALUES(${claims.signedDate}) AND NOT (${claims.signedDate} = VALUES(${claims.signedDate}) AND ${claims.status} = 'withdrawn' AND VALUES(${claims.status}) <> 'withdrawn'))`;
const keepOrTake = (col: typeof claims.status | typeof claims.cluster | typeof claims.message | typeof claims.signature | typeof claims.signedDate) =>
  sql`IF(${applyUpdate}, VALUES(${col}), ${col})`;

const slugOf = (url: string) => url.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 128);

export function createClaimsDeps(): ClaimsDeps {
  return {
    now: () => new Date(),
    fetcher: safeFetcher,
    getRepoMetadata,

    async findValidatorCluster(identity) {
      const rows = await getDb().select({ cluster: validators.cluster }).from(validators).where(eq(validators.identity, identity));
      const clusters = rows.map((r) => r.cluster as Cluster).filter((c) => ENABLED_CLUSTERS.includes(c));
      return clusters.includes("mainnet") ? "mainnet" : (clusters[0] ?? null);
    },

    async getHistory(toolUrl, identity) {
      const db = getDb();
      const [tool] = await db.select().from(tools).where(eq(tools.url, toolUrl));
      const since = new Date(Date.now() - 86_400_000);
      const [recent] = await db.select({ n: count() }).from(claims).where(and(eq(claims.identity, identity), gte(claims.verifiedAt, since)));
      if (!tool) return { existing: null, identityClaimsLast24h: recent.n, otherClaimants: 0, sameDomainClaims: await sameDomainClaims(toolUrl, identity) };
      const [existing] = await db.select().from(claims).where(and(eq(claims.toolId, tool.id), eq(claims.identity, identity)));
      const [others] = await db.select({ n: count() }).from(claims).where(and(eq(claims.toolId, tool.id), ne(claims.identity, identity), eq(claims.status, "active")));
      return {
        existing: existing ? toClaim(existing) : null,
        identityClaimsLast24h: recent.n,
        otherClaimants: others.n,
        sameDomainClaims: await sameDomainClaims(toolUrl, identity),
      };
    },

    async saveClaim(input) {
      const db = getDb();
      let [tool] = await db.select().from(tools).where(eq(tools.url, input.toolUrl));
      if (!tool) {
        const kind = proofFileUrl(input.toolUrl)?.kind ?? "web";
        const name = input.toolName?.trim() || (input.toolUrl.split("/").pop() ?? input.toolUrl);
        await db.insert(tools).values({ slug: slugOf(input.toolUrl), url: input.toolUrl, name, category: input.category ?? "Ops script", kind });
        [tool] = await db.select().from(tools).where(eq(tools.url, input.toolUrl));
      }
      const status = input.action === "unclaim" ? "withdrawn" : input.pending ? "pending" : "active";
      await db
        .insert(claims)
        .values({ toolId: tool.id, identity: input.identity, cluster: input.cluster, message: input.message, signature: input.signature, signedDate: input.signedDate, status })
        // SET runs left to right and later expressions see the updated columns, so status
        // is applied before signed_date, and verified_at before both.
        .onDuplicateKeyUpdate({
          set: {
            cluster: keepOrTake(claims.cluster),
            message: keepOrTake(claims.message),
            signature: keepOrTake(claims.signature),
            verifiedAt: sql`IF(${applyUpdate}, CURRENT_TIMESTAMP, ${claims.verifiedAt})`,
            status: keepOrTake(claims.status),
            signedDate: keepOrTake(claims.signedDate),
          },
        });
      const [row] = await db.select().from(claims).where(and(eq(claims.toolId, tool.id), eq(claims.identity, input.identity)));
      return toClaim(row);
    },
    ...e2eOverrides(),
  };
}
