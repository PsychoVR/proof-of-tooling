import { createHash } from "node:crypto";
import { and, count, eq, gte, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, tools, validators } from "@/db/schema";
import { ENABLED_CLUSTERS } from "@/lib/clusters";
import { getEnv } from "@/lib/env";
import { e2eOverrides } from "@/lib/claims-stub";
import { resolveTxt } from "@/lib/dns-txt";
import { safeFetcher } from "@/lib/safe-fetch";
import type { Fetcher, RepoMetadata } from "@/lib/claims";
import { MAX_PENDING_PER_IDENTITY, mergeClaim, proofFileUrl, registrableDomain } from "@/lib/claims";
import { PendingLimitError, type ClaimsDeps } from "@/lib/claims-service";
import type { Claim, ClaimStatus, Cluster } from "@/lib/types";

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

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** A slug nobody else uses: the readable one, or with a short hash of the url when it is taken. */
async function freeSlug(tx: Tx, toolUrl: string): Promise<string> {
  const slug = slugOf(toolUrl);
  const taken = await tx.select({ url: tools.url }).from(tools).where(eq(tools.slug, slug));
  if (taken.length === 0) return slug;
  return `${slug.slice(0, 120)}-${createHash("sha1").update(toolUrl).digest("hex").slice(0, 7)}`;
}

function isRetryable(err: unknown): boolean {
  const codes = new Set(["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);
  for (let e = err as { code?: string; cause?: unknown } | undefined, i = 0; e && i < 4; e = e.cause as typeof e, i++) {
    if (e.code && codes.has(e.code)) return true;
  }
  return false;
}

const slugOf = (url: string) => url.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 128);

export function createClaimsDeps(): ClaimsDeps {
  return {
    now: () => new Date(),
    fetcher: safeFetcher,
    resolveTxt,
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
      const [pending] = await db.select({ n: count() }).from(claims).where(and(eq(claims.identity, identity), eq(claims.status, "pending")));
      if (!tool) return { existing: null, identityClaimsLast24h: recent.n, otherClaimants: 0, sameDomainClaims: await sameDomainClaims(toolUrl, identity), pendingClaims: pending.n };
      const [existing] = await db.select().from(claims).where(and(eq(claims.toolId, tool.id), eq(claims.identity, identity)));
      const [others] = await db.select({ n: count() }).from(claims).where(and(eq(claims.toolId, tool.id), ne(claims.identity, identity), eq(claims.status, "active")));
      return {
        existing: existing ? toClaim(existing) : null,
        identityClaimsLast24h: recent.n,
        otherClaimants: others.n,
        sameDomainClaims: await sameDomainClaims(toolUrl, identity),
        pendingClaims: pending.n,
      };
    },

    /**
     * Stores a verified claim. Runs in one transaction that locks the identity and the stored claim
     * row (SELECT ... FOR UPDATE) so that concurrent requests are serialized, and decides in JS
     * (mergeClaim) whether the incoming message replaces the stored one.
     */
    async saveClaim(input) {
      const db = getDb();
      for (let attempt = 0; ; attempt++) {
        try {
          return await db.transaction(async (tx) => {
            // One lock per identity serializes its claims, which also makes the pending limit exact.
            await tx.select({ id: validators.id }).from(validators).where(eq(validators.identity, input.identity)).for("update");

            let [tool] = await tx.select().from(tools).where(eq(tools.url, input.toolUrl));
            if (!tool) {
              const kind = proofFileUrl(input.toolUrl)?.kind ?? "web";
              const name = input.toolName?.trim() || (input.toolUrl.split("/").pop() ?? input.toolUrl);
              const slug = await freeSlug(tx, input.toolUrl);
              await tx.insert(tools).values({ slug, url: input.toolUrl, name, category: input.category ?? "Ops script", kind });
              [tool] = await tx.select().from(tools).where(eq(tools.url, input.toolUrl));
            }

            const status: ClaimStatus = input.action === "unclaim" ? "withdrawn" : input.pending ? "pending" : "active";
            const [existing] = await tx
              .select()
              .from(claims)
              .where(and(eq(claims.toolId, tool.id), eq(claims.identity, input.identity)))
              .for("update");

            if (mergeClaim(existing ?? null, { status, signedDate: input.signedDate }) === "keep") return toClaim(existing);

            if (status === "pending" && existing?.status !== "pending") {
              const [pending] = await tx.select({ n: count() }).from(claims).where(and(eq(claims.identity, input.identity), eq(claims.status, "pending")));
              if (pending.n >= MAX_PENDING_PER_IDENTITY) throw new PendingLimitError();
            }

            const values = { cluster: input.cluster, message: input.message, signature: input.signature, signedDate: input.signedDate, status, verifiedAt: new Date(), lastCheckedAt: null };
            if (existing) await tx.update(claims).set(values).where(eq(claims.id, existing.id));
            else await tx.insert(claims).values({ toolId: tool.id, identity: input.identity, ...values });
            const [row] = await tx.select().from(claims).where(and(eq(claims.toolId, tool.id), eq(claims.identity, input.identity)));
            return toClaim(row);
          });
        } catch (err) {
          // Two requests created the same tool or claim at once, or the database picked a deadlock victim: retry once.
          if (attempt === 0 && isRetryable(err)) continue;
          throw err;
        }
      }
    },
    ...e2eOverrides(),
  };
}
