import { splWithdrawAuthority } from "./pda";

/**
 * Static, versioned registry of liquid-staking pools whose delegations are attributed on validator profiles.
 *
 * Every authority below was checked against mainnet-beta on 2026-10-08 (epoch 1052): a real stake account
 * delegated to a validator carried that exact withdrawer (or staker) address. The matching fixtures live in
 * tests/fixtures/stake-pools/stake-accounts.json and are asserted in tests/stake-pools.test.ts.
 * A new entry needs the same proof; names and logos are curated here, never read from the chain.
 */
/**
 * Bump whenever an entry or authority is added or changed: the pools job rescans every verified validator once per
 * version (see runPools), so new authorities show up without waiting for the weekly rotation.
 */
export const REGISTRY_VERSION = 2;

export const SPL_STAKE_POOL_PROGRAM = "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy";
/** Sanctum fork of the SPL stake pool program (single-validator LSTs). */
export const SANCTUM_SPL_PROGRAM = "SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY";
/** Sanctum multi-validator stake pool program. */
export const SANCTUM_MULTI_PROGRAM = "SPMBzsVUuoHA4Jm6KunbsotaahvVikZs1JyTW6iJvbn";

export type PoolAuthority =
  /** One SPL-style pool: its withdraw authority is PDA([pool, "withdraw"], program). */
  | { kind: "spl-pool"; pool: string; program: string }
  /** A fixed address matched against the stake account's withdrawer or staker. */
  | { kind: "address"; address: string; role: "withdrawer" | "staker" };

export interface StakePoolDef {
  id: string;
  name: string;
  /** Repo-owned asset, never hotlinked. */
  logo: string;
  authorities: PoolAuthority[];
  /**
   * `false` keeps the entry in the registry but switches it off: its authorities are not indexed, nothing is
   * scanned or attributed for it, and it is never shown. Defaults to enabled.
   */
  enabled?: boolean;
}

// Alphabetical by name: the registry gives no pool precedence.
export const STAKE_POOLS: readonly StakePoolDef[] = [
  {
    // DISABLED until the official name and brand are confirmed: the pool's mint is named "Phase Delegation Staked SOL
    // (pdSOL)", so it is not certain this pool is the "Aero" product. The authority below is verified (see fixtures)
    // and stays so the entry can be switched on by removing `enabled: false`.
    id: "aero",
    name: "Aero",
    enabled: false,
    logo: "/pools/aero.png",
    authorities: [{ kind: "spl-pool", pool: "aero2ePURjuEgLKTzcUmF6RypBncBGd7pMUYCoSsVJ6", program: SPL_STAKE_POOL_PROGRAM }],
  },
  {
    id: "blazestake",
    name: "BlazeStake",
    logo: "/pools/blazestake.png",
    authorities: [{ kind: "spl-pool", pool: "stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi", program: SPL_STAKE_POOL_PROGRAM }],
  },
  {
    // Jito spreads its stake almost evenly: on 2026-10-08 (epoch 1052) its ValidatorList held ~31,681.5 SOL for each of
    // many validators (e.g. 3iPuTg... 31,681.5485 SOL, 644K33... 31,681.5667 SOL). Our scan, summing active stake
    // accounts, got 31,681.5468 / 31,681.5650 SOL for those two (within 0.01 %), so identical figures across
    // validators are real and not an attribution bug.
    id: "jito",
    name: "Jito",
    logo: "/pools/jito.png",
    authorities: [{ kind: "spl-pool", pool: "Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb", program: SPL_STAKE_POOL_PROGRAM }],
  },
  {
    id: "jpool",
    name: "JPool",
    logo: "/pools/jpool.svg",
    authorities: [{ kind: "spl-pool", pool: "CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1", program: SPL_STAKE_POOL_PROGRAM }],
  },
  {
    id: "marinade",
    name: "Marinade",
    logo: "/pools/marinade.png",
    authorities: [
      // Liquid staking: PDA([state, "withdraw"], MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD), state 8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC.
      { kind: "address", address: "9eG63CdHjsfhHmobHgLtESGC8GabbmRcaSpHAZrtmhco", role: "withdrawer" },
      // Marinade Native: the depositor keeps the withdrawer, Marinade is the staker.
      { kind: "address", address: "stWirqFCf2Uts1JBL1Jsd3r6VBWhgnpdPxCTe1MFjrq", role: "staker" },
    ],
  },
  {
    id: "sanctum",
    name: "Sanctum",
    logo: "/pools/sanctum.png",
    // No address is registered on purpose. The Infinity (INF) mint is not a stake pool of either Sanctum
    // program (checked against both on 2026-10-08), and those programs host over 1,600 pools of other brands
    // (jupSOL, Lantern, hundreds of "(Sanctum Automated)" validator LSTs) that anyone can create. Individual
    // Sanctum-branded pools enter through approved candidates (pool_candidates) with logo_id "sanctum".
    authorities: [],
  },
  {
    // Solana Foundation Delegation Program (SFDP). The Foundation delegates from stake accounts whose staker is
    // mpa4abUkjQoAvPzREkh5Mo75hZhPFQ2FSH6w7dWKuQ5 and whose withdrawer is one of two Foundation addresses: the base
    // delegation (4ZJhPQ...) and a second, smaller one (BVPWEK...). Both were seen on the SFDP-approved validators
    // EN5F2B... (SunshineVR), 3YX7PQ..., CZanBz..., hnhCMm... and BR1aTt... on 2026-10-09 (epoch 1052): base 45,814-57,794 SOL
    // and second 233-294 SOL each (tests/fixtures/stake-pools/stake-accounts.json, foundationChecks). They are registered
    // by withdrawer only: the staker key also appears with unrelated withdrawers, and the withdrawer wins anyway.
    id: "solana-foundation",
    name: "Solana Foundation",
    logo: "/pools/solana-foundation.svg",
    authorities: [
      { kind: "address", address: "4ZJhPQAgUseCsWhKvJLTmmRRUV74fdoTpQLNfKoekbPY", role: "withdrawer" },
      { kind: "address", address: "BVPWEKqzHD4H2pAX34wbtn33eNpzx6KxHxuaJW7uKZei", role: "withdrawer" },
    ],
  },
  {
    id: "vault",
    name: "The Vault",
    logo: "/pools/vault.png",
    authorities: [{ kind: "spl-pool", pool: "Fu9BYC6tWBo1KMKaP3CFoKfRhqv9akmy3DuYwnCyWiyC", program: SPL_STAKE_POOL_PROGRAM }],
  },
];

export interface AuthorityIndex {
  /** withdrawer address -> pool id */
  withdrawers: Map<string, string>;
  /** staker address -> pool id */
  stakers: Map<string, string>;
}

/**
 * Builds the lookup used to attribute stake accounts.
 * `extra` holds pools approved at runtime (see pool_candidates); an entry with the id of a static pool adds its
 * authorities to that pool. An address claimed by two different pools is dropped from both rather than
 * attributed to whichever came first.
 */
export function buildAuthorityIndex(pools: readonly StakePoolDef[] = STAKE_POOLS, extra: readonly StakePoolDef[] = []): AuthorityIndex {
  const claims = { withdrawers: new Map<string, Set<string>>(), stakers: new Map<string, Set<string>>() };
  const claim = (side: "withdrawers" | "stakers", address: string, id: string) => {
    const set = claims[side].get(address) ?? new Set<string>();
    set.add(id);
    claims[side].set(address, set);
  };
  for (const pool of [...pools, ...extra]) {
    if (pool.enabled === false) continue;
    for (const a of pool.authorities) {
      if (a.kind === "address") claim(a.role === "withdrawer" ? "withdrawers" : "stakers", a.address, pool.id);
      else claim("withdrawers", splWithdrawAuthority(a.pool, a.program), pool.id);
    }
  }
  const flatten = (m: Map<string, Set<string>>) => {
    const out = new Map<string, string>();
    for (const [address, ids] of m) if (ids.size === 1) out.set(address, [...ids][0]);
    return out;
  };
  return { withdrawers: flatten(claims.withdrawers), stakers: flatten(claims.stakers) };
}

export const poolById = (id: string): StakePoolDef | undefined => STAKE_POOLS.find((p) => p.id === id);
