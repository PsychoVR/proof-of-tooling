import bs58 from "bs58";
import { poolRpc, retryOnRateLimit, type PoolRpcOptions } from "./pool-stake";
import { findProgramAddress, splWithdrawAuthority } from "./pda";
import { sanitizeText } from "@/lib/text";

/** `StakePool` account prefix we read: account_type .. total_lamports (bytes 0..266). */
export const STAKE_POOL_SLICE = { offset: 0, length: 266 } as const;
/** The prefix up to pool_mint is enough to identify a pool; total_lamports (258..266) is optional. */
const POOL_MINT_END = 194;
const TOTAL_LAMPORTS_OFFSET = 258;

/** A pool is listed as a candidate only if it delegates to at least this many distinct validators... */
export const MIN_CANDIDATE_VALIDATORS = 3;
/** ...and holds at least this much active stake in total (10,000 SOL). */
export const MIN_CANDIDATE_LAMPORTS = 10_000_000_000_000n;
/** A validator counts towards the minimum only with at least 1 SOL of active stake from the pool (not dust). */
export const MIN_VALIDATOR_LAMPORTS = 1_000_000_000n;
/** Pools measured per discovery run, largest first. The rest wait for the next run. */
export const MAX_MEASURED_PER_RUN = 300;
/** account_type = 1 (StakePool) encoded in base58. */
const ACCOUNT_TYPE_STAKE_POOL_B58 = "2";

export interface PoolCandidate {
  program: string;
  pool: string;
  poolMint: string;
  validatorList: string;
  withdrawAuthority: string;
  /** StakePool.total_lamports (includes reserve and stake not yet active), or null if the account prefix was short. */
  totalLamports: bigint | null;
}

/** Parses one StakePool prefix: manager 1, staker 33, deposit auth 65, bump 97, validator_list 98, reserve 130, pool_mint 162. */
export function parseStakePool(pool: string, program: string, bytes: Uint8Array): PoolCandidate | null {
  if (bytes.length < POOL_MINT_END || bytes[0] !== 1) return null;
  const totalLamports =
    bytes.length >= TOTAL_LAMPORTS_OFFSET + 8 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(TOTAL_LAMPORTS_OFFSET, true) : null;
  return {
    totalLamports,
    program,
    pool,
    validatorList: bs58.encode(bytes.subarray(98, 130)),
    poolMint: bs58.encode(bytes.subarray(162, POOL_MINT_END)),
    withdrawAuthority: splWithdrawAuthority(pool, program),
  };
}

/** One getProgramAccounts call per program: every StakePool account it owns. Names and logos cannot be derived from the chain. */
export async function discoverStakePools(program: string, o: PoolRpcOptions): Promise<PoolCandidate[]> {
  const result = await poolRpc<unknown>(
    "getProgramAccounts",
    [
      program,
      {
        encoding: "base64",
        dataSlice: STAKE_POOL_SLICE,
        filters: [{ memcmp: { offset: 0, bytes: ACCOUNT_TYPE_STAKE_POOL_B58 } }],
      },
    ],
    o,
  );
  if (!Array.isArray(result)) throw new Error("RPC getProgramAccounts: unexpected shape");
  const out: PoolCandidate[] = [];
  for (const item of result as { pubkey?: unknown; account?: { data?: unknown } }[]) {
    const data = item?.account?.data;
    if (typeof item?.pubkey !== "string" || !Array.isArray(data) || typeof data[0] !== "string") continue;
    const c = parseStakePool(item.pubkey, program, Buffer.from(data[0], "base64"));
    if (c) out.push(c);
  }
  return out;
}

// ---- measuring a candidate ----

/** Header: account_type u8, max_validators u32, then a Vec length u32; entries of 73 bytes follow. */
const LIST_HEADER = 9;
const LIST_ENTRY = 73;
const VALIDATOR_LIST_TYPE = 2;

export interface ValidatorListSummary {
  /** Entries with at least MIN_VALIDATOR_LAMPORTS of active stake. */
  validators: number;
  /** Active stake over all entries, in lamports. */
  activeLamports: bigint;
}

/**
 * Sums a pool's ValidatorList. ValidatorStakeInfo (73 bytes): active_stake_lamports u64, transient_stake_lamports u64,
 * last_update_epoch u64, transient_seed_suffix u64, unused u32, validator_seed_suffix u32, status u8, vote_account 32.
 * Only active_stake_lamports counts: transient (moving) stake is not delegated yet. Returns null for anything that is
 * not a well-formed list.
 */
export function summarizeValidatorList(bytes: Uint8Array): ValidatorListSummary | null {
  if (bytes.length < LIST_HEADER || bytes[0] !== VALIDATOR_LIST_TYPE) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint32(5, true);
  if (LIST_HEADER + n * LIST_ENTRY > bytes.length) return null;
  let validators = 0;
  let activeLamports = 0n;
  for (let i = 0; i < n; i++) {
    const active = dv.getBigUint64(LIST_HEADER + i * LIST_ENTRY, true);
    activeLamports += active;
    if (active >= MIN_VALIDATOR_LAMPORTS) validators++;
  }
  return { validators, activeLamports };
}

export const qualifiesAsCandidate = (m: Pick<ValidatorListSummary, "validators" | "activeLamports">): boolean =>
  m.validators >= MIN_CANDIDATE_VALIDATORS && m.activeLamports >= MIN_CANDIDATE_LAMPORTS;

/** Cheap pre-filter from the StakePool prefix: a pool with less than 10,000 SOL in total cannot reach it in active stake. */
export const mayQualify = (c: Pick<PoolCandidate, "totalLamports">): boolean => c.totalLamports === null || c.totalLamports >= MIN_CANDIDATE_LAMPORTS;

const METAPLEX_METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const MINT_NAME_MAX = 80;

/** Metaplex Metadata account: key u8, update_authority 32, mint 32, then name as u32 length + bytes (padded with NULs). */
export function parseMetaplexName(bytes: Uint8Array): string | null {
  if (bytes.length < 69) return null;
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(65, true);
  if (len > 200 || 69 + len > bytes.length) return null;
  // Third-party text: cleaned like any other free text, and capped.
  return sanitizeText(Buffer.from(bytes.subarray(69, 69 + len)).toString("utf8"), MINT_NAME_MAX);
}

export interface CandidateMeasure {
  validators: number;
  stakeLamports: bigint;
  mintName: string | null;
}

async function accountBytes(address: string, o: PoolRpcOptions): Promise<Uint8Array | null> {
  const r = await retryOnRateLimit(() => poolRpc<{ value?: { data?: unknown } | null }>("getAccountInfo", [address, { encoding: "base64" }], o), o);
  const data = r?.value?.data;
  return Array.isArray(data) && typeof data[0] === "string" ? Buffer.from(data[0], "base64") : null;
}

/**
 * Reads the pool's ValidatorList (one getAccountInfo) and, only when the pool qualifies, its token metadata (one more
 * getAccountInfo). Returns null when the pool does not qualify; throws on RPC errors so the caller can retry later.
 */
export async function measureCandidate(c: PoolCandidate, o: PoolRpcOptions): Promise<CandidateMeasure | null> {
  const list = await accountBytes(c.validatorList, o);
  const summary = list ? summarizeValidatorList(list) : null;
  if (!summary || !qualifiesAsCandidate(summary)) return null;
  let mintName: string | null = null;
  try {
    const metadata = findProgramAddress([Buffer.from("metadata"), bs58.decode(METAPLEX_METADATA_PROGRAM), bs58.decode(c.poolMint)], METAPLEX_METADATA_PROGRAM).address;
    const bytes = await accountBytes(metadata, o);
    mintName = bytes ? parseMetaplexName(bytes) : null;
  } catch {
    mintName = null; // the name is a convenience for the admin; its absence never blocks a qualifying pool
  }
  return { validators: summary.validators, stakeLamports: summary.activeLamports, mintName };
}
