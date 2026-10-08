import { beforeEach, describe, expect, it, vi } from "vitest";

const runPools = vi.fn();
vi.mock("@/jobs/pools", () => ({ runPools }));

const route = await import("@/app/api/cron/pools/route");
const SECRET = "s".repeat(32);

beforeEach(() => {
  runPools.mockReset();
  process.env.CRON_SECRET = SECRET;
  process.env.DATABASE_URL = "mysql://u:p@localhost/db";
});

const post = (auth?: string) => route.POST(new Request("http://x/api/cron/pools", { method: "POST", headers: auth ? { authorization: auth } : {} }));

describe("POST /api/cron/pools", () => {
  it("requires the cron secret, in constant time, and does nothing without it", async () => {
    expect((await post()).status).toBe(401);
    expect((await post("Bearer wrong")).status).toBe(401);
    expect((await post(`Bearer ${SECRET}x`)).status).toBe(401);
    expect(runPools).not.toHaveBeenCalled();
  });

  it("runs the job when authorized, reports its result and hides failures", async () => {
    runPools.mockResolvedValueOnce({ scanned: 2 });
    expect(await (await post(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, result: { scanned: 2 } });
    runPools.mockRejectedValueOnce(new Error("secret detail"));
    const bad = await post(`Bearer ${SECRET}`);
    expect(bad.status).toBe(500);
    expect(await bad.json()).toEqual({ ok: false, error: "job failed" });
  });

  it("has a long time limit for slow scans", () => {
    expect(route.maxDuration).toBe(300);
  });
});
