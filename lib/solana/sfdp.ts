import type { Fetcher } from "@/lib/claims";

export const SFDP_URL = "https://api.solana.org/api/community/v1/sfdp_participants";
/** The list is ~1.9 MB today; refuse anything over 4 MB. */
export const SFDP_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Identities (mainnet-beta pubkeys) of SFDP participants in state "Approved" that are also in `identities`.
 * Anything unexpected (non-array, rows of the wrong shape, other states) is ignored; never throws.
 */
export function parseSfdpApproved(json: unknown, identities: Iterable<string>): Set<string> {
  const wanted = new Set(identities);
  const out = new Set<string>();
  if (!Array.isArray(json)) return out;
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (r.state !== "Approved") continue;
    const key = r.mainnetBetaPubkey;
    if (typeof key === "string" && wanted.has(key)) out.add(key);
  }
  return out;
}

/** Fetches and filters the list; `fetcher` must be the capped safe fetcher (maxBytes = SFDP_MAX_BYTES). Returns null on any failure so callers keep the previous value. */
export async function fetchSfdpApproved(identities: Iterable<string>, fetcher: Fetcher): Promise<Set<string> | null> {
  try {
    const res = await fetcher(SFDP_URL);
    if (res.status !== 200 || res.body.length > SFDP_MAX_BYTES) return null;
    const json: unknown = JSON.parse(res.body);
    if (!Array.isArray(json)) return null;
    return parseSfdpApproved(json, identities);
  } catch {
    return null;
  }
}
