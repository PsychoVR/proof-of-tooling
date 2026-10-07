import { describe, expect, it } from "vitest";
import {
  buildLeaderboard,
  buildStats,
  buildToolsWithClaims,
  type ClaimRow,
  type ToolRow,
  type ValidatorRow,
} from "@/lib/query-mappers";
import { SEED_TOOLS } from "@/db/seed-data";
import { normalizeToolUrl } from "@/lib/claims/message";

const D = new Date("2026-10-07T00:00:00Z");
const tool = (id: number, category: ToolRow["category"] = "Explorer"): ToolRow => ({
  id,
  slug: `t${id}`,
  url: `https://t${id}.example.com`,
  name: `Tool ${id}`,
  category,
  kind: "web",
  isFork: false,
  stars: null,
  lastCommitAt: null,
  health: "unknown",
  createdAt: D,
});
const vrow = (identity: string, name: string | null, stake: bigint): ValidatorRow => ({
  id: 1,
  identity,
  cluster: "mainnet",
  voteAccount: "v",
  name,
  website: null,
  iconUrl: null,
  activatedStake: stake,
  version: null,
  delinquent: false,
  updatedAt: D,
});
const crow = (id: number, toolId: number, identity: string, status: ClaimRow["status"] = "active"): ClaimRow => ({
  id,
  toolId,
  identity,
  failures: 0,
  cluster: "mainnet",
  message: "m",
  signature: "s",
  signedDate: "2026-10-06",
  status,
  verifiedAt: D,
  lastCheckedAt: null,
});

describe("buildToolsWithClaims", () => {
  it("marks claimed/unclaimed and hides withdrawn claims", () => {
    const out = buildToolsWithClaims(
      [tool(1), tool(2), tool(3)],
      [crow(1, 1, "A"), crow(2, 2, "A", "stale"), crow(3, 3, "A", "withdrawn")],
      [{ identity: "A", cluster: "mainnet", name: "Alpha" }],
    );
    expect(out.map((t) => t.status)).toEqual(["claimed", "unclaimed", "unclaimed"]);
    expect(out[0].owner).toEqual({ name: "Alpha", identity: "A" });
    expect(out[1].owner).toEqual({ name: "Alpha", identity: "A" });
    expect(out[2].owner).toBeNull();
    expect(out[0].claimedBy).toEqual([{ identity: "A", cluster: "mainnet", name: "Alpha" }]);
    expect(out[1].claims).toHaveLength(1);
    expect(out[2].claims).toHaveLength(0);
  });
});

describe("buildStats", () => {
  it("counts totals and zero-fills categories", () => {
    const s = buildStats([{ id: 1, category: "Meta" }, { id: 2, category: "Meta" }], [{ toolId: 1, identity: "A" }], 10, null, D);
    expect(s).toMatchObject({ toolsTotal: 2, toolsClaimed: 1, toolsUnclaimed: 1, validatorsWithTools: 1, validatorsTotal: 10 });
    expect(s.byCategory.Meta).toBe(2);
    expect(s.byCategory.Library).toBe(0);
    expect(s.updatedAt).toBe(D.toISOString());
  });
});

describe("buildLeaderboard", () => {
  const tools = [tool(1), tool(2), tool(3)];
  const validators = [vrow("A", "Alpha", 10n), vrow("B", "Beta", 99n), vrow("C", "Gamma", 5n), vrow("D", null, 1n)];
  const live = (toolId: number, identity: string, status: "active" | "stale" | "pending") => ({ toolId, identity, cluster: "mainnet" as const, status });

  it("ranks validators by signed tools only; stale claims are listed but do not count", () => {
    const claims = [live(1, "A", "active"), live(3, "A", "stale"), live(2, "C", "stale")];
    const { items, total } = buildLeaderboard(validators, claims, tools, 1, 10);
    expect(total).toBe(1); // C has only a stale claim: not ranked
    expect(items[0].validator.identity).toBe("A");
    expect(items[0]).toMatchObject({ toolCount: 1, claimedCount: 1 });
    expect(items[0].tools.map((t) => [t.id, t.status])).toEqual([[1, "signed"], [3, "stale"]]);
    expect(items[0].validator.activatedStake).toBe("10");
  });

  it("never attributes anything to a validator without its own claim (seed names are untrusted)", () => {
    // a validator named like another one, with no claim of its own, gets nothing
    const { items } = buildLeaderboard([vrow("X", "Alpha", 1n), vrow("A", "Alpha", 10n)], [live(1, "A", "active")], tools, 1, 10);
    expect(items.map((r) => r.validator.identity)).toEqual(["A"]);
  });

  it("ignores pending claims and unknown tools", () => {
    expect(buildLeaderboard(validators, [live(1, "A", "pending"), live(99, "B", "active")], tools, 1, 10).total).toBe(0);
  });

  it("breaks ties by stake and paginates", () => {
    const claims = [live(1, "A", "active"), live(1, "B", "active")];
    const rows = buildLeaderboard(validators, claims, tools, 1, 1);
    expect(rows.total).toBe(2);
    expect(rows.items[0].validator.identity).toBe("B");
    expect(buildLeaderboard(validators, claims, tools, 2, 1).items[0].validator.identity).toBe("A");
  });
});

describe("seed data", () => {
  it("has unique slugs and urls", () => {
    expect(SEED_TOOLS).toHaveLength(7);
    expect(new Set(SEED_TOOLS.map((s) => s.slug)).size).toBe(7);
    expect(new Set(SEED_TOOLS.map((s) => s.url)).size).toBe(7);
  });
});

describe("canonical tool urls", () => {
  it("seed tool urls are stored scheme-less and without www", () => {
    for (const s of SEED_TOOLS) {
      expect(s.url).toBe(normalizeToolUrl(s.url));
      expect(s.url).not.toMatch(/^https?:\/\/|^www\./);
    }
  });
});
