import { beforeEach, describe, expect, it, vi } from "vitest";

const q = {
  getStats: vi.fn(),
  getLeaderboard: vi.fn(),
  getValidatorProfile: vi.fn(),
  getTools: vi.fn(),
  getRegistry: vi.fn(),
};
const ingest = vi.fn();
vi.mock("@/lib/queries", () => q);
vi.mock("@/jobs/ingest", () => ({ runIngest: ingest }));

const stats = await import("@/app/api/v1/stats/route");
const validators = await import("@/app/api/v1/validators/route");
const profile = await import("@/app/api/v1/validators/[identity]/route");
const toolsRoute = await import("@/app/api/v1/tools/route");
const registry = await import("@/app/registry.json/route");
const cronIngest = await import("@/app/api/cron/ingest/route");

const KEY = "H6DuW2" + "1".repeat(38);
const SECRET = "s".repeat(32);

beforeEach(() => {
  Object.values(q).forEach((f) => f.mockReset());
  ingest.mockReset();
  process.env.CRON_SECRET = SECRET;
  process.env.DATABASE_URL = "mysql://u:p@localhost/db";
});

describe("GET api", () => {
  it("stats", async () => {
    q.getStats.mockResolvedValue({ toolsTotal: 1 });
    const res = await stats.GET();
    expect(await res.json()).toEqual({ toolsTotal: 1 });
    expect(res.headers.get("cache-control")).toContain("s-maxage");
  });

  it("returns a generic 500 without leaking internals", async () => {
    q.getStats.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1"));
    const res = await stats.GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
  });

  it("validators validates and forwards query", async () => {
    q.getLeaderboard.mockResolvedValue({ items: [], page: 2, pageSize: 10, total: 0 });
    const ok = await validators.GET(new Request("http://x/api/v1/validators?cluster=mainnet&page=2&pageSize=10"));
    expect(ok.status).toBe(200);
    expect(q.getLeaderboard).toHaveBeenCalledWith({ cluster: "mainnet", page: 2, pageSize: 10 });
    for (const bad of ["cluster=nope", "cluster=testnet", "cluster=alpenglow", "page=0", "pageSize=1000", "page=abc"]) {
      expect((await validators.GET(new Request(`http://x/api/v1/validators?${bad}`))).status).toBe(400);
    }
  });

  it("profile checks identity shape and 404s", async () => {
    const ctx = (identity: string) => ({ params: Promise.resolve({ identity }) });
    expect((await profile.GET(new Request("http://x"), ctx("../etc"))).status).toBe(400);
    q.getValidatorProfile.mockResolvedValue(null);
    expect((await profile.GET(new Request("http://x"), ctx(KEY))).status).toBe(404);
    q.getValidatorProfile.mockResolvedValue({ validator: {} });
    expect((await profile.GET(new Request("http://x"), ctx(KEY))).status).toBe(200);
  });

  it("tools wraps items and validates filters", async () => {
    q.getTools.mockResolvedValue([{ id: 1 }]);
    const res = await toolsRoute.GET(new Request("http://x/api/v1/tools?category=Meta&status=claimed"));
    expect(await res.json()).toEqual({ items: [{ id: 1 }] });
    expect(q.getTools).toHaveBeenCalledWith({ category: "Meta", status: "claimed" });
    expect((await toolsRoute.GET(new Request("http://x/api/v1/tools?status=x"))).status).toBe(400);
  });

  it("registry", async () => {
    q.getRegistry.mockResolvedValue({ generatedAt: "t", entries: [] });
    expect((await registry.GET()).status).toBe(200);
  });
});

describe("POST /api/cron/ingest", () => {
  const post = (auth?: string) =>
    cronIngest.POST(new Request("http://x/api/cron/ingest", { method: "POST", headers: auth ? { authorization: auth } : {} }));

  it("requires the bearer secret", async () => {
    expect((await post()).status).toBe(401);
    expect((await post("Bearer wrong")).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("runs the job when authorized and hides failures", async () => {
    ingest.mockResolvedValueOnce([{ cluster: "mainnet", ok: true }]);
    const res = await post(`Bearer ${SECRET}`);
    expect(await res.json()).toEqual({ ok: true, result: [{ cluster: "mainnet", ok: true }] });
    ingest.mockRejectedValueOnce(new Error("secret detail"));
    const bad = await post(`Bearer ${SECRET}`);
    expect(bad.status).toBe(500);
    expect(await bad.json()).toEqual({ ok: false, error: "job failed" });
  });
});
