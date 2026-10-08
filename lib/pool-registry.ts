import { existsSync } from "node:fs";
import path from "node:path";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { poolCandidates } from "@/db/schema";
import { STAKE_POOLS, type StakePoolDef } from "@/lib/solana/stake-pools";

/** Logo ids are file names under public/pools: lowercase letters, digits and dashes only. */
export const LOGO_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

const LOGO_EXTENSIONS = ["svg", "png"] as const;
const logoCache = new Map<string, string>();

/** `/pools/<id>.svg|png` when that file ships with the app, otherwise null. Never builds a path from unvalidated text. */
export function logoPathFor(logoId: string, exists: (file: string) => boolean = existsSync): string | null {
  if (!LOGO_ID_RE.test(logoId)) return null;
  const cached = exists === existsSync ? logoCache.get(logoId) : undefined;
  if (cached) return cached;
  const ext = LOGO_EXTENSIONS.find((e) => exists(path.join(process.cwd(), "public", "pools", `${logoId}.${e}`)));
  if (!ext) return null;
  const result = `/pools/${logoId}.${ext}`;
  if (exists === existsSync) logoCache.set(logoId, result); // only hits are cached: a logo added later is picked up
  return result;
}

export interface ApprovedRow {
  pool: string;
  program: string;
  name: string | null;
  logoId: string | null;
}

/**
 * Turns approved candidates into pool definitions, one per logo id. A logo id that is also a registry id adds the
 * candidate's pool to that registry entry (name and logo stay the registry's); otherwise the first approved name wins.
 * Rows without a name or without a logo file on disk are skipped: they are neither scanned nor shown.
 */
export function approvedToPools(rows: readonly ApprovedRow[], logo: (id: string) => string | null = logoPathFor): StakePoolDef[] {
  const byId = new Map<string, StakePoolDef>();
  for (const r of rows) {
    if (!r.name || !r.logoId) continue;
    const staticDef = STAKE_POOLS.find((p) => p.id === r.logoId);
    const logoPath = staticDef?.logo ?? logo(r.logoId);
    if (!logoPath) continue;
    const def = byId.get(r.logoId) ?? { id: r.logoId, name: staticDef?.name ?? r.name, logo: logoPath, authorities: [] };
    def.authorities.push({ kind: "spl-pool", pool: r.pool, program: r.program });
    byId.set(r.logoId, def);
  }
  return [...byId.values()];
}

/** Approved candidates as pool definitions (static registry entries are not repeated here). */
export async function loadApprovedPools(): Promise<StakePoolDef[]> {
  const rows = await getDb()
    .select({ pool: poolCandidates.pool, program: poolCandidates.program, name: poolCandidates.name, logoId: poolCandidates.logoId })
    .from(poolCandidates)
    .where(and(eq(poolCandidates.status, "approved"), isNotNull(poolCandidates.name), isNotNull(poolCandidates.logoId)))
    .orderBy(asc(poolCandidates.decidedAt), asc(poolCandidates.pool));
  return approvedToPools(rows);
}

export interface PoolMeta {
  name: string;
  logo: string;
}

/** Display data for every pool that may be shown: the static registry plus approved candidates. Nothing else is ever shown. */
export function poolMetaMap(approved: readonly StakePoolDef[]): Map<string, PoolMeta> {
  const out = new Map<string, PoolMeta>();
  for (const p of [...approved, ...STAKE_POOLS]) out.set(p.id, { name: p.name, logo: p.logo });
  return out;
}
