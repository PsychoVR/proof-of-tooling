import { afterEach, describe, expect, it, vi } from "vitest";
import { enforceIpLimits, logWouldBlock } from "@/lib/ip-limit-mode";
import { authGate } from "@/lib/auth-throttle";
import { GET } from "@/app/api/admin/debug/ip/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("enforceIpLimits", () => {
  it("is off until the header or the hop count is configured", () => {
    expect(enforceIpLimits({})).toBe(false);
    expect(enforceIpLimits({ TRUSTED_IP_HEADER: "  " })).toBe(false);
    expect(enforceIpLimits({ TRUSTED_IP_HEADER: "x-real-ip" })).toBe(true);
    expect(enforceIpLimits({ TRUSTED_PROXY_HOPS: "2" })).toBe(true);
  });
});

describe("logWouldBlock", () => {
  it("logs once a minute per scope, without values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(logWouldBlock("scope-a", 1_000)).toBe(true);
    expect(logWouldBlock("scope-a", 2_000)).toBe(false);
    expect(logWouldBlock("scope-b", 2_000)).toBe(true);
    expect(logWouldBlock("scope-a", 62_000)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe("authGate in log-only mode", () => {
  const wrong = (ip: string) =>
    new Request("http://x/api/admin/seed", { method: "POST", headers: { "x-forwarded-for": ip, authorization: "Bearer wrong" } });
  it("keeps answering 401, never 429, while no trusted header is set", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 15; i++) expect(authGate(wrong("40.0.0.1"), () => false)!.status).toBe(401);
  });
  it("answers 429 once a trusted header is set", () => {
    vi.stubEnv("TRUSTED_IP_HEADER", "x-real-ip");
    const r = () =>
      new Request("http://x/api/admin/seed", { method: "POST", headers: { "x-real-ip": "40.0.0.2", authorization: "Bearer wrong" } });
    for (let i = 0; i < 10; i++) expect(authGate(r(), () => false)!.status).toBe(401);
    expect(authGate(r(), () => false)!.status).toBe(429);
  });
});

describe("GET /api/admin/debug/ip", () => {
  const secret = "d".repeat(24);
  it("rejects anonymous callers", async () => {
    vi.stubEnv("ADMIN_SECRET", secret);
    expect(GET(new Request("http://x/api/admin/debug/ip", { headers: { "x-forwarded-for": "40.0.0.3" } })).status).toBe(401);
  });
  it("echoes the address headers for the admin and nothing else", async () => {
    vi.stubEnv("ADMIN_SECRET", secret);
    const res = GET(
      new Request("http://x/api/admin/debug/ip", {
        headers: { authorization: `Bearer ${secret}`, "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "1.2.3.4" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "1.2.3.4", forwarded: null, "cf-connecting-ip": null, "x-client-ip": null },
      socketIp: null,
      limitsEnforced: false,
    });
  });
});
