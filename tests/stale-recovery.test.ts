import { describe, expect, it, vi } from "vitest";
import { runIcons, type IconDeps } from "@/jobs/icons";
import { runReverify, type ActiveClaim } from "@/jobs/reverify";
import { claimEtag, decideClaim, type AdminClaimsDeps } from "@/lib/admin-claims";
import { shortError } from "@/lib/job-errors";
import { retainedFrom, STALE_RETENTION_DAYS } from "@/lib/retention";

const DAY = 86_400_000;
const NOW = new Date("2026-10-16T12:00:00Z");

describe("stale claim recovery (re-verification)", () => {
  const stale: ActiveClaim = { id: 1, toolUrl: "github.com/o/r", identity: "ID1", failures: 2, status: "stale" };
  const active: ActiveClaim = { id: 2, toolUrl: "github.com/o/s", identity: "ID2", failures: 0, status: "active" };
  const base = { markOk: async () => {}, markFailed: async () => {}, markStale: async () => {}, prune: async () => 0 };

  it("fetches the icon and rescans the pools of a claim that goes back to active", async () => {
    const onRecovered = vi.fn(async () => {});
    const report = await runReverify({ ...base, listActive: async () => [stale, active], check: async () => ({ id: "proof", ok: true }), onRecovered });
    expect(onRecovered).toHaveBeenCalledTimes(1);
    expect(onRecovered).toHaveBeenCalledWith("ID1");
    expect(report).toMatchObject({ ok: 2, recovered: 1 });
  });

  it("does nothing for a stale claim that still fails, and a failing hook does not break the run", async () => {
    const onRecovered = vi.fn(async () => {});
    await runReverify({ ...base, listActive: async () => [stale], check: async () => ({ id: "proof", ok: false }), onRecovered });
    expect(onRecovered).not.toHaveBeenCalled();
    const report = await runReverify({
      ...base,
      listActive: async () => [stale],
      check: async () => ({ id: "proof", ok: true }),
      onRecovered: async () => {
        throw new Error("x");
      },
    });
    expect(report.recovered).toBe(1);
  });
});

describe("manual approval", () => {
  const claim = { id: 7, toolId: 1, toolUrl: "github.com/o/r", identity: "ID7", cluster: "mainnet" as const, message: "m", signature: "s", signedDate: "2026-10-01", status: "pending" as const };
  const mk = (over: Partial<AdminClaimsDeps> = {}): AdminClaimsDeps => ({
    loadClaim: async () => claim as never,
    checkProof: async () => ({ id: "proof", ok: true }),
    apply: async () => true,
    ...over,
  });

  it("starts the icon and pools refresh for the approved validator, not for a rejection", async () => {
    const activated = vi.fn();
    const etag = claimEtag(claim as never);
    expect(await decideClaim(7, "approve", { actor: "a", ifMatch: etag }, mk({ activated }))).toMatchObject({ ok: true, status: "active" });
    expect(activated).toHaveBeenCalledWith("ID7");
    activated.mockClear();
    await decideClaim(7, "reject", { actor: "a", ifMatch: etag }, mk({ activated }));
    expect(activated).not.toHaveBeenCalled();
    await decideClaim(7, "approve", { actor: "a", ifMatch: etag }, mk({ activated, apply: async () => false }));
    expect(activated).not.toHaveBeenCalled();
  });
});

describe("retention of icon and badges", () => {
  it("keeps validators whose claim went stale less than 30 days ago; drops older ones and other statuses", () => {
    expect(STALE_RETENTION_DAYS).toBe(30);
    const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
    const rows = [
      { identity: "A", status: "active", since: ago(400) },
      { identity: "B", status: "stale", since: ago(2) },
      { identity: "C", status: "stale", since: ago(29) },
      { identity: "D", status: "stale", since: ago(31) },
      { identity: "E", status: "withdrawn", since: ago(1) },
      { identity: "F", status: "stale", since: ago(60) },
      { identity: "F", status: "active", since: ago(1) },
    ];
    expect(retainedFrom(rows, NOW).sort()).toEqual(["B", "C"]);
  });

  it("the icon job does not delete the icon of a retained (stale) validator", async () => {
    const remove = vi.fn(async () => 0);
    const d: IconDeps = {
      targets: async () => [{ identity: "ACTIVE", iconUrl: "https://x.test/i.png" }],
      iconUrlOf: async () => null,
      fetchIcon: async () => ({ status: 404, body: Buffer.alloc(0) }),
      save: async () => {},
      remove,
      retained: async () => ["STALE"],
    };
    await runIcons(d);
    expect(remove).toHaveBeenCalledWith({ keep: ["ACTIVE", "STALE"], also: [] });
  });
});

describe("shortError", () => {
  it("keeps the first line, hides urls and long tokens, and caps the length", () => {
    expect(shortError(new Error("Failed query: insert\nparams: a,b"))).toBe("Failed query: insert");
    expect(shortError(new Error("GET https://rpc.test/?api-key=k failed"))).not.toMatch(/rpc\.test|api-key=k/);
    expect(shortError(new Error("x".repeat(500))).length).toBeLessThanOrEqual(140);
    expect(shortError(undefined)).toBe("unknown error");
  });
});
