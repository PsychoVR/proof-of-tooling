import bs58 from "bs58";
import type { AuthorityIndex } from "./stake-pools";

export const STAKE_PROGRAM = "Stake11111111111111111111111111111111111111";
export const STAKE_ACCOUNT_SIZE = 200;
/** Offset of `voter_pubkey` (delegation) in a 200 byte stake account. */
export const VOTER_OFFSET = 124;

/**
 * Slice requested from every stake account: bytes 12..180 of the account.
 * Relative to the slice: staker 0..32, withdrawer 32..64, voter 112..144, stake u64 144..152,
 * activation epoch u64 152..160, deactivation epoch u64 160..168.
 */
export const STAKE_SLICE = { offset: 12, length: 168 } as const;

export const U64_MAX = 0xffff_ffff_ffff_ffffn;
/** 100 SOL of active stake per pool. */
export const MIN_POOL_LAMPORTS = 100_000_000_000n;
/** Largest getProgramAccounts response read; bigger answers are refused, never truncated. */
export const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;

export interface StakeSlice {
  staker: string;
  withdrawer: string;
  voter: string;
  lamports: bigint;
  activationEpoch: bigint;
  deactivationEpoch: bigint;
}

export function parseStakeSlice(bytes: Uint8Array): StakeSlice | null {
  if (bytes.length < STAKE_SLICE.length) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    staker: bs58.encode(bytes.subarray(0, 32)),
    withdrawer: bs58.encode(bytes.subarray(32, 64)),
    voter: bs58.encode(bytes.subarray(112, 144)),
    lamports: dv.getBigUint64(144, true),
    activationEpoch: dv.getBigUint64(152, true),
    deactivationEpoch: dv.getBigUint64(160, true),
  };
}

/**
 * Counts only stake that is effective now: not deactivating or deactivated, and past its activation epoch.
 * Stake delegated during epoch N has no effective balance until epoch N+1, so activation_epoch == current
 * epoch is still "activating" and excluded. u64::MAX as activation epoch marks bootstrap stake (active from genesis).
 * Partial warm-up of very large delegations cannot be seen from the account alone and is counted as active.
 */
export function isActiveStake(s: Pick<StakeSlice, "activationEpoch" | "deactivationEpoch">, epoch: number): boolean {
  if (s.deactivationEpoch !== U64_MAX) return false;
  return s.activationEpoch === U64_MAX || s.activationEpoch < BigInt(epoch);
}

/** Pool that owns this stake account, or null. The withdrawer wins over the staker. */
export function attributeStake(s: Pick<StakeSlice, "staker" | "withdrawer">, index: AuthorityIndex): string | null {
  return index.withdrawers.get(s.withdrawer) ?? index.stakers.get(s.staker) ?? null;
}

/** Sums active lamports per pool id over raw slices. Malformed slices are skipped. */
export function aggregatePoolStake(slices: Iterable<Uint8Array>, index: AuthorityIndex, epoch: number): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const bytes of slices) {
    const s = parseStakeSlice(bytes);
    if (!s || !isActiveStake(s, epoch)) continue;
    const pool = attributeStake(s, index);
    if (pool) totals.set(pool, (totals.get(pool) ?? 0n) + s.lamports);
  }
  return totals;
}

export interface PoolStake {
  poolId: string;
  lamports: bigint;
}

/** Pools at or above the threshold, largest first, ties by id. */
export function selectPools(totals: Map<string, bigint>, minLamports: bigint = MIN_POOL_LAMPORTS): PoolStake[] {
  return [...totals]
    .filter(([, lamports]) => lamports >= minLamports)
    .map(([poolId, lamports]) => ({ poolId, lamports }))
    .sort((a, b) => (a.lamports === b.lamports ? (a.poolId < b.poolId ? -1 : 1) : a.lamports > b.lamports ? -1 : 1));
}

// ---- RPC ----

export interface PoolRpcOptions {
  rpcUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  /** Base wait before retrying a rate-limited (HTTP 429) call in `retryOnRateLimit`; defaults to 1,000 ms. */
  retryDelayMs?: number;
}

/** Runs `call`, retrying up to twice with growing waits when the RPC answers HTTP 429 (public endpoints do under bursts). */
export async function retryOnRateLimit<T>(call: () => Promise<T>, o: Pick<PoolRpcOptions, "retryDelayMs">): Promise<T> {
  const base = o.retryDelayMs ?? 1000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (attempt >= 2 || !(err instanceof Error) || !err.message.endsWith("HTTP 429")) throw err;
      await new Promise((resolve) => setTimeout(resolve, base * (attempt + 1)));
    }
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("RPC response too large");
  if (!res.body) {
    const t = await res.text();
    if (t.length > maxBytes) throw new Error("RPC response too large");
    return t;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("RPC response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function poolRpc<T>(method: string, params: unknown[], o: PoolRpcOptions): Promise<T> {
  const f = o.fetchImpl ?? fetch;
  const res = await f(o.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 60_000),
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: HTTP ${res.status}`);
  const body = JSON.parse(await readCapped(res, o.maxBytes ?? MAX_RESPONSE_BYTES)) as { result?: T; error?: { message?: string } };
  if (body.error || body.result === undefined) throw new Error(`RPC ${method} error: ${body.error?.message ?? "empty result"}`);
  return body.result;
}

export async function fetchEpoch(o: PoolRpcOptions): Promise<number> {
  const info = await poolRpc<{ epoch?: unknown }>("getEpochInfo", [], o);
  if (typeof info.epoch !== "number" || !Number.isSafeInteger(info.epoch) || info.epoch < 0) throw new Error("RPC getEpochInfo: bad epoch");
  return info.epoch;
}

interface ProgramAccountRaw {
  account?: { data?: unknown };
}

/** One getProgramAccounts call (10 credits on Helius): every stake account delegated to `voteAccount`, sliced. */
export async function fetchStakeSlices(voteAccount: string, o: PoolRpcOptions): Promise<Uint8Array[]> {
  const result = await poolRpc<unknown>(
    "getProgramAccounts",
    [
      STAKE_PROGRAM,
      {
        encoding: "base64",
        dataSlice: STAKE_SLICE,
        filters: [{ dataSize: STAKE_ACCOUNT_SIZE }, { memcmp: { offset: VOTER_OFFSET, bytes: voteAccount } }],
      },
    ],
    o,
  );
  if (!Array.isArray(result)) throw new Error("RPC getProgramAccounts: unexpected shape");
  const out: Uint8Array[] = [];
  for (const item of result as ProgramAccountRaw[]) {
    const data = item?.account?.data;
    if (Array.isArray(data) && typeof data[0] === "string") out.push(Buffer.from(data[0], "base64"));
  }
  return out;
}

/** Active stake per qualifying pool for one validator (identity-agnostic: takes the vote account). */
export async function fetchValidatorPools(voteAccount: string, index: AuthorityIndex, epoch: number, o: PoolRpcOptions): Promise<PoolStake[]> {
  return selectPools(aggregatePoolStake(await fetchStakeSlices(voteAccount, o), index, epoch));
}
