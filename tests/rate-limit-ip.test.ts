import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/client-ip";
import { loadProxyConfig } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";

const h = (o: Record<string, string>) => new Headers(o);

describe("getClientIp", () => {
  it("ignores the client-controlled first X-Forwarded-For value (1 hop = rightmost)", () => {
    expect(getClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), { hops: 1 })).toBe("203.0.113.9");
  });
  it("counts hops from the right", () => {
    const headers = h({ "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.1" });
    expect(getClientIp(headers, { hops: 2 })).toBe("1.2.3.4");
    expect(getClientIp(headers, { hops: 3 })).toBe("6.6.6.6");
  });
  it("prefers the trusted header when it holds a valid IP, else falls back", () => {
    const cfg = { header: "x-real-ip", hops: 1 };
    expect(getClientIp(h({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }), cfg)).toBe("1.1.1.1");
    expect(getClientIp(h({ "x-real-ip": "2001:db8::1" }), cfg)).toBe("2001:db8::1");
    expect(getClientIp(h({ "x-real-ip": "garbage", "x-forwarded-for": "2.2.2.2" }), cfg)).toBe("2.2.2.2");
  });
  it("returns null without a usable header, with too few entries or with an invalid IP", () => {
    expect(getClientIp(h({}), { hops: 1 })).toBeNull();
    expect(getClientIp(h({ "x-forwarded-for": "1.2.3.4" }), { hops: 2 })).toBeNull();
    expect(getClientIp(h({ "x-forwarded-for": "1.2.3.4, nope" }), { hops: 1 })).toBeNull();
  });
});

describe("loadProxyConfig", () => {
  it("defaults to one hop and no header", () => {
    expect(loadProxyConfig({})).toEqual({ header: undefined, hops: 1 });
  });
  it("reads valid values (header lower-cased)", () => {
    expect(loadProxyConfig({ TRUSTED_IP_HEADER: "X-Real-IP", TRUSTED_PROXY_HOPS: "2" })).toEqual({ header: "x-real-ip", hops: 2 });
  });
  it("ignores invalid values", () => {
    expect(loadProxyConfig({ TRUSTED_IP_HEADER: "bad header!", TRUSTED_PROXY_HOPS: "0" })).toEqual({ header: undefined, hops: 1 });
    expect(loadProxyConfig({ TRUSTED_PROXY_HOPS: "abc" }).hops).toBe(1);
  });
});

describe("createRateLimiter memory bounds", () => {
  it("prunes expired keys on an interval, not only at a key count", () => {
    let t = 0;
    const allow = createRateLimiter(1, 1000, () => t, 1_000_000);
    for (let i = 0; i < 50; i++) allow(`k${i}`);
    t = 1500;
    allow("fresh"); // triggers the prune
    t = 1600;
    // The old keys were forgotten: they are allowed again, and nothing but recent keys is tracked.
    expect(allow("k0")).toBe(true);
  });

  it("caps the number of keys, evicting the least recently used first", () => {
    const t = 0;
    const allow = createRateLimiter(1, 60_000, () => t, 3);
    allow("a");
    allow("b");
    allow("c");
    allow("d"); // evicts a
    expect(allow("a")).toBe(true); // forgotten, so allowed again (and evicts b)
    expect(allow("d")).toBe(false); // still tracked and over the limit
    expect(allow("c")).toBe(false);
  });

  it("keeps enforcing the limit inside the window", () => {
    let t = 0;
    const allow = createRateLimiter(2, 1000, () => t);
    expect([allow("a"), allow("a"), allow("a")]).toEqual([true, true, false]);
    t = 999;
    expect(allow("a")).toBe(false);
    t = 1001;
    expect(allow("a")).toBe(true);
  });
});
