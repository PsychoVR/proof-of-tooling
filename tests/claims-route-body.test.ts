import { describe, expect, it, vi } from "vitest";

const processClaim = vi.fn();
vi.mock("@/lib/claims-service", async (orig) => ({
  ...(await orig<typeof import("@/lib/claims-service")>()),
  processClaim: (...a: unknown[]) => processClaim(...a),
}));
vi.mock("@/lib/claims-deps", () => ({ createClaimsDeps: () => ({}) }));

const { handleClaimRequest } = await import("@/lib/claims-route");

/** A chunked request body: no Content-Length, delivered in pieces. */
function chunked(pieces: string[], ip: string) {
  const enc = new TextEncoder();
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled < pieces.length) controller.enqueue(enc.encode(pieces[pulled++]));
      else controller.close();
    },
  });
  const req = new Request("http://x/api/v1/claims", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body,
    // @ts-expect-error Node's fetch requires duplex for stream bodies
    duplex: "half",
  });
  return { req, pulled: () => pulled };
}

describe("handleClaimRequest body cap (N8)", () => {
  it("answers 413 for a chunked body that grows past 4096 bytes, and stops reading", async () => {
    const { req, pulled } = chunked(Array.from({ length: 50 }, () => "a".repeat(1000)), "60.0.0.1");
    expect(req.headers.get("content-length")).toBeNull();
    const res = await handleClaimRequest(req, true);
    expect(res.status).toBe(413);
    expect(processClaim).not.toHaveBeenCalled();
    expect(pulled()).toBeLessThan(50);
  });

  it("still accepts a small chunked body", async () => {
    processClaim.mockResolvedValue({ ok: true, checks: [] });
    const json = JSON.stringify({ message: "m", signature: "s" });
    const { req } = chunked([json.slice(0, 10), json.slice(10)], "60.0.0.2");
    const res = await handleClaimRequest(req, true);
    expect(res.status).toBe(200);
  });

  it("treats an empty body as invalid json", async () => {
    const res = await handleClaimRequest(new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "60.0.0.3" } }), true);
    expect(res.status).toBe(400);
  });
});
