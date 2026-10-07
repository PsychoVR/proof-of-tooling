import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import type { Fetcher } from "@/lib/claims";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 64 * 1024 + 1;
const MAX_CONCURRENT = 8;
const MAX_QUEUE = 64;

/** IPv4 ranges that are never a legitimate public destination. */
function isPrivateV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24 IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // 192.0.2.0/24 TEST-NET-1
    (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24 TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // 203.0.113.0/24 TEST-NET-3
    (a === 192 && b === 88 && c === 99) // 192.88.99.0/24 6to4 relay anycast
  );
}

/** Expands an IPv6 address into its eight 16-bit groups (an embedded IPv4 tail counts as two groups). */
function ipv6Groups(ip: string): number[] | null {
  let v = ip.toLowerCase().replace(/%.*$/, "");
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (tail) {
    if (!net.isIPv4(tail[1])) return null;
    const [a, b, c, d] = tail[1].split(".").map(Number);
    v = v.slice(0, -tail[1].length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...rest].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const g = ipv6Groups(ip);
    if (!g) return true;
    const first = g[0];
    const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
      // ::, ::1, IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge by the embedded IPv4.
      return g[5] === 0 && g[6] === 0 && g[7] <= 1 ? true : isPrivateV4(v4(g[6], g[7]));
    }
    return (
      (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
      (first & 0xffc0) === 0xfe80 || // fe80::/10 link local
      (first & 0xffc0) === 0xfec0 || // fec0::/10 site local (deprecated)
      (first & 0xff00) === 0xff00 || // ff00::/8 multicast
      first === 0x2002 || // 2002::/16 6to4
      (first === 0x64 && g[1] === 0xff9b) || // 64:ff9b::/96 NAT64 (and the 64:ff9b:1::/48 local-use range)
      (first === 0x2001 && g[1] === 0x0db8) || // 2001:db8::/32 documentation
      (first === 0x2001 && g[1] === 0) || // 2001::/32 Teredo
      (first === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) || // 100::/64 discard-only
      (first === 0x3fff && (g[1] & 0xf000) === 0) || // 3fff::/20 documentation
      (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) // ::ffff:0:0/96 IPv4-translated
    );
  }
  return net.isIPv4(ip) ? isPrivateV4(ip) : true;
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

type RequestFn = (
  url: URL,
  options: https.RequestOptions,
  cb: (res: import("node:http").IncomingMessage) => void,
) => import("node:http").ClientRequest;

export interface SafeFetchOptions {
  request?: RequestFn;
  timeoutMs?: number;
  maxBytes?: number;
  maxConcurrent?: number;
  maxQueue?: number;
}

/**
 * Builds a fetcher for public https URLs: no redirects, one overall deadline (a slow-drip server
 * cannot hold the request open), capped body, no private addresses, and a global limit on requests
 * in flight (the rest wait in a bounded queue and are refused when it is full).
 */
export function createSafeFetcher(opts: SafeFetchOptions = {}): Fetcher {
  const request: RequestFn = opts.request ?? ((url, o, cb) => https.request(url, o, cb));
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const maxConcurrent = opts.maxConcurrent ?? MAX_CONCURRENT;
  const maxQueue = opts.maxQueue ?? MAX_QUEUE;
  let active = 0;
  const queue: (() => void)[] = [];

  const run = (u: URL) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const req = request(
        u,
        { method: "GET", lookup: createGuardedLookup() as never, headers: { "user-agent": "proof-of-tooling" } },
        (res) => {
          const declared = Number(res.headers?.["content-length"]);
          if (Number.isFinite(declared) && declared > maxBytes) {
            res.destroy();
            return settle(() => reject(new Error("response too large")));
          }
          const chunks: Buffer[] = [];
          let size = 0;
          const finish = () => settle(() => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
          res.on("data", (c: Buffer) => {
            size += c.length;
            chunks.push(c);
            if (size > maxBytes) {
              // Over the cap: hand back what was read (longer than the cap, which callers treat as a failure).
              finish();
              res.destroy();
            }
          });
          res.on("end", finish);
          // A connection that drops mid-body must not look like a complete (shorter) document.
          res.on("close", () => (res.complete ? finish() : settle(() => reject(new Error("incomplete response")))));
          res.on("error", (err) => settle(() => reject(err)));
        },
      );
      timer = setTimeout(() => {
        settle(() => reject(new Error("timeout")));
        req.destroy();
      }, timeoutMs);
      req.on("error", (err) => settle(() => reject(err)));
      req.end();
    });

  const next = () => {
    while (active < maxConcurrent && queue.length > 0) {
      active++;
      queue.shift()!();
    }
  };

  return (url) =>
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
      if (active >= maxConcurrent && queue.length >= maxQueue) return reject(new Error("busy"));
      queue.push(() => {
        run(u)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}

export const safeFetcher: Fetcher = createSafeFetcher();
