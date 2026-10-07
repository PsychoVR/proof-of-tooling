import { CLUSTERS, type Cluster } from "@/lib/types";

export interface ClusterConfig {
  /** Display label, e.g. "Mainnet". */
  label: string;
  /** Environment variable holding the RPC URL, if any. */
  rpcEnv?: string;
  /** Public RPC used when the variable is not set. */
  defaultRpc?: string;
}

/**
 * Clusters that are ingested, queried and shown. Phase 1 is Solana mainnet only.
 * To add a cluster: add its entry here (plus its name in CLUSTERS and the database enum if it is
 * new) and set the RPC variable named in `rpcEnv`. Nothing else needs to change.
 */
export const CLUSTER_CONFIG: Partial<Record<Cluster, ClusterConfig>> = {
  mainnet: { label: "Mainnet", rpcEnv: "HELIUS_RPC_URL", defaultRpc: "https://api.mainnet-beta.solana.com" },
};

export const ENABLED_CLUSTERS: readonly Cluster[] = CLUSTERS.filter((c) => CLUSTER_CONFIG[c] !== undefined);

export const isEnabledCluster = (c: string): c is Cluster => (ENABLED_CLUSTERS as readonly string[]).includes(c);

/** True when more than one cluster is enabled, i.e. when cluster filters and tags are worth showing. */
export const MULTI_CLUSTER = ENABLED_CLUSTERS.length > 1;

/** Short product label, e.g. "Solana mainnet". */
export const CLUSTER_SCOPE_LABEL = `Solana ${ENABLED_CLUSTERS.map((c) => (CLUSTER_CONFIG[c]?.label ?? c).toLowerCase()).join(" · ")}`;

export function clusterRpcUrl(cluster: Cluster, env: Record<string, string | undefined> = process.env): string {
  const cfg = CLUSTER_CONFIG[cluster];
  if (!cfg) throw new Error(`Cluster ${cluster} is not enabled`);
  const url = (cfg.rpcEnv ? env[cfg.rpcEnv] : undefined) || cfg.defaultRpc;
  if (!url) throw new Error(`No RPC URL configured for cluster ${cluster}`);
  return url;
}
