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

/**
 * The client IP, or null when it cannot be determined. The first X-Forwarded-For value is never
 * trusted (the client controls it): either a header set by the proxy is used, or the entry added
 * by the last trusted proxy, counted from the right.
 */
export function getClientIp(headers: Headers, config: ProxyConfig = defaultConfig()): string | null {
  if (config.header) {
    const ip = headers.get(config.header)?.trim();
    if (ip && net.isIP(ip) !== 0) return ip;
  }
  const xff = headers.get("x-forwarded-for");
  if (!xff) return null;
  const parts = xff.split(",").map((p) => p.trim());
  const ip = parts[parts.length - config.hops];
  return ip && net.isIP(ip) !== 0 ? ip : null;
}
