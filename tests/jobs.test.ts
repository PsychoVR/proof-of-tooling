import { describe, expect, it, vi } from "vitest";
import { healthFor, parseRepo, runGithub } from "@/jobs/github";
import { runIngest } from "@/jobs/ingest";
import { previousCheckFailed, runReverify, type ActiveClaim } from "@/jobs/reverify";
import type { Validator } from "@/lib/types";

const val = (identity: string): Validator => ({
  identity,
  cluster: "mainnet",
  voteAccount: "v",
  name: null,
  website: null,
  iconUrl: null,
  activatedStake: "1",
  version: null,
  delinquent: false,
  updatedAt: new Date().toISOString(),
});

describe("runIngest", () => {
  it("ingests only the enabled clusters by default (mainnet in phase 1)", async () => {
    const fetchValidators = vi.fn(async () => [val("a")]);
    const report = await runIngest({ fetchValidators, upsert: async () => {} });
    expect(report.map((r) => r.cluster)).toEqual(["mainnet"]);
    expect(fetchValidators).toHaveBeenCalledTimes(1);
  });

  it("saves healthy clusters even if one fails (multi-cluster configuration)", async () => {
    const upsert = vi.fn(async () => {});
    const report = await runIngest({
      fetchValidators: async (c) => {
        if (c === "testnet") throw new Error("rpc down");
        if (c === "alpenglow") return [];
        return [val("a"), val("b")];
      },
      upsert,
      clusters: ["mainnet", "testnet", "alpenglow"],
    });
    const by = Object.fromEntries(report.map((r) => [r.cluster, r]));
    expect(by.mainnet).toMatchObject({ ok: true, count: 2 });
    expect(by.testnet).toMatchObject({ ok: false, error: "rpc down" });
    expect(by.alpenglow.ok).toBe(false); // empty answers are never written
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe("runReverify", () => {
  const t0 = new Date("2026-10-01T00:00:00Z");
  const t1 = new Date("2026-10-02T00:00:00Z");
  const claim = (id: number, last: Date | null): ActiveClaim => ({
    id,
    toolUrl: `https://x.test/${id}`,
    identity: "i",
    verifiedAt: t0,
    lastCheckedAt: last,
  });

  it("detects previous failures from timestamps", () => {
    expect(previousCheckFailed(claim(1, null))).toBe(false);
    expect(previousCheckFailed(claim(1, t0))).toBe(false);
    expect(previousCheckFailed(claim(1, t1))).toBe(true);
  });

  it("marks ok, first failure, second failure and network errors", async () => {
    const markOk = vi.fn(async () => {});
    const markFailed = vi.fn(async () => {});
    const markStale = vi.fn(async () => {});
    const report = await runReverify({
      listActive: async () => [claim(1, null), claim(2, null), claim(3, t1), claim(4, null)],
      check: async (url) => {
        if (url.endsWith("/4")) throw new Error("timeout");
        return { id: "proof", ok: url.endsWith("/1") };
      },
      markOk,
      markFailed,
      markStale,
      concurrency: 2,
    });
    expect(markOk).toHaveBeenCalledWith(1, expect.any(Date));
    expect(markFailed).toHaveBeenCalledWith(2, expect.any(Date));
    expect(markStale).toHaveBeenCalledWith(3, expect.any(Date));
    expect(report).toEqual({ checked: 3, ok: 1, failedOnce: 1, staled: 1, skipped: 1 });
  });
});

describe("github job", () => {
  it("parses repo urls", () => {
    expect(parseRepo("https://github.com/Org/repo")).toEqual({ owner: "Org", repo: "repo" });
    expect(parseRepo("github.com/Org/repo.git/")).toEqual({ owner: "Org", repo: "repo" });
    expect(parseRepo("https://example.com/a/b")).toBeNull();
  });

  it("derives health", () => {
    const now = new Date("2026-10-07T00:00:00Z");
    expect(healthFor(null, now)).toBe("unknown");
    expect(healthFor(new Date("2026-09-20T00:00:00Z"), now)).toBe("active");
    expect(healthFor(new Date("2026-03-01T00:00:00Z"), now)).toBe("slow");
    expect(healthFor(new Date("2020-01-01T00:00:00Z"), now)).toBe("dormant");
  });

  const res = (status: number, body: unknown, remaining = "4000") =>
    new Response(JSON.stringify(body), { status, headers: { "x-ratelimit-remaining": remaining } });

  it("updates repos, tolerates 404 and stops on rate limit", async () => {
    const update = vi.fn(async () => {});
    const responses = [
      res(200, { stargazers_count: 7, fork: true, pushed_at: "2026-10-01T00:00:00Z" }),
      res(404, {}),
      res(403, {}, "0"),
      res(200, {}),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const report = await runGithub({
      listRepoTools: async () => [1, 2, 3, 4].map((id) => ({ id, url: `https://github.com/o/r${id}` })),
      update,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      token: "t",
      now: () => new Date("2026-10-07T00:00:00Z"),
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ stars: 7, isFork: true, health: "active" }));
    expect(report).toEqual({ updated: 1, notFound: 1, errors: 0, rateLimited: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
