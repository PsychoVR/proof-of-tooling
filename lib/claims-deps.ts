import { createHash } from "node:crypto";
import { and, count, eq, gte, notExists, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, seedEntries, tools, validators } from "@/db/schema";
import { ENABLED_CLUSTERS } from "@/lib/clusters";
import { getEnv } from "@/lib/env";
import { e2eOverrides } from "@/lib/claims-stub";
import { resolveTxt } from "@/lib/dns-txt";
import { safeFetcher } from "@/lib/safe-fetch";
import type { Fetcher, RepoMetadata } from "@/lib/claims";
import {
  evaluateRepoRules,
  evaluateWebRules,
  MAX_PENDING_PER_IDENTITY,
  MAX_TOOLS_CREATED_PER_IDENTITY,
  mergeClaim,
  proofFileUrl,
} from "@/lib/claims";
import { readCounters } from "@/lib/claims-counters";
import { recordClaimFailure } from "@/lib/claim-failures";
import { PendingLimitError, RuleRejectedError, ToolQuotaError, UnknownValidatorError, type ClaimsDeps } from "@/lib/claims-service";
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

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** The readable slug with a short hash of the url, used when the readable one is taken. */
const hashedSlug = (toolUrl: string) => `${slugOf(toolUrl).slice(0, 120)}-${createHash("sha1").update(toolUrl).digest("hex").slice(0, 7)}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 6;
/** Validators not seen by the ingest for this long are ignored when resolving a claimant. */
const VALIDATOR_MAX_AGE_MS = 3 * 86_400_000;

type SaveInput = Parameters<ClaimsDeps["saveClaim"]>[0];

async function saveInTx(tx: Tx, input: SaveInput): Promise<Claim> {
  // One lock per identity serializes its claims. An unknown identity stores nothing.
  const [lock] = await tx
    .select({ id: validators.id })
    .from(validators)
    .where(eq(validators.identity, input.identity))
    .orderBy(validators.id)
    .limit(1)
    .for("update");
  if (!lock) throw new UnknownValidatorError();

  // Plain reads from here on: the snapshot starts after the lock, so it includes this identity's earlier requests.
  let [tool] = await tx.select().from(tools).where(eq(tools.url, input.toolUrl));
  let existing: ClaimRow | undefined;
  if (tool) {
    [existing] = await tx.select().from(claims).where(and(eq(claims.toolId, tool.id), eq(claims.identity, input.identity)));
    // Lock the stored row by primary key (record lock only, no gap) so a moderation decision cannot interleave.
    if (existing) [existing] = await tx.select().from(claims).where(eq(claims.id, existing.id)).for("update");
  }

  let status: ClaimStatus = input.action === "unclaim" ? "withdrawn" : input.pending ? "pending" : "active";
  if (existing && mergeClaim(existing, { status, signedDate: input.signedDate }) === "keep") return toClaim(existing);

  if (input.action === "claim" && input.recheck) {
    const c = await readCounters(tx, input.toolUrl, input.identity, input.recheck.now);
    const ctx = {
      now: input.recheck.now,
      identityClaimsLast24h: c.identityClaimsLast24h,
      alreadyClaimedBySameIdentity: false,
      otherClaimants: c.otherClaimants,
      identityActiveClaims: c.identityActiveClaims,
    };
    let outcome;
    if (proofFileUrl(input.toolUrl)?.kind === "repo") {
      if (!input.recheck.repo) throw new Error("repository metadata is required to re-check the rules");
      outcome = evaluateRepoRules(input.recheck.repo, ctx);
    } else {
      outcome = evaluateWebRules({ ...ctx, sameDomainClaims: c.sameDomainClaims, domainClaimsAllIdentities: c.domainClaimsAllIdentities });
    }
    if (outcome.decision === "reject") throw new RuleRejectedError(outcome.reasons);
    if (outcome.decision === "review") status = "pending";
  }

  if (status === "pending" && existing?.status !== "pending") {
    const [pending] = await tx.select({ n: count() }).from(claims).where(and(eq(claims.identity, input.identity), eq(claims.status, "pending")));
    if (pending.n >= MAX_PENDING_PER_IDENTITY) throw new PendingLimitError();
  }

  if (!tool) {
    // Claim and unclaim churn keeps the claim rows, so it cannot free quota to create more tools.
    const [created] = await tx
      .select({ n: count() })
      .from(claims)
      .innerJoin(tools, eq(tools.id, claims.toolId))
      .where(and(eq(claims.identity, input.identity), notExists(tx.select({ one: seedEntries.id }).from(seedEntries).where(eq(seedEntries.toolId, tools.id)))));
    if (created.n >= MAX_TOOLS_CREATED_PER_IDENTITY) throw new ToolQuotaError();
    tool = await createTool(tx, input);
  }

  const values = { cluster: input.cluster, message: input.message, signature: input.signature, signedDate: input.signedDate, status, verifiedAt: new Date(), lastCheckedAt: null, failures: 0 };
  if (existing) await tx.update(claims).set(values).where(eq(claims.id, existing.id));
  else await tx.insert(claims).values({ toolId: tool.id, identity: input.identity, ...values });
  const [row] = await tx.select().from(claims).where(and(eq(claims.toolId, tool.id), eq(claims.identity, input.identity)));
  return toClaim(row);
}

/**
 * Creates the tool if nobody did, without ever failing on a duplicate: the first claimant's row wins.
 * The readable slug can collide with another tool's, in which case the second attempt uses a hashed one.
 */
async function createTool(tx: Tx, input: SaveInput): Promise<typeof tools.$inferSelect> {
  const kind = proofFileUrl(input.toolUrl)?.kind ?? "web";
  const name = input.toolName?.trim() || (input.toolUrl.split("/").pop() ?? input.toolUrl);
  for (const slug of [slugOf(input.toolUrl), hashedSlug(input.toolUrl)]) {
    await tx
      .insert(tools)
      .values({ slug, url: input.toolUrl, name, category: input.category ?? "Ops script", kind })
      .onDuplicateKeyUpdate({ set: { id: sql`id` } });
    // Locking read: waits for a concurrent creator to commit and sees its row.
    const [row] = await tx.select().from(tools).where(eq(tools.url, input.toolUrl)).for("update");
    if (row) return row;
  }
  throw new Error("could not create the tool: slug unavailable");
}

function isRetryable(err: unknown): boolean {
  const codes = new Set(["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT", "ER_CHECKREAD"]);
  for (let e = err as { code?: string; cause?: unknown } | undefined, i = 0; e && i < 4; e = e.cause as typeof e, i++) {
    if (e.code && codes.has(e.code)) return true;
  }
  return false;
}

const slugOf = (url: string) => url.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 128);

export function createClaimsDeps(): ClaimsDeps {
  return {
    now: () => new Date(),
    recordFailure: recordClaimFailure,
    fetcher: safeFetcher,
    resolveTxt,
    getRepoMetadata,

    async findValidatorCluster(identity) {
      // Validators the ingest has not refreshed recently may have left the set: they cannot claim.
      const fresh = gte(validators.updatedAt, new Date(Date.now() - VALIDATOR_MAX_AGE_MS));
      const rows = await getDb().select({ cluster: validators.cluster }).from(validators).where(and(eq(validators.identity, identity), fresh));
      const clusters = rows.map((r) => r.cluster as Cluster).filter((c) => ENABLED_CLUSTERS.includes(c));
      return clusters.includes("mainnet") ? "mainnet" : (clusters[0] ?? null);
    },

    async getHistory(toolUrl, identity) {
      const db = getDb();
      const c = await readCounters(db, toolUrl, identity, new Date());
      const [tool] = await db.select().from(tools).where(eq(tools.url, toolUrl));
      const [existing] = tool ? await db.select().from(claims).where(and(eq(claims.toolId, tool.id), eq(claims.identity, identity))) : [];
      return {
        existing: existing ? toClaim(existing) : null,
        identityClaimsLast24h: c.identityClaimsLast24h,
        otherClaimants: c.otherClaimants,
        sameDomainClaims: c.sameDomainClaims,
        domainClaimsAllIdentities: c.domainClaimsAllIdentities,
        identityActiveClaims: c.identityActiveClaims,
        pendingClaims: c.pendingClaims,
      };
    },

    /**
     * Stores a verified claim in one transaction. The only lock taken before reading is on the
     * identity's validator row, which serializes that identity's requests: the counters behind the
     * anti-abuse rules and the pending limit are recomputed under it, so concurrent requests cannot
     * all pass on stale numbers. Rows that may not exist yet are never locked (no gap locks): the
     * tool is created with an idempotent INSERT ... ON DUPLICATE KEY, and the claim row is locked by
     * primary key only when it exists. Deadlocks and duplicate keys between different identities are
     * retried with exponential backoff and jitter; anything else fails closed.
     */
    async saveClaim(input) {
      const db = getDb();
      for (let attempt = 0; ; attempt++) {
        try {
          return await db.transaction((tx) => saveInTx(tx, input));
        } catch (err) {
          if (attempt < MAX_ATTEMPTS - 1 && isRetryable(err)) {
            await sleep(20 * 2 ** attempt + Math.random() * 40);
            continue;
          }
          throw err;
        }
      }
    },
    ...e2eOverrides(),
  };
}
