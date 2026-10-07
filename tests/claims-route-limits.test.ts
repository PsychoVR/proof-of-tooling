import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processClaim = vi.fn();
vi.mock("@/lib/claims-service", async (orig) => ({
  ...(await orig<typeof import("@/lib/claims-service")>()),
  processClaim: (...a: unknown[]) => processClaim(...a),
}));
vi.mock("@/lib/claims-deps", () => ({ createClaimsDeps: () => ({}) }));

const { handleClaimRequest } = await import("@/lib/claims-route");

import fixtures from "./fixtures/cli-signatures.json";

const valid = fixtures.cases.find((c) => c.name === "valid-claim")!;
const send = (message: string, ip: string | null, persist = true, signature = "s") =>
  handleClaimRequest(
    new Request("http://x/api/v1/claims", {
      method: "POST",
      headers: ip ? { "x-forwarded-for": ip } : {},
      body: JSON.stringify({ message, signature }),
    }),
    persist,
  );

describe("handleClaimRequest rate limits (M4)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1"); // per-IP limits only block once the proxy is configured
    processClaim.mockReset();
    processClaim.mockResolvedValue({ ok: true, checks: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });


  it("unsigned messages do not spend an identity bucket (M1); a signed flood is limited even when the IP rotates", async () => {
    const other = valid.message.replace("github.com/psychovr/proof-of-tooling", "example.com");
    for (let i = 0; i < 15; i++) {
      expect((await send(other, `23.0.${Math.floor(i / 5)}.${(i % 5) + 1}`, false)).status).toBe(200);
      expect((await send(other, `24.0.${Math.floor(i / 5)}.${(i % 5) + 1}`, true)).status).toBe(200);
    }
    // The identity bucket is untouched: ten signed writes still go through.
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await send(valid.message, `25.0.0.${i + 1}`, true, valid.signature)).status);
    expect(statuses).toEqual(Array(10).fill(200));
    expect(processClaim).toHaveBeenCalledTimes(40);
    expect((await send(valid.message, "25.0.0.99", true, valid.signature)).status).toBe(429);
  });

  it("checks have a higher per-identity limit than writes", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await send(valid.message, `21.0.${Math.floor(i / 10)}.${(i % 10) + 1}`, false, valid.signature)).status);
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
  });
  it("bad messages fall back to the IP limit only", async () => {
    for (let i = 0; i < 20; i++) expect((await send("not a claim", "22.0.0.1")).status).toBe(200);
    expect((await send("not a claim", "22.0.0.1")).status).toBe(429);
  });

  it("requests without a usable client IP share a stricter bucket", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await send("not a claim", null, false)).status);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });
  it("log-only: without a configured proxy the IP limit counts and logs but never answers 429", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 30; i++) expect((await send("not a claim", "26.0.0.1", false)).status).not.toBe(429);
    for (let i = 0; i < 8; i++) expect((await send("not a claim", null, false)).status).not.toBe(429);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
