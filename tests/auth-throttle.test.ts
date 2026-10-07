import { afterEach, describe, expect, it, vi } from "vitest";
import { authGate, warnIfSecretsShared } from "@/lib/auth-throttle";
import { createRateLimiter } from "@/lib/rate-limit";

const req = (ip: string, auth = "Bearer wrong") =>
  new Request("http://x/api/admin/seed", { method: "POST", headers: { "x-forwarded-for": ip, authorization: auth } });
const check = (h: string | null) => h === "Bearer right";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("authGate", () => {
  it("passes a correct secret", () => {
    expect(authGate(req("30.0.0.1", "Bearer right"), check)).toBeNull();
  });

  it("answers 401 for failures, then 429 for wrong secrets after 10 in a minute; a correct secret still passes (L2)", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    for (let i = 0; i < 10; i++) expect((authGate(req("30.0.0.2"), check))!.status).toBe(401);
    expect(authGate(req("30.0.0.2"), check)!.status).toBe(429);
    expect(authGate(req("30.0.0.2", "Bearer right"), check)).toBeNull();
    // Other clients are unaffected.
    expect(authGate(req("30.0.0.3", "Bearer right"), check)).toBeNull();
  });

  it("does not count successful requests against the limit", () => {
    for (let i = 0; i < 30; i++) expect(authGate(req("30.0.0.4", "Bearer right"), check)).toBeNull();
  });
});

describe("warnIfSecretsShared", () => {
  it("warns by name only, and only once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = "s".repeat(32);
    expect(warnIfSecretsShared({ ADMIN_SECRET: secret, CRON_SECRET: secret })).toBe(true);
    warnIfSecretsShared({ ADMIN_SECRET: secret, CRON_SECRET: secret });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
  });
  it("is quiet when they differ or are unset", () => {
    expect(warnIfSecretsShared({ ADMIN_SECRET: "a".repeat(20), CRON_SECRET: "b".repeat(20) })).toBe(false);
    expect(warnIfSecretsShared({})).toBe(false);
  });
});

describe("limiter.exhausted", () => {
  it("peeks without counting", () => {
    let t = 0;
    const allow = createRateLimiter(1, 1000, () => t);
    expect(allow.exhausted("a")).toBe(false);
    allow("a");
    expect(allow.exhausted("a")).toBe(true);
    t = 1001;
    expect(allow.exhausted("a")).toBe(false);
  });
});
