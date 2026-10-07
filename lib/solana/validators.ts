import { clusterRpcUrl } from "@/lib/clusters";
import { sanitizeText } from "@/lib/text";
import type { Cluster, Validator } from "@/lib/types";

export const CONFIG_PROGRAM = "Config1111111111111111111111111111111111111";
export const VALIDATOR_INFO_KEY = "Va1idator1nfo111111111111111111111111111111";

export const rpcUrlFor = (cluster: Cluster): string => clusterRpcUrl(cluster);

// ---- untrusted input sanitizers (validator-info is free text written by anyone) ----

export { sanitizeText };

export function sanitizeUrl(input: unknown, opts: { httpsOnly?: boolean } = {}): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const okProto = opts.httpsOnly ? u.protocol === "https:" : u.protocol === "https:" || u.protocol === "http:";
  if (!okProto || u.username || u.password || !u.hostname.includes(".")) return null;
  const href = u.href;
  return href.length <= 512 ? href : null;
}

// ---- RPC ----

export type Fetcher = typeof fetch;

export interface RpcOptions {
  rpcUrl?: string;
  fetchImpl?: Fetcher;
  timeoutMs?: number;
}

async function rpc<T>(url: string, method: string, params: unknown[], o: RpcOptions): Promise<T> {
  const f = o.fetchImpl ?? fetch;
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: HTTP ${res.status}`);
  // Stakes are lamports and may not fit a double: quote them before JSON.parse.
  const text = (await res.text()).replace(/"activatedStake"\s*:\s*(\d+)/g, '"activatedStake":"$1"');
  const body = JSON.parse(text) as { result?: T; error?: { message?: string } };
  if (body.error || body.result === undefined) {
    throw new Error(`RPC ${method} error: ${body.error?.message ?? "empty result"}`);
  }
  return body.result;
}

interface VoteAccountRaw {
  votePubkey: string;
  nodePubkey: string;
  activatedStake: string | number;
}
export interface VoteAccountsResult {
  current: VoteAccountRaw[];
  delinquent: VoteAccountRaw[];
}
export interface ClusterNodeRaw {
  pubkey: string;
  version?: string | null;
}
export interface ConfigAccountRaw {
  pubkey: string;
  account: { data?: unknown };
}

export interface ValidatorInfo {
  name: string | null;
  website: string | null;
  iconUrl: string | null;
}

/** Parses jsonParsed Config program accounts into a map identity -> info. */
export function parseValidatorInfo(accounts: ConfigAccountRaw[]): Map<string, ValidatorInfo> {
  const out = new Map<string, ValidatorInfo>();
  for (const acc of accounts) {
    const data = acc?.account?.data as
      | {
          parsed?: {
            type?: string;
            info?: { keys?: { pubkey?: string; signer?: boolean }[]; configData?: Record<string, unknown> };
          };
        }
      | undefined;
    const parsed = data?.parsed;
    if (!parsed || parsed.type !== "validatorInfo" || !parsed.info) continue;
    const keys = parsed.info.keys;
    if (!Array.isArray(keys) || keys.length < 2 || keys[0]?.pubkey !== VALIDATOR_INFO_KEY) continue;
    // The identity must have signed the config transaction, otherwise anyone could
    // publish info for someone else's key.
    const idKey = keys[1];
    if (!idKey?.signer || typeof idKey.pubkey !== "string") continue;
    const cd = parsed.info.configData ?? {};
    out.set(idKey.pubkey, {
      name: sanitizeText(cd.name),
      website: sanitizeUrl(cd.website),
      iconUrl: null, // remote icons are never loaded (see components/Avatar.tsx)
    });
  }
  return out;
}

export function combineValidators(
  cluster: Cluster,
  votes: VoteAccountsResult,
  nodes: ClusterNodeRaw[],
  info: Map<string, ValidatorInfo>,
  now = new Date(),
): Validator[] {
  const versions = new Map<string, string>();
  for (const n of nodes ?? []) {
    const v = sanitizeText(n.version, 64);
    if (v && typeof n.pubkey === "string") versions.set(n.pubkey, v);
  }
  const byIdentity = new Map<string, Validator>();
  const add = (list: VoteAccountRaw[], delinquent: boolean) => {
    for (const va of list ?? []) {
      let stake: bigint;
      try {
        stake = BigInt(va.activatedStake);
      } catch {
        continue;
      }
      const prev = byIdentity.get(va.nodePubkey);
      // An identity can back several vote accounts; keep the largest one.
      if (prev && BigInt(prev.activatedStake) >= stake) continue;
      const meta = info.get(va.nodePubkey);
      byIdentity.set(va.nodePubkey, {
        identity: va.nodePubkey,
        cluster,
        voteAccount: va.votePubkey,
        name: meta?.name ?? null,
        website: meta?.website ?? null,
        iconUrl: meta?.iconUrl ?? null,
        activatedStake: stake.toString(),
        version: versions.get(va.nodePubkey) ?? null,
        delinquent,
        updatedAt: now.toISOString(),
      });
    }
  };
  add(votes.delinquent, true);
  add(votes.current, false);
  return [...byIdentity.values()];
}

/**
 * Reads vote accounts, cluster nodes (for versions) and validator-info for a cluster.
 * 3 RPC calls per cluster.
 */
export async function fetchValidators(cluster: Cluster, opts: RpcOptions = {}): Promise<Validator[]> {
  const url = opts.rpcUrl ?? rpcUrlFor(cluster);
  const [votes, nodes, configs] = await Promise.all([
    rpc<VoteAccountsResult>(url, "getVoteAccounts", [{ commitment: "finalized" }], opts),
    rpc<ClusterNodeRaw[]>(url, "getClusterNodes", [], opts),
    rpc<ConfigAccountRaw[]>(
      url,
      "getProgramAccounts",
      [CONFIG_PROGRAM, { encoding: "jsonParsed", commitment: "finalized" }],
      opts,
    ),
  ]);
  return combineValidators(cluster, votes, nodes, parseValidatorInfo(configs));
}
