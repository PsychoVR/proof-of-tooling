import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failureReason } from "@/lib/claim-failures";

const recordFailure = vi.fn(async () => {});
const processClaim = vi.fn();
vi.mock("@/lib/claims-service", async (orig) => ({
  ...(await orig<typeof import("@/lib/claims-service")>()),
  processClaim: (...a: unknown[]) => processClaim(...a),
}));
vi.mock("@/lib/claims-deps", () => ({ createClaimsDeps: () => ({ recordFailure }) }));

const { handleClaimRequest } = await import("@/lib/claims-route");
const { GET } = await import("@/app/api/admin/stats/route");

describe("failureReason", () => {
  it("is null for a pass and for a request waiting for review", () => {
    expect(failureReason({ ok: true, checks: [] })).toBeNull();
    expect(failureReason({ ok: false, inReview: true, checks: [{ id: "rules", ok: true }] })).toBeNull();
  });
  it("names the first failing step", () => {
    expect(failureReason({ ok: false, checks: [{ id: "format", ok: true }, { id: "proof", ok: false }, { id: "repo", ok: false }] })).toBe("proof");
  });
  it("falls back to unknown when no step is marked as failed", () => {
    expect(failureReason({ ok: false, checks: [] })).toBe("unknown");
  });
});

describe("claim route records failures", () => {
  const send = (persist: boolean, ip: string) =>
    handleClaimRequest(
      new Request("http://x/api/v1/claims", {
        method: "POST",
        headers: { "x-forwarded-for": ip },
        body: JSON.stringify({ message: "m", signature: "s" }),
      }),
      persist,
    );

  beforeEach(() => {
    recordFailure.mockClear();
    processClaim.mockReset();
  });

  it("records the failing step with the kind of request", async () => {
    processClaim.mockResolvedValue({ ok: false, checks: [{ id: "proof", ok: false }] });
    await send(false, "61.0.0.1");
    await send(true, "61.0.0.2");
    expect(recordFailure.mock.calls).toEqual([["check", "proof"], ["register", "proof"]]);
  });

  it("records nothing for a pass or a request in review", async () => {
    processClaim.mockResolvedValueOnce({ ok: true, checks: [] });
    processClaim.mockResolvedValueOnce({ ok: false, inReview: true, checks: [] });
    await send(true, "61.0.0.3");
    await send(true, "61.0.0.4");
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("records an internal error and still answers 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    processClaim.mockRejectedValue(new Error("db down"));
    expect((await send(true, "61.0.0.5")).status).toBe(500);
    expect(recordFailure).toHaveBeenCalledWith("register", "error");
  });
});

describe("GET /api/admin/stats", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("rejects anonymous callers and the cron secret", async () => {
    vi.stubEnv("ADMIN_SECRET", "a".repeat(24));
    vi.stubEnv("CRON_SECRET", "c".repeat(24));
    for (const auth of [undefined, `Bearer ${"c".repeat(24)}`, "Bearer nope"]) {
      const res = await GET(new Request("http://x/api/admin/stats", { headers: auth ? { authorization: auth, "x-forwarded-for": "62.0.0.1" } : { "x-forwarded-for": "62.0.0.1" } }));
      expect(res.status).toBe(401);
    }
  });
});
