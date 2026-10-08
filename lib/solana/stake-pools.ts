import { splWithdrawAuthority } from "./pda";

/**
 * Static, versioned registry of liquid-staking pools whose delegations are attributed on validator profiles.
 *
 * Every authority below was checked against mainnet-beta on 2026-10-08 (epoch 1052): a real stake account
 * delegated to a validator carried that exact withdrawer (or staker) address. The matching fixtures live in
 * tests/fixtures/stake-pools/stake-accounts.json and are asserted in tests/stake-pools.test.ts.
 * A new entry needs the same proof; names and logos are curated here, never read from the chain.
 */
export const REGISTRY_VERSION = 1;

export const SPL_STAKE_POOL_PROGRAM = "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy";
/** Sanctum fork of the SPL stake pool program (single-validator LSTs). */
export const SANCTUM_SPL_PROGRAM = "SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY";
/** Sanctum multi-validator stake pool program. */
export const SANCTUM_MULTI_PROGRAM = "SPMBzsVUuoHA4Jm6KunbsotaahvVikZs1JyTW6iJvbn";

export type PoolAuthority =
  /** One SPL-style pool: its withdraw authority is PDA([pool, "withdraw"], program). */
  | { kind: "spl-pool"; pool: string; program: string }
  /** Every pool of a program; the pool addresses come from discovery (see pool-discovery.ts). */
  | { kind: "spl-program"; program: string }
  /** A fixed address matched against the stake account's withdrawer or staker. */
  | { kind: "address"; address: string; role: "withdrawer" | "staker" };

export interface StakePoolDef {
  id: string;
  name: string;
  /** Repo-owned asset, never hotlinked. */
  logo: string;
  authorities: PoolAuthority[];
}

// Alphabetical by name: the registry gives no pool precedence.
export const STAKE_POOLS: readonly StakePoolDef[] = [
  {
    id: "aero",
    name: "Aero",
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
    authorities: [
      { kind: "spl-program", program: SANCTUM_SPL_PROGRAM },
      { kind: "spl-program", program: SANCTUM_MULTI_PROGRAM },
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
 * `programPools` maps a program id to the pool addresses discovered for it (needed for "spl-program" entries;
 * without it those entries simply match nothing). An address claimed by two pools is dropped from both rather
 * than attributed to whichever came first.
 */
export function buildAuthorityIndex(
  pools: readonly StakePoolDef[] = STAKE_POOLS,
  programPools: Readonly<Record<string, readonly string[]>> = {},
): AuthorityIndex {
  const claims = { withdrawers: new Map<string, Set<string>>(), stakers: new Map<string, Set<string>>() };
  const claim = (side: "withdrawers" | "stakers", address: string, id: string) => {
    const set = claims[side].get(address) ?? new Set<string>();
    set.add(id);
    claims[side].set(address, set);
  };
  for (const pool of pools) {
    for (const a of pool.authorities) {
      if (a.kind === "address") claim(a.role === "withdrawer" ? "withdrawers" : "stakers", a.address, pool.id);
      else if (a.kind === "spl-pool") claim("withdrawers", splWithdrawAuthority(a.pool, a.program), pool.id);
      else for (const addr of programPools[a.program] ?? []) claim("withdrawers", splWithdrawAuthority(addr, a.program), pool.id);
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
