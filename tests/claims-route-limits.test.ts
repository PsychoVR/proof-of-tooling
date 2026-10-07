import { beforeEach, describe, expect, it, vi } from "vitest";

const processClaim = vi.fn();
vi.mock("@/lib/claims-service", async (orig) => ({
  ...(await orig<typeof import("@/lib/claims-service")>()),
  processClaim: (...a: unknown[]) => processClaim(...a),
}));
vi.mock("@/lib/claims-deps", () => ({ createClaimsDeps: () => ({}) }));

const { handleClaimRequest } = await import("@/lib/claims-route");

const ID = "21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh";
const msg = (id: string) => `proof-of-tooling v1 | claim | example.com | ${id} | 2026-10-07`;
const send = (message: string, ip: string | null, persist = true) =>
  handleClaimRequest(
    new Request("http://x/api/v1/claims", {
      method: "POST",
      headers: ip ? { "x-forwarded-for": ip } : {},
      body: JSON.stringify({ message, signature: "s" }),
    }),
    persist,
  );

describe("handleClaimRequest rate limits (M4)", () => {
  beforeEach(() => {
    processClaim.mockReset();
    processClaim.mockResolvedValue({ ok: true, checks: [] });
  });

  it("limits writes per identity even when the IP rotates, before processClaim runs", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await send(msg(ID), `20.0.0.${i + 1}`)).status);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
    expect(processClaim).toHaveBeenCalledTimes(10);
  });

  it("checks have a higher per-identity limit than writes", async () => {
    const id = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await send(msg(id), `21.0.${Math.floor(i / 10)}.${(i % 10) + 1}`, false)).status);
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
});
