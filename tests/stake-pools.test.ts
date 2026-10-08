import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import accountsFixture from "./fixtures/stake-pools/stake-accounts.json";
import poolsFixture from "./fixtures/stake-pools/spl-pools.json";
import sfdpFixture from "./fixtures/stake-pools/sfdp-participants.json";
import { approvedToPools, poolMetaMap } from "@/lib/pool-registry";
import { findProgramAddress, isOnCurve, splWithdrawAuthority } from "@/lib/solana/pda";
import {
  buildAuthorityIndex,
  poolById,
  SANCTUM_MULTI_PROGRAM,
  SANCTUM_SPL_PROGRAM,
  SPL_STAKE_POOL_PROGRAM,
  STAKE_POOLS,
  type StakePoolDef,
} from "@/lib/solana/stake-pools";
import {
  aggregatePoolStake,
  attributeStake,
  fetchEpoch,
  fetchStakeSlices,
  fetchValidatorPools,
  isActiveStake,
  MIN_POOL_LAMPORTS,
  parseStakeSlice,
  selectPools,
  STAKE_SLICE,
  U64_MAX,
} from "@/lib/solana/pool-stake";
import { fetchSfdpApproved, parseSfdpApproved } from "@/lib/solana/sfdp";
import {
  discoverStakePools,
  measureCandidate,
  mayQualify,
  MIN_CANDIDATE_LAMPORTS,
  parseMetaplexName,
  parseStakePool,
  qualifiesAsCandidate,
  summarizeValidatorList,
} from "@/lib/solana/pool-discovery";

const EPOCH = accountsFixture.epoch;
type Fx = (typeof accountsFixture.accounts)[number];
const fx = (id: string): Fx => accountsFixture.accounts.find((a) => a.id === id)!;
const slice = (id: string) => Buffer.from(fx(id).sliceBase64, "base64");

const index = buildAuthorityIndex(STAKE_POOLS);

function okFetch(result: unknown, init: { status?: number; headers?: Record<string, string> } = {}): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: init.status ?? 200, headers: init.headers })) as typeof fetch;
}

describe("pda", () => {
  it("derives the Jito withdraw authority observed on mainnet", () => {
    expect(splWithdrawAuthority("Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb", SPL_STAKE_POOL_PROGRAM)).toBe(
      "6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS",
    );
  });
  it("derives the Marinade withdraw authority observed on mainnet", () => {
    const state = bs58.decode("8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC");
    const r = findProgramAddress([state, Buffer.from("withdraw")], "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD");
    expect(r.address).toBe("9eG63CdHjsfhHmobHgLtESGC8GabbmRcaSpHAZrtmhco");
    expect(r.bump).toBeLessThanOrEqual(255);
  });
  it("tells curve points from off-curve bytes", () => {
    // Validator identities and stakers are real keypairs, so they must be on the curve.
    expect(isOnCurve(bs58.decode("Fd7btgySsrjuo25CJCj7oE7VPMyezDhnx7pZkj2v69Nk"))).toBe(true);
    expect(isOnCurve(bs58.decode("HEL1USMZKAL2odpNBj2oCjffnFGaYwmbGmyewGv1e2TU"))).toBe(true);
    expect(isOnCurve(bs58.decode("DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy"))).toBe(true);
    expect(isOnCurve(bs58.decode("6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS"))).toBe(false); // a PDA
    expect(isOnCurve(new Uint8Array(32))).toBe(true); // y = 0
    expect(isOnCurve(new Uint8Array(31))).toBe(false); // wrong length
  });
  it("rejects bad inputs", () => {
    expect(() => findProgramAddress([], "abc")).toThrow("invalid program id");
    expect(() => findProgramAddress([new Uint8Array(33)], SPL_STAKE_POOL_PROGRAM)).toThrow("seed too long");
  });
});

describe("registry", () => {
  it("is alphabetical, has unique ids and repo-owned logos", () => {
    const names = STAKE_POOLS.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(STAKE_POOLS.map((p) => p.id)).size).toBe(STAKE_POOLS.length);
    for (const p of STAKE_POOLS) expect(p.logo).toMatch(/^\/pools\/[a-z0-9-]+\.(png|svg)$/);
    expect(poolById("jito")?.name).toBe("Jito");
    expect(poolById("nope")).toBeUndefined();
  });

  // One real stake account per pool, observed on mainnet at epoch 1052 (see fixture for dates and vote accounts).
  const expected: Record<string, string> = {
    jito: "jito",
    blazestake: "blazestake",
    jpool: "jpool",
    vault: "vault",
    marinade: "marinade",
    "marinade-native": "marinade",
  };
  for (const [fixtureId, poolId] of Object.entries(expected)) {
    it(`attributes the real ${fixtureId} stake account to ${poolId}`, () => {
      const s = parseStakeSlice(slice(fixtureId))!;
      expect(s.withdrawer).toBe(fx(fixtureId).withdrawer);
      expect(s.staker).toBe(fx(fixtureId).staker);
      expect(s.voter).toBe(fx(fixtureId).vote);
      expect(s.lamports).toBe(BigInt(fx(fixtureId).lamports));
      expect(attributeStake(s, index)).toBe(poolId);
      expect(isActiveStake(s, EPOCH)).toBe(true);
    });
  }

  // Aero is switched off until its official name and brand are confirmed (its mint says "pdSOL"). The fixture is real
  // and its authority still derives from the registry entry, but nothing may be attributed or shown for it.
  it("a disabled pool is neither indexed, attributed nor given display metadata", () => {
    const aero = poolById("aero")!;
    expect(aero.enabled).toBe(false);
    const s = parseStakeSlice(slice("aero"))!;
    expect(s.withdrawer).toBe(splWithdrawAuthority(aero.authorities[0].kind === "spl-pool" ? aero.authorities[0].pool : "", SPL_STAKE_POOL_PROGRAM));
    expect(index.withdrawers.has(s.withdrawer)).toBe(false);
    expect(attributeStake(s, index)).toBeNull();
    expect(aggregatePoolStake([slice("aero")], index, EPOCH).size).toBe(0);
    expect(poolMetaMap([]).has("aero")).toBe(false);
    expect(poolMetaMap([]).has("jito")).toBe(true);
    // approving a candidate under the id of a disabled pool does not bring it back
    const row = { pool: "Pool111", program: SPL_STAKE_POOL_PROGRAM, name: "Aero", logoId: "aero" };
    expect(approvedToPools([row], () => "/pools/aero.png")).toEqual([]);
  });

  it("Marinade Native is matched by staker, liquid Marinade by withdrawer", () => {
    const native = parseStakeSlice(slice("marinade-native"))!;
    expect(index.withdrawers.has(native.withdrawer)).toBe(false);
    expect(native.staker).toBe("stWirqFCf2Uts1JBL1Jsd3r6VBWhgnpdPxCTe1MFjrq");
    const liquid = parseStakeSlice(slice("marinade"))!;
    expect(liquid.withdrawer).toBe("9eG63CdHjsfhHmobHgLtESGC8GabbmRcaSpHAZrtmhco");
  });

  // The fixtures "sanctum-spl" and "sanctum-multi" are real accounts of the Sanctum programs, but their pools are
  // Lantern (LW3q...) and Jupiter (jupSOL, 8VpR...). Hosting a pool on a Sanctum program does not make it Sanctum.
  it("pools merely hosted on the Sanctum programs are not attributed to Sanctum", () => {
    expect(poolById("sanctum")?.authorities).toEqual([]);
    for (const id of ["sanctum-spl", "sanctum-multi"]) {
      expect(attributeStake(parseStakeSlice(slice(id))!, index)).toBeNull();
    }
    expect(SANCTUM_SPL_PROGRAM).toMatch(/^SP12/);
    expect(SANCTUM_MULTI_PROGRAM).toMatch(/^SPMB/);
  });

  it("an approved candidate adds its pool to a registry pool by id, and a colliding authority is dropped", () => {
    const lantern: StakePoolDef = {
      id: "sanctum",
      name: "ignored",
      logo: "/pools/sanctum.png",
      authorities: [{ kind: "spl-pool", pool: "LW3qEdGWdVrxNgxSXW8vZri7Jifg4HuKEQ1UABLxs3C", program: SANCTUM_SPL_PROGRAM }],
    };
    const merged = buildAuthorityIndex(STAKE_POOLS, [lantern]);
    expect(attributeStake(parseStakeSlice(slice("sanctum-spl"))!, merged)).toBe("sanctum");
    const clash: StakePoolDef = { ...lantern, id: "other" };
    const dropped = buildAuthorityIndex(STAKE_POOLS, [lantern, clash]);
    expect(attributeStake(parseStakeSlice(slice("sanctum-spl"))!, dropped)).toBeNull();
  });

  it("does not attribute unknown authorities", () => {
    expect(attributeStake({ staker: "11111111111111111111111111111111", withdrawer: "11111111111111111111111111111111" }, index)).toBeNull();
  });

  it("drops an authority claimed by two pools", () => {
    const a: StakePoolDef = { id: "a", name: "A", logo: "/pools/a.png", authorities: [{ kind: "address", address: "X", role: "withdrawer" }] };
    const b: StakePoolDef = { id: "b", name: "B", logo: "/pools/b.png", authorities: [{ kind: "address", address: "X", role: "withdrawer" }, { kind: "address", address: "Y", role: "staker" }] };
    const idx = buildAuthorityIndex([a, b]);
    expect(idx.withdrawers.has("X")).toBe(false);
    expect(idx.stakers.get("Y")).toBe("b");
  });
});

describe("stake slice parsing", () => {
  it("rejects short slices", () => {
    expect(parseStakeSlice(new Uint8Array(167))).toBeNull();
  });

  it("counts only active stake", () => {
    const active = parseStakeSlice(slice("jito"))!;
    const deactivated = parseStakeSlice(slice("deactivated"))!;
    const deactivating = parseStakeSlice(slice("deactivating"))!;
    expect(deactivated.deactivationEpoch).toBe(526n);
    expect(deactivating.deactivationEpoch).toBe(BigInt(EPOCH));
    expect(isActiveStake(active, EPOCH)).toBe(true);
    expect(isActiveStake(deactivated, EPOCH)).toBe(false);
    expect(isActiveStake(deactivating, EPOCH)).toBe(false);
  });

  it("treats stake activated this epoch as still activating, and bootstrap stake as active", () => {
    const base = { deactivationEpoch: U64_MAX };
    expect(isActiveStake({ ...base, activationEpoch: BigInt(EPOCH) }, EPOCH)).toBe(false);
    expect(isActiveStake({ ...base, activationEpoch: BigInt(EPOCH - 1) }, EPOCH)).toBe(true);
    expect(isActiveStake({ ...base, activationEpoch: BigInt(EPOCH + 1) }, EPOCH)).toBe(false);
    expect(isActiveStake({ ...base, activationEpoch: U64_MAX }, EPOCH)).toBe(true);
  });

  it("slice geometry matches the request", () => {
    expect(slice("jito").length).toBe(STAKE_SLICE.length);
  });

  it("aggregates per pool and skips inactive, unknown and malformed slices", () => {
    const totals = aggregatePoolStake(
      [slice("jito"), slice("jito"), slice("marinade"), slice("marinade-native"), slice("deactivated"), slice("deactivating"), new Uint8Array(3)],
      index,
      EPOCH,
    );
    const one = (id: string) => BigInt(fx(id).lamports);
    expect(totals.get("jito")).toBe(one("jito") * 2n);
    expect(totals.get("marinade")).toBe(one("marinade") + one("marinade-native"));
    expect(totals.size).toBe(2);
  });
});

describe("selectPools", () => {
  it("applies the 100 SOL threshold and orders by SOL desc, then id", () => {
    const m = new Map<string, bigint>([
      ["zeta", 500_000_000_000n],
      ["alpha", 500_000_000_000n],
      ["big", 9_000_000_000_000n],
      ["edge", MIN_POOL_LAMPORTS],
      ["dust", MIN_POOL_LAMPORTS - 1n],
    ]);
    expect(selectPools(m).map((p) => p.poolId)).toEqual(["big", "alpha", "zeta", "edge"]);
    expect(selectPools(new Map())).toEqual([]);
  });
});

describe("rpc helpers", () => {
  const opts = { rpcUrl: "https://rpc.example" };

  it("fetchStakeSlices decodes slices and sends the expected filters", async () => {
    let body: { params: [string, { dataSlice: unknown; filters: unknown[] }] } | undefined;
    const f = (async (_u: unknown, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ result: [{ pubkey: "a", account: { data: [fx("jito").sliceBase64, "base64"] } }, { account: {} }, null] }));
    }) as unknown as typeof fetch;
    const out = await fetchStakeSlices("VOTE", { ...opts, fetchImpl: f });
    expect(out).toHaveLength(1);
    expect(parseStakeSlice(out[0])!.withdrawer).toBe(fx("jito").withdrawer);
    expect(body!.params[1].dataSlice).toEqual({ offset: 12, length: 168 });
    expect(body!.params[1].filters).toEqual([{ dataSize: 200 }, { memcmp: { offset: 124, bytes: "VOTE" } }]);
  });

  it("fetchValidatorPools returns the qualifying pools", async () => {
    const data = (id: string) => ({ account: { data: [fx(id).sliceBase64, "base64"] } });
    const pools = await fetchValidatorPools("V", index, EPOCH, { ...opts, fetchImpl: okFetch([data("jito"), data("deactivated")]) });
    expect(pools.map((p) => p.poolId)).toEqual(["jito"]);
  });

  it("refuses oversized and failing responses instead of truncating", async () => {
    await expect(fetchStakeSlices("V", { ...opts, fetchImpl: okFetch([], { headers: { "content-length": "999999999" } }) })).rejects.toThrow("too large");
    await expect(fetchStakeSlices("V", { ...opts, maxBytes: 50, fetchImpl: okFetch([{ account: { data: [fx("jito").sliceBase64, "base64"] } }]) })).rejects.toThrow("too large");
    await expect(fetchStakeSlices("V", { ...opts, fetchImpl: okFetch([], { status: 429 }) })).rejects.toThrow("HTTP 429");
    await expect(fetchStakeSlices("V", { ...opts, fetchImpl: okFetch({ not: "array" }) })).rejects.toThrow("unexpected shape");
    const errFetch = (async () => new Response(JSON.stringify({ error: { message: "boom" } }))) as unknown as typeof fetch;
    await expect(fetchStakeSlices("V", { ...opts, fetchImpl: errFetch })).rejects.toThrow("boom");
  });

  it("fetchEpoch validates the epoch", async () => {
    expect(await fetchEpoch({ ...opts, fetchImpl: okFetch({ epoch: 1052 }) })).toBe(1052);
    await expect(fetchEpoch({ ...opts, fetchImpl: okFetch({ epoch: "x" }) })).rejects.toThrow("bad epoch");
  });
});

describe("sfdp", () => {
  const rows = sfdpFixture.rows;
  const approved = rows.filter((r) => r.state === "Approved").map((r) => r.mainnetBetaPubkey);
  const others = rows.filter((r) => r.state !== "Approved").map((r) => r.mainnetBetaPubkey);

  it("keeps only Approved rows whose identity we asked about", () => {
    const got = parseSfdpApproved(rows, [...approved.slice(0, 2), ...others, "unrelated"]);
    expect([...got].sort()).toEqual(approved.slice(0, 2).sort());
  });

  it("tolerates unexpected shapes without throwing", () => {
    for (const bad of [null, undefined, 42, "x", {}, { rows: [] }, [null, 3, "x", [], {}, { state: "Approved" }, { state: "Approved", mainnetBetaPubkey: 5 }]]) {
      expect(parseSfdpApproved(bad, approved).size).toBe(0);
    }
  });

  it("fetchSfdpApproved returns null on failure so the caller keeps the last value", async () => {
    const ok = async () => ({ status: 200, body: JSON.stringify(rows) });
    expect([...(await fetchSfdpApproved(approved, ok))!].sort()).toEqual([...approved].sort());
    expect(await fetchSfdpApproved(approved, async () => ({ status: 500, body: "" }))).toBeNull();
    expect(await fetchSfdpApproved(approved, async () => ({ status: 200, body: "not json" }))).toBeNull();
    expect(await fetchSfdpApproved(approved, async () => ({ status: 200, body: "{}" }))).toBeNull();
    expect(await fetchSfdpApproved(approved, async () => ({ status: 200, body: " ".repeat(4 * 1024 * 1024 + 1) }))).toBeNull();
    expect(await fetchSfdpApproved(approved, async () => { throw new Error("down"); })).toBeNull();
  });
});

const jitoRaw = poolsFixture.accounts.find((a) => a.pubkey === "Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb")!;

describe("pool discovery", () => {
  const raw = poolsFixture.accounts;
  const jito = jitoRaw;

  it("parses a real StakePool account", () => {
    const c = parseStakePool(jito.pubkey, SPL_STAKE_POOL_PROGRAM, Buffer.from(jito.account.data[0], "base64"))!;
    expect(c.poolMint).toBe("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn");
    expect(c.validatorList).toBe("3R3nGZpQs2aZo5FDQvd2MUQ6R7KhAPainds6uT6uE2mn");
    expect(c.withdrawAuthority).toBe("6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS");
  });

  it("rejects other account types and short data", () => {
    const b = Buffer.from(jito.account.data[0], "base64");
    b[0] = 2;
    expect(parseStakePool("p", SPL_STAKE_POOL_PROGRAM, b)).toBeNull();
    expect(parseStakePool("p", SPL_STAKE_POOL_PROGRAM, new Uint8Array(10))).toBeNull();
  });

  it("lists candidates from getProgramAccounts and skips junk", async () => {
    let params: unknown[] = [];
    const f = (async (_u: unknown, init: RequestInit) => {
      params = JSON.parse(String(init.body)).params;
      return new Response(JSON.stringify({ result: [...raw, { pubkey: 1, account: {} }, { pubkey: "x", account: { data: ["AAAA", "base64"] } }] }));
    }) as unknown as typeof fetch;
    const out = await discoverStakePools(SPL_STAKE_POOL_PROGRAM, { rpcUrl: "https://rpc.example", fetchImpl: f });
    expect(out.map((c) => c.pool).sort()).toEqual(raw.map((a) => a.pubkey).sort());
    expect(params[0]).toBe(SPL_STAKE_POOL_PROGRAM);
    expect((params[1] as { filters: unknown[] }).filters).toEqual([{ memcmp: { offset: 0, bytes: "2" } }]);
    await expect(discoverStakePools(SPL_STAKE_POOL_PROGRAM, { rpcUrl: "https://x", fetchImpl: okFetch("nope") })).rejects.toThrow("unexpected shape");
  });
});

describe("candidate measurement", () => {
  const SOL = 1_000_000_000n;
  /** A ValidatorList account: header (type 2, max, length) and 73-byte entries starting with active_stake_lamports. */
  function list(activeSol: (number | bigint)[], type = 2): Buffer {
    const b = Buffer.alloc(9 + activeSol.length * 73);
    b[0] = type;
    b.writeUInt32LE(100, 1);
    b.writeUInt32LE(activeSol.length, 5);
    activeSol.forEach((sol, i) => {
      const o = 9 + i * 73;
      b.writeBigUInt64LE(typeof sol === "bigint" ? sol : BigInt(Math.round(sol * 1e9)), o);
      b.writeBigUInt64LE(7n * SOL, o + 8); // transient stake never counts
    });
    return b;
  }

  it("sums active stake and counts validators with at least 1 SOL", () => {
    expect(summarizeValidatorList(list([5000, 4000, 1000, 0.00266624, 0]))).toEqual({ validators: 3, activeLamports: BigInt(Math.round(10000.00266624 * 1e9)) });
    expect(summarizeValidatorList(list([]))).toEqual({ validators: 0, activeLamports: 0n });
  });

  it("rejects lists of another type, truncated lists and absurd lengths", () => {
    expect(summarizeValidatorList(list([1], 1))).toBeNull();
    expect(summarizeValidatorList(list([1000, 1000]).subarray(0, 100))).toBeNull();
    expect(summarizeValidatorList(new Uint8Array(4))).toBeNull();
    const huge = list([1]);
    huge.writeUInt32LE(0xffffffff, 5);
    expect(summarizeValidatorList(huge)).toBeNull();
  });

  it("needs 3 distinct validators and 10,000 SOL, nothing less", () => {
    const q = (v: number, sol: bigint) => qualifiesAsCandidate({ validators: v, activeLamports: sol * SOL });
    expect(q(3, 10_000n)).toBe(true);
    expect(q(2, 1_000_000n)).toBe(false); // a one- or two-validator LST is not a candidate
    expect(q(1, 1_000_000n)).toBe(false);
    expect(q(50, 9_999n)).toBe(false);
    expect(MIN_CANDIDATE_LAMPORTS).toBe(10_000n * SOL);
  });

  it("reads total_lamports from the StakePool prefix and uses it as a free pre-filter", () => {
    const real = Buffer.from(jitoRaw.account.data[0], "base64"); // the recorded Jito account (~10.44M SOL total)
    expect(parseStakePool("p", SPL_STAKE_POOL_PROGRAM, real)!.totalLamports).toBe(10_441_891_934_944_817n);
    const base = real.subarray(0, 194); // a prefix without total_lamports
    expect(parseStakePool("p", SPL_STAKE_POOL_PROGRAM, base)!.totalLamports).toBeNull();
    const full = Buffer.alloc(266);
    base.copy(full);
    full.writeBigUInt64LE(25_000n * SOL, 258);
    const c = parseStakePool("p", SPL_STAKE_POOL_PROGRAM, full)!;
    expect(c.totalLamports).toBe(25_000n * SOL);
    expect(mayQualify(c)).toBe(true);
    expect(mayQualify({ totalLamports: 9_999n * SOL })).toBe(false);
    expect(mayQualify({ totalLamports: null })).toBe(true);
  });

  // Header of the real Jito token metadata account (8yn5oqFM...); the name is padded to 32 bytes as on chain.
  const META_HEAD = Buffer.from("BMRMC0OCUN+z22qnNe6j9AhUAxTVLRTZvX0pK6xUPI62/NFB6YMsrxCtkXSVyg8nG1spPNRwJ+pzcAftQOs5oL0g", "base64");
  const meta = (name: string) => {
    const nameBytes = Buffer.from(name, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32LE(32);
    return Buffer.concat([META_HEAD.subarray(0, 65), len, nameBytes, Buffer.alloc(32 - nameBytes.length), Buffer.alloc(40)]);
  };

  it("parses and sanitizes the token name from Metaplex metadata", () => {
    expect(parseMetaplexName(meta("Jito Staked SOL"))).toBe("Jito Staked SOL");
    expect(parseMetaplexName(meta("A\u202EB\u200Bevil"))).toBe("A B evil");
    expect(parseMetaplexName(meta(""))).toBeNull();
    expect(parseMetaplexName(new Uint8Array(10))).toBeNull();
    const lying = meta("x");
    lying.writeUInt32LE(5000, 65);
    expect(parseMetaplexName(lying)).toBeNull();
  });

  const META_PDA = "8yn5oqFMwYA8SgGqWwKq1Hia8aM5gh1DWmHEL34hMqBX";
  const rpc = (replies: Record<string, Buffer>, seen: string[] = []) => ({
    rpcUrl: "https://rpc.example",
    fetchImpl: (async (_u: unknown, init: RequestInit) => {
      const req = JSON.parse(String(init.body));
      seen.push(`${req.method}:${req.params[0]}`);
      const data = replies[req.params[0]];
      return new Response(JSON.stringify({ result: { value: data ? { data: [data.toString("base64"), "base64"] } : null } }));
    }) as unknown as typeof fetch,
  });
  const candidate = { program: SPL_STAKE_POOL_PROGRAM, pool: "P", poolMint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", validatorList: "VL", withdrawAuthority: "W", totalLamports: null };

  it("reads the validator list then, only for qualifying pools, the token name (two getAccountInfo calls)", async () => {
    const seen: string[] = [];
    const good = await measureCandidate(candidate, rpc({ VL: list([5000, 4000, 3000]), [META_PDA]: meta("Jito Staked SOL") }, seen));
    expect(good).toEqual({ validators: 3, stakeLamports: 12_000n * SOL, mintName: "Jito Staked SOL" });
    expect(seen).toEqual(["getAccountInfo:VL", `getAccountInfo:${META_PDA}`]);

    seen.length = 0;
    expect(await measureCandidate(candidate, rpc({ VL: list([900_000]) }, seen))).toBeNull(); // one validator: no second call
    expect(seen).toEqual(["getAccountInfo:VL"]);
    expect(await measureCandidate(candidate, rpc({}))).toBeNull(); // account gone
  });

  it("a missing token name does not block a qualifying pool, and RPC errors propagate", async () => {
    expect(await measureCandidate(candidate, rpc({ VL: list([4000, 4000, 4000]) }))).toMatchObject({ validators: 3, mintName: null });
    let calls = 0;
    const failing = { rpcUrl: "https://x", retryDelayMs: 0, fetchImpl: (async () => (calls++, new Response("no", { status: 429 }))) as unknown as typeof fetch };
    await expect(measureCandidate(candidate, failing)).rejects.toThrow("429");
    expect(calls).toBe(3); // one try and two retries, then it gives up
    const serverError = { rpcUrl: "https://x", retryDelayMs: 0, fetchImpl: (async () => (calls++, new Response("no", { status: 500 }))) as unknown as typeof fetch };
    calls = 0;
    await expect(measureCandidate(candidate, serverError)).rejects.toThrow("500");
    expect(calls).toBe(1); // only rate limits are retried
    // a rate limit that clears on the second try succeeds
    let n = 0;
    const flaky = { rpcUrl: "https://x", retryDelayMs: 0, fetchImpl: (async () => (n++ === 0 ? new Response("slow", { status: 429 }) : new Response(JSON.stringify({ result: { value: null } })))) as unknown as typeof fetch };
    expect(await measureCandidate(candidate, flaky)).toBeNull();
  });
});
