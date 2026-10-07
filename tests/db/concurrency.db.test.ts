import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { DEV_VALIDATORS as V, resetDevDb, seedDevData } from "@/db/dev-data";
import { claims, tools } from "@/db/schema";
import { createClaimsDeps } from "@/lib/claims-deps";
import { evaluateWebRules } from "@/lib/claims";
import { PendingLimitError } from "@/lib/claims-service";

const rows = async <T>(q: ReturnType<typeof sql>) => (await getDb().execute(q))[0] as unknown as T[];
const clock = () => new Date("2026-10-07T12:00:00Z");

afterAll(async () => {
  await resetDevDb();
  await seedDevData();
});

describe("saveClaim concurrency (V1, V3, N6)", () => {
  beforeEach(async () => {
    await resetDevDb();
    await seedDevData();
  });
  const IDS = [V.pumpkin, V.validBlocks, V.overclock, V.laine, V.blockLogic, V.quiet, V.impostor].map((v) => v.identity);
  const base = {
    cluster: "mainnet" as const,
    signature: "s".repeat(64),
    signedDate: "2026-10-07",
    action: "claim" as const,
    category: "Library" as const,
  };

  /** Same steps as the service: read the history, evaluate the rules, then save with the rule inputs. */
  async function like(toolUrl: string, identity: string) {
    const d = createClaimsDeps();
    const h = await d.getHistory(toolUrl, identity);
    const out = evaluateWebRules({
      now: clock(),
      identityClaimsLast24h: h.identityClaimsLast24h,
      alreadyClaimedBySameIdentity: false,
      otherClaimants: h.otherClaimants,
      sameDomainClaims: h.sameDomainClaims ?? 0,
    });
    try {
      return await d.saveClaim({ ...base, toolUrl, identity, message: `m-${toolUrl}`, toolName: toolUrl, pending: out.decision === "review", recheck: { now: clock() } });
    } catch (e) {
      if (e instanceof PendingLimitError) return null;
      throw e;
    }
  }
  const count = async (identity: string, s: string) =>
    Number((await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM claims WHERE identity = ${identity} AND status = ${s}`))[0].n);

  it("seven identities claiming the same new tool at once all succeed (no deadlock)", async () => {
    const d = createClaimsDeps();
    for (let round = 0; round < 8; round++) {
      const url = `racetool${round}.example.com`;
      const res = await Promise.allSettled(IDS.map((id) => d.saveClaim({ ...base, toolUrl: url, identity: id, message: "m", toolName: "Race" })));
      const failed = res.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason?.cause?.code ?? (r as PromiseRejectedResult).reason));
      expect(failed).toEqual([]);
      expect(await getDb().select().from(tools).where(eq(tools.url, url))).toHaveLength(1);
    }
  });

  it("concurrent new tools whose slugs collide all get distinct slugs", async () => {
    const d = createClaimsDeps();
    const urls = ["slug.example.com/a-b", "slug.example.com/a/b", "slug.example.com/a_b", "slug.example.com/a.b", "slug.example.com/a+b", "slug.example.com/a~b"];
    const res = await Promise.allSettled(urls.map((u, i) => d.saveClaim({ ...base, toolUrl: u, identity: IDS[i], message: "m", toolName: "S" })));
    expect(res.filter((r) => r.status === "rejected")).toHaveLength(0);
    const slugs = (await getDb().select({ slug: tools.slug }).from(tools).where(sql`url LIKE 'slug.example.com/%'`)).map((r) => r.slug);
    expect(new Set(slugs).size).toBe(6);
  });

  it("15 concurrent web claims of one identity under one domain: exactly 5 active, 3 pending, the rest refused", async () => {
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => like(`tool${i}.sub.example.org`, V.quiet.identity)));
    expect(await count(V.quiet.identity, "active")).toBe(5);
    expect(await count(V.quiet.identity, "pending")).toBe(3);
    expect(results.filter((r) => r === null)).toHaveLength(7);
  });
});
