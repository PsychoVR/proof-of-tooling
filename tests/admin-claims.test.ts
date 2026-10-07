import { beforeEach, describe, expect, it, vi } from "vitest";

const where = vi.fn();
const set = vi.fn(() => ({ where }));
vi.mock("@/db", () => ({ getDb: () => ({ update: () => ({ set }) }) }));

const { POST: approve } = await import("@/app/api/admin/claims/[id]/approve/route");
const { POST: reject } = await import("@/app/api/admin/claims/[id]/reject/route");

const ADMIN = "a".repeat(32);
const CRON = "c".repeat(32);
const call = (route: typeof approve, id: string, auth?: string) =>
  route(new Request("http://localhost/x", { method: "POST", headers: auth ? { authorization: auth } : {} }), {
    params: Promise.resolve({ id }),
  });

describe("admin claim moderation", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON;
    process.env.ADMIN_SECRET = ADMIN;
    process.env.DATABASE_URL = "mysql://u:p@localhost:3306/db";
    where.mockReset();
    set.mockClear();
  });

  it("rejects missing, wrong and cron tokens without touching the db", async () => {
    for (const auth of [undefined, "Bearer nope", `Bearer ${CRON}`, ADMIN]) {
      expect((await call(approve, "1", auth)).status).toBe(401);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("is disabled when ADMIN_SECRET is not configured", async () => {
    delete process.env.ADMIN_SECRET;
    // env is cached after first parse, so exercise the helper directly with a fresh module graph
    vi.resetModules();
    const { adminAuthorized } = await import("@/lib/admin-auth");
    expect(adminAuthorized(`Bearer ${ADMIN}`)).toBe(false);
  });

  it("validates the id", async () => {
    expect((await call(approve, "abc", `Bearer ${ADMIN}`)).status).toBe(400);
    expect((await call(approve, "1; DROP", `Bearer ${ADMIN}`)).status).toBe(400);
  });

  it("approves a pending claim", async () => {
    where.mockResolvedValue([{ affectedRows: 1 }]);
    const res = await call(approve, "7", `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 7, status: "active" });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
  });

  it("rejects a pending claim and returns 404 when it is not pending", async () => {
    where.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const ok = await call(reject, "7", `Bearer ${ADMIN}`);
    expect(await ok.json()).toEqual({ ok: true, id: 7, status: "rejected" });
    where.mockResolvedValueOnce([{ affectedRows: 0 }]);
    expect((await call(reject, "8", `Bearer ${ADMIN}`)).status).toBe(404);
  });

  it("returns a generic 500 when the db fails", async () => {
    where.mockRejectedValue(new Error("secret detail"));
    const res = await call(approve, "7", `Bearer ${ADMIN}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});
