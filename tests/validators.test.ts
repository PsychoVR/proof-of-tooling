import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  fetchValidators,
  parseValidatorInfo,
  sanitizeText,
  sanitizeUrl,
  type ConfigAccountRaw,
} from "@/lib/solana/validators";

const fx = JSON.parse(readFileSync("tests/fixtures/rpc-mainnet.json", "utf8"));

function mockFetch() {
  const calls: string[] = [];
  const impl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const { method } = JSON.parse(String(init?.body));
    calls.push(method);
    const body =
      method === "getVoteAccounts"
        ? fx.getVoteAccountsRaw
        : JSON.stringify({ jsonrpc: "2.0", id: 1, result: method === "getClusterNodes" ? fx.clusterNodes : fx.configAccounts });
    return new Response(body, { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("parseValidatorInfo", () => {
  const info = parseValidatorInfo(fx.configAccounts as ConfigAccountRaw[]);

  it("sanitizes name and keeps safe urls", () => {
    const a = info.get("IdentAAAA11111111111111111111111111111111111");
    expect(a).toEqual({
      name: "Alpha Pool",
      website: "https://alpha.example.com/",
      iconUrl: "https://alpha.example.com/logo.png",
    });
  });

  it("drops javascript: and non-https icon urls", () => {
    expect(info.get("IdentBBBB11111111111111111111111111111111111")).toEqual({
      name: "Bravo",
      website: null,
      iconUrl: null,
    });
  });

  it("ignores info whose identity did not sign, stake config and binary accounts", () => {
    expect(info.has("IdentCCCC11111111111111111111111111111111111")).toBe(false);
    expect(info.size).toBe(2);
  });
});

describe("sanitizers", () => {
  it("handles non-strings, empties and long text", () => {
    expect(sanitizeText(5)).toBeNull();
    expect(sanitizeText("   ")).toBeNull();
    expect(Array.from(sanitizeText("x".repeat(400))!).length).toBe(255);
  });
  it("rejects bad urls", () => {
    expect(sanitizeUrl("not a url")).toBeNull();
    expect(sanitizeUrl("https://user:pw@evil.example.com")).toBeNull();
    expect(sanitizeUrl("https://localhost")).toBeNull();
    expect(sanitizeUrl("https://a.example.com/" + "a".repeat(600))).toBeNull();
    expect(sanitizeUrl(null)).toBeNull();
  });
});

describe("fetchValidators", () => {
  it("combines the three RPC calls without network", async () => {
    const { impl, calls } = mockFetch();
    const rows = await fetchValidators("mainnet", { rpcUrl: "http://rpc.test", fetchImpl: impl });
    expect(calls.sort()).toEqual(["getClusterNodes", "getProgramAccounts", "getVoteAccounts"]);
    expect(rows).toHaveLength(3);
    const byId = Object.fromEntries(rows.map((r) => [r.identity.slice(0, 9), r]));
    // stake above 2^53 keeps full precision
    expect(byId.IdentAAAA.activatedStake).toBe("9007199254740993");
    expect(byId.IdentAAAA.version).toBe("3.0.4");
    expect(byId.IdentAAAA.delinquent).toBe(false);
    // two vote accounts for one identity: the larger wins
    expect(byId.IdentBBBB.voteAccount.startsWith("VoteB22222")).toBe(true);
    expect(byId.IdentBBBB.activatedStake).toBe("900000000000");
    expect(byId.IdentCCCC.delinquent).toBe(true);
    expect(byId.IdentCCCC.name).toBeNull();
    expect(byId.IdentCCCC.version).toBe("2.3.1");
  });

  it("fails on RPC errors", async () => {
    const impl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 200 }));
    await expect(
      fetchValidators("testnet", { rpcUrl: "http://rpc.test", fetchImpl: impl as unknown as typeof fetch }),
    ).rejects.toThrow(/boom/);
    const bad = vi.fn(async () => new Response("no", { status: 503 }));
    await expect(
      fetchValidators("testnet", { rpcUrl: "http://rpc.test", fetchImpl: bad as unknown as typeof fetch }),
    ).rejects.toThrow(/503/);
  });
});
