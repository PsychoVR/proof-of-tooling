import { describe, expect, it } from "vitest";
import { isMonthParam, isTopVisible, monthLabel, monthOf, monthStart, previousMonth, rankBuilders, shareRankUrl, TOP_MIN_VALIDATORS } from "@/lib/top";

const row = (identity: string, toolCount: number, day: number) => ({ identity, toolCount, firstClaimAt: new Date(Date.UTC(2026, 9, day)) });

describe("rankBuilders", () => {
  it("orders by tool count, then by the earliest first claim, then by identity", () => {
    const ranked = rankBuilders([row("c", 2, 5), row("a", 3, 9), row("b", 2, 1), row("e", 1, 3), row("d", 1, 3)]);
    expect(ranked.map((r) => [r.rank, r.identity])).toEqual([[1, "a"], [2, "b"], [3, "c"], [4, "d"], [5, "e"]]);
  });

  it("keeps ten entries and does not change its input", () => {
    const input = Array.from({ length: 14 }, (_, i) => row(`v${String(i).padStart(2, "0")}`, 14 - i, 1));
    const copy = [...input];
    const ranked = rankBuilders(input);
    expect(ranked).toHaveLength(10);
    expect(ranked[9].rank).toBe(10);
    expect(input).toEqual(copy);
  });
});

describe("visibility", () => {
  it("needs at least 5 validators with active claims", () => {
    expect(TOP_MIN_VALIDATORS).toBe(5);
    expect(isTopVisible(4)).toBe(false);
    expect(isTopVisible(5)).toBe(true);
  });
});

describe("shareRankUrl", () => {
  it("prefills a post with the handle, the rank and the profile link", () => {
    const url = new URL(shareRankUrl({ rank: 3, identity: "Abc123", toolCount: 7 }));
    expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
    expect(url.searchParams.get("text")).toContain("@proofoftooling");
    expect(url.searchParams.get("text")).toContain("#3");
    expect(url.searchParams.get("text")).toContain("7 tools");
    expect(url.searchParams.get("url")).toBe("https://tooling.sunshinevr.io/v/Abc123");
  });

  it("uses the singular and names the month of a snapshot", () => {
    const text = new URL(shareRankUrl({ rank: 1, identity: "X", toolCount: 1 }, "October 2026")).searchParams.get("text");
    expect(text).toContain("1 tool.");
    expect(text).toContain("October 2026");
  });
});

describe("months", () => {
  it("validates the month parameter", () => {
    for (const ok of ["2026-10", "2027-01", "2026-12"]) expect(isMonthParam(ok)).toBe(true);
    for (const bad of ["2026-13", "2026-00", "26-10", "2026-1", "2026-10-01", "../etc", ""]) expect(isMonthParam(bad)).toBe(false);
  });

  it("computes the month, its start and the previous month in UTC", () => {
    const d = new Date("2027-01-01T00:30:00Z");
    expect(monthOf(d)).toBe("2027-01");
    expect(monthStart(d).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(previousMonth(d)).toBe("2026-12");
    expect(previousMonth(new Date("2026-11-01T12:00:00Z"))).toBe("2026-10");
  });

  it("labels a month in English", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthLabel("nope")).toBe("nope");
  });
});
