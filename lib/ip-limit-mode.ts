/**
 * Per-IP limits only block once the proxy settings say where the client address lives
 * (TRUSTED_IP_HEADER, or an explicit TRUSTED_PROXY_HOPS). Until then they run in log-only mode:
 * hits are counted and a would-be block is logged, but nobody is refused. A wrong guess about the
 * proxy would otherwise put every visitor in one bucket on the first deploy.
 */
export function enforceIpLimits(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.TRUSTED_IP_HEADER?.trim() || !!env.TRUSTED_PROXY_HOPS?.trim();
}

const LOG_EVERY_MS = 60_000;
const lastLogged = new Map<string, number>();

/** Logs that a per-IP limit would have blocked a request (at most once a minute per scope; no IPs, no secrets). */
export function logWouldBlock(scope: string, now: number = Date.now()): boolean {
  const last = lastLogged.get(scope);
  if (last !== undefined && now - last < LOG_EVERY_MS) return false;
  lastLogged.set(scope, now);
  console.warn(`rate limit (log-only, no trusted IP header configured): ${scope} would have blocked a request`);
  return true;
}
