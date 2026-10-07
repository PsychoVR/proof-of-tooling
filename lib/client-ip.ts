import net from "node:net";
import { loadProxyConfig } from "@/lib/env";

export interface ProxyConfig {
  /** Header the proxy sets with the client address (e.g. "x-real-ip"). */
  header?: string;
  /** Trusted proxies in front of the app: take the X-Forwarded-For entry this many from the right. */
  hops: number;
}

let cached: ProxyConfig | undefined;
const defaultConfig = () => (cached ??= loadProxyConfig(process.env));

/** First four 16-bit groups of an IPv6 address (its /64), or null if it cannot be expanded. */
function ipv6Prefix64(ip: string): string | null {
  let addr = ip.split("%")[0];
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(addr);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    addr = addr.slice(0, dotted.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const [head, tail, extra] = addr.split("::");
  if (extra !== undefined) return null;
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const missing = 8 - h.length - t.length;
  const groups = tail === undefined ? h : [...h, ...Array<string>(Math.max(missing, 0)).fill("0"), ...t];
  if (groups.length !== 8) return null;
  return groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":") + "::/64";
}

/** IPv4 as is; IPv6 collapsed to its /64, since one subscriber controls a whole /64. */
function bucketKey(ip: string): string | null {
  if (net.isIP(ip) === 0) return null;
  return net.isIPv6(ip) ? ipv6Prefix64(ip) : ip;
}

/**
 * The client IP (IPv6 as its /64), or null when it cannot be determined. The first X-Forwarded-For
 * value is never trusted (the client controls it). With a trusted header configured, only that
 * header counts: when it is missing or invalid the result is null (the shared strict bucket) and
 * X-Forwarded-For is not consulted. Without one, the entry added by the last trusted proxy,
 * counted from the right, is used.
 */
export function getClientIp(headers: Headers, config: ProxyConfig = defaultConfig()): string | null {
  if (config.header) return bucketKey(headers.get(config.header)?.trim() ?? "");
  const xff = headers.get("x-forwarded-for");
  if (!xff) return null;
  const parts = xff.split(",").map((p) => p.trim());
  return bucketKey(parts[parts.length - config.hops] ?? "");
}
