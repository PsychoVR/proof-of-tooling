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
  const claims = [{ toolId: 1, identity: "A", cluster: "mainnet" as const }, { toolId: 2, identity: "C", cluster: "mainnet" as const }];
  const seeds = [
    { toolId: 3, validatorName: " alpha " },
    { toolId: 1, validatorName: "Alpha" },
  ];

  it("merges claims and name-matched seeds, sorts and omits empty validators", () => {
    const { items, total } = buildLeaderboard(validators, claims, seeds, tools, 1, 10);
    expect(total).toBe(2);
    expect(items.map((r) => r.validator.identity)).toEqual(["A", "C"]);
    expect(items[0]).toMatchObject({ toolCount: 2, claimedCount: 1 });
    expect(items[0].validator.activatedStake).toBe("10");
  });

  it("breaks ties by stake and paginates", () => {
    const rows = buildLeaderboard(validators, [{ toolId: 1, identity: "A", cluster: "mainnet" }, { toolId: 1, identity: "B", cluster: "mainnet" }], [], tools, 1, 1);
    expect(rows.total).toBe(2);
    expect(rows.items[0].validator.identity).toBe("B");
    const p2 = buildLeaderboard(validators, [{ toolId: 1, identity: "A", cluster: "mainnet" }, { toolId: 1, identity: "B", cluster: "mainnet" }], [], tools, 2, 1);
    expect(p2.items[0].validator.identity).toBe("A");
  });
});

describe("seed data", () => {
  it("has unique slugs and urls", () => {
    expect(SEED_TOOLS).toHaveLength(7);
    expect(new Set(SEED_TOOLS.map((s) => s.slug)).size).toBe(7);
    expect(new Set(SEED_TOOLS.map((s) => s.url)).size).toBe(7);
  });
});
