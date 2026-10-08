import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { DEV_VALIDATORS as V, resetDevDb, seedDevData } from "@/db/dev-data";
import { claims, jobRuns, poolCandidates, validatorPoolScan, validatorPoolStake, validatorSfdp } from "@/db/schema";
import { defaultPoolsDeps, refreshPoolsFor, runPools, type PoolsDeps } from "@/jobs/pools";
import { handleCandidateDecision, handleListCandidates } from "@/lib/admin-pools";
import { getLeaderboard, getPoolBadges, getValidatorProfile } from "@/lib/queries";
import { splWithdrawAuthority } from "@/lib/solana/pda";
import { discoverStakePools } from "@/lib/solana/pool-discovery";
import { fetchEpoch, fetchValidatorPools } from "@/lib/solana/pool-stake";
import { SANCTUM_MULTI_PROGRAM, SPL_STAKE_POOL_PROGRAM } from "@/lib/solana/stake-pools";
import accountsFixture from "../fixtures/stake-pools/stake-accounts.json";
import poolsFixture from "../fixtures/stake-pools/spl-pools.json";

const ADMIN = "a".repeat(32);
const sliceOf = (id: string) => accountsFixture.accounts.find((a) => a.id === id)!.sliceBase64;
const solOf = (id: string) => Number((BigInt(accountsFixture.accounts.find((a) => a.id === id)!.lamports) + 500_000_000n) / 1_000_000_000n);

// Which stake accounts the simulated RPC returns per vote account.
const BY_VOTE: Record<string, string[]> = {
  [V.pumpkin.vote]: ["jito", "marinade", "blazestake", "deactivated"],
  [V.overclock.vote]: ["jito", "deactivating"],
};

function rpcFetch(byVote: Record<string, string[]> = BY_VOTE, opts: { failFor?: string[] } = {}): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body));
    const reply = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    if (req.method === "getEpochInfo") return reply({ epoch: accountsFixture.epoch });
    if (req.method === "getProgramAccounts") {
      const memcmp = req.params[1].filters?.find((f: { memcmp?: unknown }) => f.memcmp)?.memcmp as { bytes: string } | undefined;
      const program = req.params[0] as string;
      if (program !== "Stake11111111111111111111111111111111111111") {
        // pool discovery: the recorded pools of the SPL program
        return reply(program === SPL_STAKE_POOL_PROGRAM ? poolsFixture.accounts.map((a) => ({ pubkey: a.pubkey, account: { data: a.account.data } })) : []);
      }
      if (opts.failFor?.includes(memcmp!.bytes)) return new Response("rate limited", { status: 429 });
      return reply((byVote[memcmp!.bytes] ?? []).map((id) => ({ account: { data: [sliceOf(id), "base64"] } })));
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

function deps(f: typeof fetch, over: Partial<PoolsDeps> = {}): PoolsDeps {
  const o = { rpcUrl: "http://rpc.test", fetchImpl: f };
  return {
    ...defaultPoolsDeps,
    epoch: () => fetchEpoch(o),
    scan: (vote, index, epoch) => fetchValidatorPools(vote, index, epoch, o),
    discover: (program) => discoverStakePools(program, o),
    fetchSfdp: async (ids) => new Set(ids.filter((i) => i === V.pumpkin.identity)),
    ...over,
  };
}

const LOGO = path.join(process.cwd(), "public", "pools", "zz-test-pool.png");

beforeAll(() => {
  process.env.ADMIN_SECRET = ADMIN;
  writeFileSync(LOGO, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
});
beforeEach(async () => {
  await resetDevDb();
  await seedDevData();
  // The dev seed fills these tables for the UI; these tests start from empty ones.
  for (const t of [validatorPoolStake, validatorPoolScan, validatorSfdp]) await getDb().delete(t);
});
afterAll(async () => {
  rmSync(LOGO, { force: true });
  await resetDevDb();
  await seedDevData();
});

const stored = async (identity: string) =>
  (await getDb().select().from(validatorPoolStake).where(eq(validatorPoolStake.identity, identity))).map((r) => [r.poolId, r.lamports] as const).sort();

describe("pools job against the database (simulated RPC)", () => {
  it("scans only verified validators and stores the qualifying active pools", async () => {
    const r = await runPools(deps(rpcFetch()));
    // pumpkin and overclock have active claims; laine is stale, blockLogic pending, the rest have none
    expect(r).toMatchObject({ mode: "daily", verified: 2, due: 2, scanned: 2, failed: 0, withPools: 2 });
    expect((await stored(V.pumpkin.identity)).map(([p]) => p)).toEqual(["blazestake", "jito", "marinade"]);
    expect((await stored(V.overclock.identity)).map(([p]) => p)).toEqual(["jito"]);
    expect(await getDb().select().from(validatorPoolScan)).toHaveLength(2);
    expect(await stored(V.laine.identity)).toEqual([]);
    // a second run right away scans nobody (20 h guard)
    expect(await runPools(deps(rpcFetch()))).toMatchObject({ due: 0, scanned: 0 });
  });

  it("serves badges sorted by SOL with registry names, to verified validators only", async () => {
    await runPools(deps(rpcFetch()));
    const profile = await getValidatorProfile(V.pumpkin.identity);
    expect(profile!.pools!.map((p) => p.id)).toEqual(["jito", "marinade", "blazestake"]);
    expect(profile!.pools![0]).toEqual({ id: "jito", name: "Jito", logo: "/pools/jito.png", sol: solOf("jito") });
    expect(profile!.pools!.every((p) => p.logo.startsWith("/pools/"))).toBe(true);
    expect(profile!.sfdp).toEqual({ participant: true, checkedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) });

    const board = await getLeaderboard({});
    const pumpkin = board.items.find((r) => r.validator.identity === V.pumpkin.identity)!;
    const overclock = board.items.find((r) => r.validator.identity === V.overclock.identity)!;
    expect(pumpkin.pools!.map((p) => p.id)).toEqual(["jito", "marinade", "blazestake"]);
    expect(overclock.pools!.map((p) => p.id)).toEqual(["jito"]);
    expect(overclock.sfdp).toMatchObject({ participant: false });
    // stale and pending claims show nothing, even if rows were left behind
    await getDb().insert(validatorPoolStake).values([
      { identity: V.laine.identity, poolId: "jito", lamports: 900_000_000_000n },
      { identity: V.blockLogic.identity, poolId: "jito", lamports: 900_000_000_000n },
    ]);
    expect((await getValidatorProfile(V.laine.identity))!.pools).toBeUndefined();
    expect((await getLeaderboard({})).items.find((r) => r.validator.identity === V.laine.identity)?.pools).toBeUndefined();
    expect((await getValidatorProfile(V.blockLogic.identity))!.pools).toBeUndefined();
    expect(JSON.stringify(board)).not.toContain("withdrawer");
  });

  it("ties between pools sort by id, and rows of unknown pools are never shown", async () => {
    const lamports = 200_000_000_000n;
    await getDb().insert(validatorPoolStake).values([
      { identity: V.pumpkin.identity, poolId: "vault", lamports },
      { identity: V.pumpkin.identity, poolId: "jpool", lamports },
      { identity: V.pumpkin.identity, poolId: "aero", lamports },
      { identity: V.pumpkin.identity, poolId: "ghost", lamports: 900_000_000_000n },
    ]);
    const pools = (await getPoolBadges([V.pumpkin.identity])).get(V.pumpkin.identity)!.pools;
    expect(pools.map((p) => p.id)).toEqual(["jpool", "vault"]); // "aero" is switched off in the registry
  });

  it("a failing validator keeps its previous pools; pools that disappear are removed on the next good scan", async () => {
    await runPools(deps(rpcFetch()));
    await getDb().update(validatorPoolScan).set({ scannedAt: new Date(Date.now() - 48 * 3_600_000) });
    const bad = await runPools(deps(rpcFetch(BY_VOTE, { failFor: [V.pumpkin.vote] })));
    expect(bad).toMatchObject({ scanned: 1, failed: 1 });
    expect((await stored(V.pumpkin.identity)).map(([p]) => p)).toEqual(["blazestake", "jito", "marinade"]);

    await getDb().update(validatorPoolScan).set({ scannedAt: new Date(Date.now() - 48 * 3_600_000) });
    const shrunk = { ...BY_VOTE, [V.pumpkin.vote]: ["jito"] };
    expect(await runPools(deps(rpcFetch(shrunk)))).toMatchObject({ scanned: 2, failed: 0 });
    expect((await stored(V.pumpkin.identity)).map(([p]) => p)).toEqual(["jito"]);

    // a validator that now holds no qualifying pool ends with none
    await getDb().update(validatorPoolScan).set({ scannedAt: new Date(Date.now() - 48 * 3_600_000) });
    await runPools(deps(rpcFetch({})));
    expect(await stored(V.pumpkin.identity)).toEqual([]);
    expect(await getDb().select().from(validatorPoolScan)).toHaveLength(2);
  });

  it("upserts amounts in place (primary key identity + pool)", async () => {
    await defaultPoolsDeps.saveScan(V.pumpkin.identity, [{ poolId: "jito", lamports: 500_000_000_000n }], 1);
    await defaultPoolsDeps.saveScan(V.pumpkin.identity, [{ poolId: "jito", lamports: 700_000_000_000n }], 2);
    expect(await stored(V.pumpkin.identity)).toEqual([["jito", 700_000_000_000n]]);
    const [scan] = await getDb().select().from(validatorPoolScan);
    expect(scan.epoch).toBe(2);
  });

  it("drops everything stored for a validator when it loses its active claim", async () => {
    await runPools(deps(rpcFetch()));
    expect(await getDb().select().from(validatorSfdp)).toHaveLength(2);
    await getDb().update(claims).set({ status: "stale" }).where(eq(claims.identity, V.overclock.identity));
    const r = await runPools(deps(rpcFetch()));
    expect(r.removed).toBeGreaterThan(0);
    expect(await stored(V.overclock.identity)).toEqual([]);
    expect((await getDb().select().from(validatorPoolScan)).map((s) => s.identity)).toEqual([V.pumpkin.identity]);
    expect((await getDb().select().from(validatorSfdp)).map((s) => s.identity)).toEqual([V.pumpkin.identity]);
    expect((await stored(V.pumpkin.identity)).length).toBe(3);
  });

  it("refreshPoolsFor scans one validator on demand and not twice", async () => {
    const d = deps(rpcFetch());
    expect(await refreshPoolsFor(V.pumpkin.identity, d)).toMatchObject({ scanned: 1 });
    expect(await refreshPoolsFor(V.pumpkin.identity, d)).toMatchObject({ scanned: 0, due: 0 });
    expect(await stored(V.overclock.identity)).toEqual([]);
    expect(await getDb().select().from(validatorSfdp)).toEqual([]);
  });

  it("stores SFDP membership with its date and keeps the last value when the list cannot be read", async () => {
    await runPools(deps(rpcFetch()));
    const [before] = await getDb().select().from(validatorSfdp).where(eq(validatorSfdp.identity, V.pumpkin.identity));
    expect(before.participant).toBe(true);
    expect(before.lastOkAt).not.toBeNull();
    await getDb().update(jobRuns).set({ lastRunAt: new Date(Date.now() - 48 * 3_600_000) });
    const old = new Date(Math.floor((Date.now() - 72 * 3_600_000) / 1000) * 1000);
    await getDb().update(validatorSfdp).set({ checkedAt: old, lastOkAt: old });
    const r = await runPools(deps(rpcFetch(), { fetchSfdp: async () => null }));
    expect(r.sfdp).toEqual({ participants: 0, ok: false });
    const [after] = await getDb().select().from(validatorSfdp).where(eq(validatorSfdp.identity, V.pumpkin.identity));
    expect(after.participant).toBe(true);
    expect(after.lastOkAt!.getTime()).toBe(old.getTime());
    expect(after.checkedAt.getTime()).toBeGreaterThan(old.getTime());
    expect((await getPoolBadges([V.pumpkin.identity])).get(V.pumpkin.identity)!.sfdp).toEqual({ participant: true, checkedAt: old.toISOString() });
  });

  it("discovery lists unknown pools as pending candidates, once, without touching decisions", async () => {
    const mk = (pool: string, program: string) => ({ pool, program, poolMint: `mint-${pool.slice(0, 4)}`, validatorList: "VL", withdrawAuthority: splWithdrawAuthority(pool, program) });
    const found: Record<string, ReturnType<typeof mk>[]> = {
      [SPL_STAKE_POOL_PROGRAM]: [mk("Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb", SPL_STAKE_POOL_PROGRAM), mk("LW3qEdGWdVrxNgxSXW8vZri7Jifg4HuKEQ1UABLxs3C", SPL_STAKE_POOL_PROGRAM)],
      [SANCTUM_MULTI_PROGRAM]: [mk("8VpRhuxa7sUUepdY3kQiTmX9rS5vx4WgaXiAnXq4KCtr", SANCTUM_MULTI_PROGRAM)],
    };
    const d = deps(rpcFetch(), { discover: async (program) => found[program] ?? [] });
    const first = await runPools(d);
    // the registry pool (Jito) is not listed as a candidate
    expect(first.discovery).toEqual({ programs: 3, found: 3, added: 2 });
    const rows = await getDb().select().from(poolCandidates);
    expect(rows.map((c) => c.pool).sort()).toEqual(["8VpRhuxa7sUUepdY3kQiTmX9rS5vx4WgaXiAnXq4KCtr", "LW3qEdGWdVrxNgxSXW8vZri7Jifg4HuKEQ1UABLxs3C"]);
    expect(rows.every((c) => c.status === "pending" && c.name === null && c.logoId === null)).toBe(true);
    const sample = rows[0];
    expect(sample.withdrawAuthority).toBe(splWithdrawAuthority(sample.pool, sample.program));

    await getDb().update(poolCandidates).set({ status: "approved", name: "Kept", logoId: "jito" }).where(eq(poolCandidates.pool, sample.pool));
    await getDb().update(jobRuns).set({ lastRunAt: new Date(Date.now() - 8 * 24 * 3_600_000) });
    const second = await runPools(d);
    expect(second.discovery).toMatchObject({ added: 0 });
    const [kept] = await getDb().select().from(poolCandidates).where(eq(poolCandidates.pool, sample.pool));
    expect(kept).toMatchObject({ status: "approved", name: "Kept", logoId: "jito" });
    expect(await getDb().select().from(poolCandidates)).toHaveLength(2);
    // discovery is weekly: the run right after does not repeat it
    expect((await runPools(d)).discovery).toBeNull();
  });

  it("discovery parses the recorded StakePool accounts of the SPL program", async () => {
    const list = await discoverStakePools(SPL_STAKE_POOL_PROGRAM, { rpcUrl: "http://rpc.test", fetchImpl: rpcFetch() });
    expect(list.map((c) => c.pool)).toEqual(poolsFixture.accounts.map((a) => a.pubkey));
  });
});

describe("admin: stake pool candidates", () => {
  const req = (url: string, init: RequestInit = {}, token: string | null = ADMIN) =>
    new Request(`http://localhost${url}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const post = (pool: string, kind: "approve" | "reject", body?: unknown, token: string | null = ADMIN) =>
    handleCandidateDecision(req(`/x/${pool}/${kind}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), headers: { "x-admin-actor": "tester" } }, token), pool, kind);

  // jupSOL: a real pool of the Sanctum multi program, not Sanctum-branded.
  const JUP = "8VpRhuxa7sUUepdY3kQiTmX9rS5vx4WgaXiAnXq4KCtr";
  const seedCandidates = async () => {
    await getDb().insert(poolCandidates).values([
      { pool: JUP, poolMint: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v", validatorList: "VL1", withdrawAuthority: splWithdrawAuthority(JUP, SANCTUM_MULTI_PROGRAM), program: SANCTUM_MULTI_PROGRAM },
      { pool: "LW3qEdGWdVrxNgxSXW8vZri7Jifg4HuKEQ1UABLxs3C", poolMint: "M2", validatorList: "VL2", withdrawAuthority: "W2", program: "SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY" },
    ]);
  };

  it("requires the admin secret", async () => {
    await seedCandidates();
    expect((await handleListCandidates(req("/api/admin/pools/candidates", {}, null))).status).toBe(401);
    expect((await handleListCandidates(req("/api/admin/pools/candidates", {}, "wrong"))).status).toBe(401);
    expect((await post(JUP, "approve", { name: "X", logoId: "jito" }, "c".repeat(32))).status).toBe(401);
    expect((await post(JUP, "reject", undefined, null)).status).toBe(401);
    expect((await getDb().select().from(poolCandidates).where(eq(poolCandidates.pool, JUP)))[0].status).toBe("pending");
  });

  it("lists by status with pagination and validates its parameters", async () => {
    await seedCandidates();
    const page = await (await handleListCandidates(req("/api/admin/pools/candidates?limit=1"))).json();
    expect(page).toMatchObject({ total: 2, limit: 1, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ status: "pending", name: null });
    expect((await (await handleListCandidates(req("/api/admin/pools/candidates?status=approved"))).json()).items).toEqual([]);
    expect((await (await handleListCandidates(req("/api/admin/pools/candidates?limit=9999"))).json()).limit).toBe(100);
    for (const bad of ["status=nope", "limit=abc", "offset=-1", "limit="]) {
      expect((await handleListCandidates(req(`/api/admin/pools/candidates?${bad}`))).status, bad).toBe(400);
    }
  });

  it("approving needs a clean name and an existing logo file; rejecting clears them", async () => {
    await seedCandidates();
    expect((await post(JUP, "approve", { name: "  ‮  ", logoId: "jito" })).status).toBe(400);
    expect((await post(JUP, "approve", { name: "Jupiter" })).status).toBe(400);
    for (const logoId of ["nope", "../jito", "Jito", "jito.png", 5, null]) {
      expect((await post(JUP, "approve", { name: "Jupiter", logoId })).status, String(logoId)).toBe(400);
    }
    expect((await post(JUP, "approve", [1])).status).toBe(400);
    expect((await handleCandidateDecision(req("/x", { method: "POST", body: "{nope" }), JUP, "approve")).status).toBe(400);
    expect((await post(JUP, "approve", { name: "x".repeat(5000), logoId: "jito" })).status).toBe(413);
    expect((await post("short", "approve", { name: "J", logoId: "jito" })).status).toBe(400);
    expect((await post("9".repeat(44), "approve", { name: "J", logoId: "jito" })).status).toBe(404);
    expect((await post("9".repeat(44), "reject")).status).toBe(404);

    const ok = await post(JUP, "approve", { name: "Jupiter​  SOL", logoId: "zz-test-pool" });
    expect(await ok.json()).toEqual({ ok: true, pool: JUP, status: "approved" });
    const [row] = await getDb().select().from(poolCandidates).where(eq(poolCandidates.pool, JUP));
    expect(row).toMatchObject({ status: "approved", name: "Jupiter SOL", logoId: "zz-test-pool", decidedBy: "tester" });

    expect(await (await post(JUP, "reject")).json()).toEqual({ ok: true, pool: JUP, status: "rejected" });
    const [rej] = await getDb().select().from(poolCandidates).where(eq(poolCandidates.pool, JUP));
    expect(rej).toMatchObject({ status: "rejected", name: null, logoId: null });
    // a rejected candidate can be approved again
    expect((await post(JUP, "approve", { name: "Jupiter", logoId: "zz-test-pool" })).status).toBe(200);
  });

  it("an approved candidate joins the authority index: its stake is scanned, shown with the curated name, and nothing else is", async () => {
    await seedCandidates();
    // Before approval the Jupiter stake account (a real jupSOL account) is attributed to nobody.
    const jupVote = accountsFixture.accounts.find((a) => a.id === "sanctum-multi")!.vote;
    const byVote = { [V.pumpkin.vote]: ["sanctum-multi", "sanctum-spl"], [jupVote]: [] };
    const run = async () => {
      await getDb().update(validatorPoolScan).set({ scannedAt: new Date(Date.now() - 48 * 3_600_000) });
      await runPools(deps(rpcFetch(byVote)));
      return (await stored(V.pumpkin.identity)).map(([p]) => p);
    };
    await runPools(deps(rpcFetch(byVote)));
    expect(await stored(V.pumpkin.identity)).toEqual([]);

    await post(JUP, "approve", { name: "Jupiter", logoId: "zz-test-pool" });
    expect(await run()).toEqual(["zz-test-pool"]); // Lantern (LW3q...) stays unattributed
    const badges = (await getPoolBadges([V.pumpkin.identity])).get(V.pumpkin.identity)!;
    expect(badges.pools).toEqual([{ id: "zz-test-pool", name: "Jupiter", logo: "/pools/zz-test-pool.png", sol: solOf("sanctum-multi") }]);

    // Approving Lantern under the registry id "sanctum" groups it under the registry name and logo.
    await post("LW3qEdGWdVrxNgxSXW8vZri7Jifg4HuKEQ1UABLxs3C", "approve", { name: "Something else", logoId: "sanctum" });
    expect(await run()).toEqual(["sanctum", "zz-test-pool"]);
    const after = (await getPoolBadges([V.pumpkin.identity])).get(V.pumpkin.identity)!.pools.find((p) => p.id === "sanctum")!;
    expect(after).toMatchObject({ name: "Sanctum", logo: "/pools/sanctum.png" });

    // Rejecting hides it right away from the API, before any rescan.
    await post(JUP, "reject");
    expect((await getPoolBadges([V.pumpkin.identity])).get(V.pumpkin.identity)!.pools.map((p) => p.id)).toEqual(["sanctum"]);
  });
});
