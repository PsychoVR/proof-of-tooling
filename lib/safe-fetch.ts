import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import type { Fetcher } from "@/lib/claims";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 64 * 1024 + 1;

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return (
      v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") ||
      /^fe[89ab]/.test(v) || v.startsWith("::ffff:") || v.startsWith("64:ff9b") || v.startsWith("2001:db8")
    );
  }
  if (!net.isIPv4(ip)) return true;
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

type Resolved = { address: string; family: number };
type Resolver = (
  hostname: string,
  options: dns.LookupOptions,
  cb: (err: NodeJS.ErrnoException | null, result: Resolved[]) => void,
) => void;

const systemResolver: Resolver = (hostname, options, cb) =>
  dns.lookup(hostname, { ...options, all: true }, cb as never);

/**
 * A `lookup` for http(s).request that validates every address it returns. The agent calls it
 * at connect time and connects to exactly what it returns, so the checked IP is the one used
 * and a DNS answer that changes between check and connect cannot reach a private address.
 */
export function createGuardedLookup(resolve: Resolver = systemResolver) {
  return (hostname: string, options: dns.LookupOptions, cb: (...args: never[]) => void) => {
    const done = cb as unknown as (err: Error | null, a?: string | Resolved[], f?: number) => void;
    resolve(hostname, options, (err, addrs) => {
      if (err) return done(err);
      if (!addrs || addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
        return done(new Error("blocked address"));
      }
      if (options.all) return done(null, addrs);
      done(null, addrs[0].address, addrs[0].family);
    });
  };
}

/** Fetches a public https URL: no redirects, short timeout, capped body, no private addresses. */
export const safeFetcher: Fetcher = (url) =>
  new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error("blocked url"));
    }
    // IP literals skip DNS, so the guarded lookup would never run: refuse them outright.
    if (u.protocol !== "https:" || u.port !== "" || net.isIP(u.hostname.replace(/^\[|\]$/g, "")) !== 0) {
      return reject(new Error("blocked url"));
    }
    const req = https.request(
      u,
      { method: "GET", lookup: createGuardedLookup() as never, timeout: FETCH_TIMEOUT_MS, headers: { "user-agent": "proof-of-tooling" } },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          chunks.push(c);
          if (size > MAX_BYTES) res.destroy();
        });
        const finish = () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
