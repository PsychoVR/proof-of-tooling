import { describe, expect, it } from "vitest";
import { CLUSTER_CONFIG, CLUSTER_SCOPE_LABEL, ENABLED_CLUSTERS, MULTI_CLUSTER, clusterRpcUrl, isEnabledCluster } from "@/lib/clusters";

describe("cluster configuration (phase 1: Solana mainnet only)", () => {
  it("enables mainnet and nothing else", () => {
    expect(ENABLED_CLUSTERS).toEqual(["mainnet"]);
    expect(MULTI_CLUSTER).toBe(false);
    expect(CLUSTER_SCOPE_LABEL).toBe("Solana mainnet");
    expect(isEnabledCluster("mainnet")).toBe(true);
    for (const c of ["testnet", "alpenglow", "devnet", ""]) expect(isEnabledCluster(c)).toBe(false);
  });

  it("resolves the mainnet RPC from HELIUS_RPC_URL, falling back to the public RPC", () => {
    expect(clusterRpcUrl("mainnet", { HELIUS_RPC_URL: "https://rpc.example/key" })).toBe("https://rpc.example/key");
    expect(clusterRpcUrl("mainnet", {})).toBe(CLUSTER_CONFIG.mainnet!.defaultRpc);
    expect(clusterRpcUrl("mainnet", { HELIUS_RPC_URL: "" })).toBe(CLUSTER_CONFIG.mainnet!.defaultRpc);
  });

  it("refuses clusters that are not configured, even if a legacy variable is set", () => {
    expect(() => clusterRpcUrl("testnet", { RPC_TESTNET_URL: "https://x.example" })).toThrow("not enabled");
    expect(() => clusterRpcUrl("alpenglow", {})).toThrow("not enabled");
  });
});
