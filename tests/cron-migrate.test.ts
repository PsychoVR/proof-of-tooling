import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const migrate = vi.fn();
const execute = vi.fn();

vi.mock("drizzle-orm/mysql2/migrator", () => ({ migrate }));
vi.mock("@/db", () => ({ getDb: () => ({ execute }) }));

const { POST } = await import("@/app/api/cron/migrate/route");

const journal: { entries: { tag: string; when: number }[] } = JSON.parse(
  readFileSync("drizzle/meta/_journal.json", "utf8"),
);
const allRows = journal.entries.map((e) => ({ created_at: String(e.when) }));
const tags = journal.entries.map((e) => e.tag);

const SECRET = "x".repeat(32);
const req = (auth?: string) =>
  new Request("http://localhost/api/cron/migrate", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });

describe("POST /api/cron/migrate", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    process.env.DATABASE_URL = "mysql://u:p@localhost:3306/db";
    migrate.mockReset();
    execute.mockReset();
  });

  it("rejects missing or wrong token without touching the db", async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer nope"))).status).toBe(401);
    expect(migrate).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports migrations applied by this run", async () => {
    execute.mockRejectedValueOnce(new Error("no table")).mockResolvedValueOnce([allRows]);
    migrate.mockResolvedValue(undefined);
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, applied: tags, total: tags.length });
  });

  it("reports nothing when already up to date", async () => {
    execute.mockResolvedValue([allRows]);
    const body = await (await POST(req(`Bearer ${SECRET}`))).json();
    expect(body.applied).toEqual([]);
  });

  it("returns 500 when the migrator fails", async () => {
    execute.mockResolvedValue([[]]);
    migrate.mockRejectedValue(new Error("boom"));
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "migration failed" });
  });
});
