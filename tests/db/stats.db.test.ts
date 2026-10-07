import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { DEV_VALIDATORS as V, resetDevDb, seedDevData } from "@/db/dev-data";
import { claimFailures, claims } from "@/db/schema";
import { failuresSince, pruneClaimFailures, recordClaimFailure } from "@/lib/claim-failures";
import { getAdminStats } from "@/lib/admin-stats";
import { createClaimsDeps } from "@/lib/claims-deps";

beforeEach(async () => {
  await resetDevDb();
  await seedDevData();
});
afterAll(async () => {
  await resetDevDb();
  await seedDevData();
});

describe("claim failures", () => {
  it("stores only the step and the kind, groups them and prunes after 30 days", async () => {
    await recordClaimFailure("check", "proof");
    await recordClaimFailure("check", "proof");
    await recordClaimFailure("register", "signature");
    const week = new Date(Date.now() - 7 * 86_400_000);
    expect(await failuresSince(week)).toEqual([
      { reason: "proof", kind: "check", count: 2 },
      { reason: "signature", kind: "register", count: 1 },
    ]);
    const columns = Object.keys((await getDb().select().from(claimFailures))[0]).sort();
    expect(columns).toEqual(["createdAt", "id", "kind", "reason"]);

    await getDb().execute(sql`UPDATE claim_failures SET created_at = NOW() - INTERVAL 8 DAY WHERE reason = 'signature'`);
    expect(await failuresSince(week)).toEqual([{ reason: "proof", kind: "check", count: 2 }]);
    await getDb().execute(sql`UPDATE claim_failures SET created_at = NOW() - INTERVAL 31 DAY WHERE reason = 'signature'`);
    expect(await pruneClaimFailures()).toBe(1);
    expect(await getDb().select().from(claimFailures)).toHaveLength(2);
  });

  it("the claims deps record failures through the same path", async () => {
    await createClaimsDeps().recordFailure!("register", "rules");
    expect(await failuresSince(new Date(Date.now() - 86_400_000))).toEqual([{ reason: "rules", kind: "register", count: 1 }]);
  });
});

describe("getAdminStats", () => {
  it("counts claims by status, new claims by window and distinct active identities", async () => {
    // Dev data: 3 active (Overclock, Pumpkin x2), 1 stale, 1 pending.
    await getDb().execute(sql`UPDATE claims SET verified_at = NOW() - INTERVAL 10 DAY WHERE status = 'stale'`);
    await getDb().execute(sql`UPDATE claims SET verified_at = NOW() - INTERVAL 40 DAY WHERE status = 'pending'`);
    await recordClaimFailure("check", "format");
    const s = await getAdminStats();
    expect(s.claimsByStatus).toEqual({ active: 3, pending: 1, stale: 1, withdrawn: 0, rejected: 0 });
    expect(s.newClaims).toEqual({ last7Days: 3, last30Days: 4 });
    expect(s.activeIdentities).toBe(2);
    expect(s.claimFailuresLast7Days).toEqual([{ reason: "format", kind: "check", count: 1 }]);
    expect(V.pumpkin.identity).toBeTruthy();
    expect((await getDb().select().from(claims)).length).toBe(5);
  });
});
