import { describe, expect, it } from "vitest";
import { createGuardedLookup, isPrivateIp, safeFetcher } from "@/lib/safe-fetch";

const lookupWith = (addrs: { address: string; family: number }[]) =>
  createGuardedLookup((_h, _o, cb) => cb(null, addrs));

const run = (lookup: ReturnType<typeof createGuardedLookup>, opts: { all?: boolean }) =>
  new Promise<{ err: Error | null; a?: unknown; f?: unknown }>((resolve) =>
    lookup("example.com", opts as never, ((err: Error | null, a?: unknown, f?: unknown) => resolve({ err, a, f })) as never),
  );

describe("isPrivateIp", () => {
  it.each(["10.0.0.1", "127.0.0.1", "0.0.0.0", "169.254.169.254", "172.16.5.5", "192.168.1.1", "100.64.0.1", "198.18.0.1", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "febf::1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "not-an-ip"])(
    "blocks %s",
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "140.82.112.3", "172.32.0.1", "2606:4700:4700::1111"])("allows %s", (ip) =>
    expect(isPrivateIp(ip)).toBe(false),
  );
});

describe("guarded lookup (checked at connect time)", () => {
  it("returns a public address in single and all modes", async () => {
    const l = lookupWith([{ address: "8.8.8.8", family: 4 }]);
    expect(await run(l, {})).toMatchObject({ err: null, a: "8.8.8.8", f: 4 });
    expect(await run(l, { all: true })).toMatchObject({ err: null, a: [{ address: "8.8.8.8", family: 4 }] });
  });

  it("blocks a private address, and any mix containing one", async () => {
    expect((await run(lookupWith([{ address: "10.0.0.1", family: 4 }]), {})).err?.message).toBe("blocked address");
    const mixed = lookupWith([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    expect((await run(mixed, { all: true })).err?.message).toBe("blocked address");
  });

  it("re-validates on every connection: a DNS answer that flips to a private IP is blocked", async () => {
    const answers = [[{ address: "8.8.8.8", family: 4 }], [{ address: "169.254.169.254", family: 4 }]];
    const l = createGuardedLookup((_h, _o, cb) => cb(null, answers.shift()!));
    expect((await run(l, {})).err).toBeNull();
    expect((await run(l, {})).err?.message).toBe("blocked address");
  });

  it("blocks empty answers and propagates resolver errors", async () => {
    expect((await run(lookupWith([]), {})).err?.message).toBe("blocked address");
    const failing = createGuardedLookup((_h, _o, cb) => cb(new Error("ENOTFOUND"), []));
    expect((await run(failing, {})).err?.message).toBe("ENOTFOUND");
  });
});

describe("safeFetcher url checks", () => {
  it.each(["http://example.com/x", "https://example.com:8443/x", "https://127.0.0.1/x", "https://[::1]/x", "https://8.8.8.8/x", "not a url"])(
    "rejects %s before any network access",
    async (url) => {
      await expect(safeFetcher(url)).rejects.toThrow("blocked url");
    },
  );
});
