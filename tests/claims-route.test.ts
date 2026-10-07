import { beforeEach, describe, expect, it, vi } from "vitest";

const processClaim = vi.fn();
// A plain function for the failing case: vitest re-throws rejections it tracks from vi.fn() mocks.
let failing: (() => Promise<never>) | null = null;
vi.mock("@/lib/claims-service", async (orig) => ({
  ...(await orig<typeof import("@/lib/claims-service")>()),
  processClaim: (...a: unknown[]) => (failing ? failing() : processClaim(...a)),
}));
vi.mock("@/lib/claims-deps", () => ({ createClaimsDeps: () => ({}) }));

const { handleClaimRequest } = await import("@/lib/claims-route");

const post = (body: unknown, headers: Record<string, string> = {}) =>
  handleClaimRequest(
    new Request("http://x/api/v1/claims", {
      method: "POST",
      headers: { "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    true,
  );

describe("handleClaimRequest", () => {
  beforeEach(() => {
    processClaim.mockReset();
    failing = null;
  });

  it("returns a generic 500 and logs only the message when the pipeline throws (M8)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(new RangeError("offchain message exceeds 1212 bytes"), { sql: "SECRET STACK" });
    failing = async () => {
      throw failure;
    };
    const res = await post({ message: "m", signature: "s" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET STACK");
    log.mockRestore();
  });

  it("rejects oversized bodies by content-length before reading them", async () => {
    const res = await post({ message: "m", signature: "s" }, { "content-length": "5000" });
    expect(res.status).toBe(413);
    expect(processClaim).not.toHaveBeenCalled();
  });

  it("validates the body: size, category and tool name", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ message: "m".repeat(1301), signature: "s" })).status).toBe(400);
    expect((await post({ message: "m", signature: "s", category: "Nope" })).status).toBe(400);
    expect(processClaim).not.toHaveBeenCalled();
  });

  it("sanitizes the tool name before it reaches the service (bidi, zero-width, length)", async () => {
    processClaim.mockResolvedValue({ ok: true, checks: [] });
    await post({ message: "m", signature: "s", toolName: `Evil‮tool​${"x".repeat(200)}`, category: "Meta" });
    const sent = processClaim.mock.calls[0][0] as { toolName: string; category: string };
    expect(sent.category).toBe("Meta");
    expect(sent.toolName).not.toMatch(/[‮​]/);
    expect(Array.from(sent.toolName).length).toBeLessThanOrEqual(80);
  });

  it("a dry run reports failed steps with 200, a real registration failure is 422", async () => {
    processClaim.mockResolvedValue({ ok: false, checks: [{ id: "date", ok: false }] });
    const dry = await handleClaimRequest(new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "9.9.9.1" }, body: JSON.stringify({ message: "m", signature: "s" }) }), false);
    expect(dry.status).toBe(200);
    expect((await post({ message: "m", signature: "s" })).status).toBe(422);
  });
});
