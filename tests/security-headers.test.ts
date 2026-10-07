import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { buildCsp, STATIC_SECURITY_HEADERS } from "@/lib/security-headers";

const csp = buildCsp("abc123");
const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `));

describe("buildCsp", () => {
  it("locks down framing, base, forms and plugins", () => {
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
    expect(directive("form-action")).toBe("form-action 'self'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("img-src")).toBe("img-src 'self' data:");
    expect(directive("connect-src")).toBe("connect-src 'self' https://api.github.com");
  });
  it("uses the nonce for scripts and styles with no inline or eval allowance in production", () => {
    expect(directive("script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(directive("style-src")).toBe("style-src 'self' 'nonce-abc123'");
    expect(csp).not.toContain("unsafe-eval");
  });
  it("allows eval only in development", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
  });
  it("needs no external font or style origins", () => {
    expect(csp).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });
});

describe("static headers", () => {
  const h = Object.fromEntries(STATIC_SECURITY_HEADERS.map((x) => [x.key, x.value]));
  it("has the baseline set", () => {
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Strict-Transport-Security"]).toBe("max-age=31536000");
    expect(h["Permissions-Policy"]).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
  });
  it("is applied to every route and the powered-by header is off", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }]);
  });
});
