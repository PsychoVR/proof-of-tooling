import { describe, expect, it, vi } from "vitest";
import { runCron } from "@/lib/cron-handler";

vi.mock("@/lib/cron-auth", () => ({ cronAuthorized: () => true }));

describe("error logging (B10)", () => {
  it("logs only the message of a failing cron job, never the error object", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("db down"), { sql: "SELECT secret", params: ["hunter2"] });
    const res = await runCron(new Request("http://x/api/cron/ping", { method: "POST", headers: { "x-forwarded-for": "50.0.0.1" } }), async () => {
      throw err;
    });
    expect(res.status).toBe(500);
    expect(log.mock.calls[0]).toEqual(["cron job failed:", "db down"]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("hunter2");
    log.mockRestore();
  });

  it("logs a fixed text for non-Error throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await runCron(new Request("http://x", { method: "POST" }), async () => {
      throw { password: "hunter2" };
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("hunter2");
    log.mockRestore();
  });
});
