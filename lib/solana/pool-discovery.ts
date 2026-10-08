import bs58 from "bs58";
import { poolRpc, type PoolRpcOptions } from "./pool-stake";
import { splWithdrawAuthority } from "./pda";

/** `StakePool` account prefix we read: account_type .. pool_mint (bytes 0..194). */
export const STAKE_POOL_SLICE = { offset: 0, length: 194 } as const;
/** account_type = 1 (StakePool) encoded in base58. */
const ACCOUNT_TYPE_STAKE_POOL_B58 = "2";

export interface PoolCandidate {
  program: string;
  pool: string;
  poolMint: string;
  validatorList: string;
  withdrawAuthority: string;
}

/** Parses one StakePool prefix: manager 1, staker 33, deposit auth 65, bump 97, validator_list 98, reserve 130, pool_mint 162. */
export function parseStakePool(pool: string, program: string, bytes: Uint8Array): PoolCandidate | null {
  if (bytes.length < STAKE_POOL_SLICE.length || bytes[0] !== 1) return null;
  return {
    program,
    pool,
    validatorList: bs58.encode(bytes.subarray(98, 130)),
    poolMint: bs58.encode(bytes.subarray(162, 194)),
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
