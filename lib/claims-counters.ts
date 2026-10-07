import { and, count, eq, gte, inArray, like, ne } from "drizzle-orm";
import type { getDb } from "@/db";
import { claims, tools } from "@/db/schema";
import { registrableDomain } from "@/lib/claims";

/** Anything that can run a select: the database itself or a transaction. */
type Reader = Pick<ReturnType<typeof getDb>, "select">;

export interface ClaimCounters {
  /** Claims of this identity in the last 24 hours, on other tools. */
  identityClaimsLast24h: number;
  /** Other identities with an active claim on this tool. */
  otherClaimants: number;
  /** Other web tools of this identity (active or pending) under the same registrable domain. */
  sameDomainClaims: number;
  /** Claims of any identity (active or pending) on other web tools under the same registrable domain. */
  domainClaimsAllIdentities: number;
  /** Active claims of this identity on other tools. */
  identityActiveClaims: number;
  /** Claims of this identity waiting for review (any tool). */
  pendingClaims: number;
}

/**
 * The counters the anti-abuse rules depend on. saveClaim reads them inside the identity lock,
 * so concurrent requests of one identity cannot all see the same stale numbers.
 */
export async function readCounters(db: Reader, toolUrl: string, identity: string, now: Date): Promise<ClaimCounters> {
  const since = new Date(now.getTime() - 86_400_000);
  const elsewhere = ne(tools.url, toolUrl);
  const mine = eq(claims.identity, identity);

  const [recent] = await db
    .select({ n: count() })
    .from(claims)
    .innerJoin(tools, eq(tools.id, claims.toolId))
    .where(and(mine, gte(claims.verifiedAt, since), elsewhere));
  const [active] = await db
    .select({ n: count() })
    .from(claims)
    .innerJoin(tools, eq(tools.id, claims.toolId))
    .where(and(mine, eq(claims.status, "active"), elsewhere));
  const [pending] = await db.select({ n: count() }).from(claims).where(and(mine, eq(claims.status, "pending")));
  const [others] = await db
    .select({ n: count() })
    .from(claims)
    .innerJoin(tools, eq(tools.id, claims.toolId))
    .where(and(eq(tools.url, toolUrl), ne(claims.identity, identity), eq(claims.status, "active")));

  let sameDomainClaims = 0;
  let domainClaimsAllIdentities = 0;
  const domain = registrableDomain(toolUrl);
  if (domain) {
    // Domains only contain [a-z0-9.-], so they need no LIKE escaping; the exact match is checked in JS.
    const rows = await db
      .select({ url: tools.url, identity: claims.identity })
      .from(claims)
      .innerJoin(tools, eq(tools.id, claims.toolId))
      .where(and(inArray(claims.status, ["active", "pending"]), eq(tools.kind, "web"), elsewhere, like(tools.url, `%${domain}%`)));
    const sameDomain = rows.filter((r) => registrableDomain(r.url) === domain);
    domainClaimsAllIdentities = sameDomain.length;
    sameDomainClaims = sameDomain.filter((r) => r.identity === identity).length;
  }

  return {
    identityClaimsLast24h: recent.n,
    otherClaimants: others.n,
    sameDomainClaims,
    domainClaimsAllIdentities,
    identityActiveClaims: active.n,
    pendingClaims: pending.n,
  };
}
