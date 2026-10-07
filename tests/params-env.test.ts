import { afterEach, describe, expect, it, vi } from "vitest";
import { cronAuthorized } from "@/lib/cron-auth";
import { loadEnv } from "@/lib/env";
import { parseIdentityParam, parseSlugParam } from "@/lib/ui/params";

const KEY = "21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh";

describe("parseIdentityParam (/v/[identity])", () => {
  it("returns the key for a valid, possibly encoded, public key", () => {
    expect(parseIdentityParam(KEY)).toBe(KEY);
    expect(parseIdentityParam(encodeURIComponent(KEY))).toBe(KEY);
  });

  it.each(["é", "%C3%A9", "%E0%A4%A", "%", "..%2f..", "1".repeat(31), "0".repeat(44), `${KEY}x`, "", "<script>"])(
    "returns null and never throws for %s",
    (raw) => expect(parseIdentityParam(raw)).toBeNull(),
  );
});

describe("parseSlugParam (/t/[slug])", () => {
  it("accepts lowercase slugs and rejects everything else without throwing", () => {
    expect(parseSlugParam("watchtower")).toBe("watchtower");
    expect(parseSlugParam("proof-of-tooling-2")).toBe("proof-of-tooling-2");
    for (const raw of ["%E0%A4%A", "Upper", "a b", "", "-x", "é", "a".repeat(129), "../x"]) expect(parseSlugParam(raw)).toBeNull();
  });
});

describe("loadEnv: only DATABASE_URL is fatal", () => {
  const base = { DATABASE_URL: "mysql://u:p@h:3306/d" };
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  afterEach(() => warn.mockClear());

  it("a valid environment is read as is, and whitespace counts as unset", () => {
    expect(loadEnv({ ...base, CRON_SECRET: "c".repeat(32), HELIUS_RPC_URL: " https://rpc.example/x ", GITHUB_TOKEN: " ghp_x " })).toEqual({
      DATABASE_URL: base.DATABASE_URL,
      CRON_SECRET: "c".repeat(32),
      HELIUS_RPC_URL: "https://rpc.example/x",
      GITHUB_TOKEN: "ghp_x",
    });
    expect(loadEnv({ ...base, GITHUB_TOKEN: " ", HELIUS_RPC_URL: "", CRON_SECRET: "  " })).toEqual({ DATABASE_URL: base.DATABASE_URL });
    expect(warn).not.toHaveBeenCalled();
  });

  it("invalid optional values switch the feature off instead of failing the site, and are named, never printed", () => {
    const env = loadEnv({ ...base, HELIUS_RPC_URL: "not a url", CRON_SECRET: "short-secret", GITHUB_TOKEN: "ok" });
    expect(env).toEqual({ DATABASE_URL: base.DATABASE_URL, GITHUB_TOKEN: "ok" });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("HELIUS_RPC_URL");
    expect(logged).toContain("CRON_SECRET");
    expect(logged).not.toContain("short-secret");
    expect(logged).not.toContain("not a url");
  });

  it("a missing or blank DATABASE_URL is the only thing that throws", () => {
    for (const raw of [{}, { DATABASE_URL: "" }, { DATABASE_URL: "   " }]) expect(() => loadEnv(raw)).toThrow();
  });
});

describe("cronAuthorized without a valid CRON_SECRET", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });

  it("authorizes nobody when the secret is missing or too short, and still works with a good one", async () => {
    process.env = { ...saved, DATABASE_URL: "mysql://u:p@h:3306/d" };
    delete process.env.CRON_SECRET;
    vi.resetModules();
    let mod = await import("@/lib/cron-auth");
    expect(mod.cronAuthorized("Bearer ")).toBe(false);
    expect(mod.cronAuthorized("Bearer undefined")).toBe(false);
    expect(mod.cronAuthorized(null)).toBe(false);
    process.env.CRON_SECRET = "short";
    vi.resetModules();
    mod = await import("@/lib/cron-auth");
    expect(mod.cronAuthorized("Bearer short")).toBe(false);
    process.env.CRON_SECRET = "c".repeat(32);
    vi.resetModules();
    mod = await import("@/lib/cron-auth");
    expect(mod.cronAuthorized(`Bearer ${"c".repeat(32)}`)).toBe(true);
    expect(mod.cronAuthorized("Bearer nope")).toBe(false);
    expect(typeof cronAuthorized).toBe("function");
  });
});
