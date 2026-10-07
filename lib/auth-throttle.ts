import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { enforceIpLimits, logWouldBlock } from "@/lib/ip-limit-mode";
import { createRateLimiter } from "@/lib/rate-limit";

const MAX_FAILURES = 10;
const failures = createRateLimiter(MAX_FAILURES, 60_000);
let warned = false;

/** Warns once (names only, never values) when the admin and cron credentials are the same. */
export function warnIfSecretsShared(env: Record<string, string | undefined> = process.env): boolean {
  const shared = !!env.ADMIN_SECRET && env.ADMIN_SECRET === env.CRON_SECRET;
  if (shared && !warned) {
    warned = true;
    console.warn("ADMIN_SECRET and CRON_SECRET are identical; the admin endpoints stay off until they differ");
  }
  return shared;
}

/**
 * Bearer-auth gate for /api/admin/* and /api/cron/*. Returns the error response to send, or null when
 * the caller is authorized. Failed attempts are counted per client IP: after 10 in a minute further
 * wrong secrets get 429 until the window passes. A correct secret is never blocked by that throttle.
 */
export function authGate(req: Request, authorized: (header: string | null) => boolean): NextResponse | null {
  warnIfSecretsShared();
  const key = getClientIp(req.headers) ?? "unknown";
  // The secret is checked first: a correct one always passes, so a shared IP bucket (or an
  // attacker exhausting it) cannot lock the operator out. Only failures are counted.
  if (authorized(req.headers.get("authorization"))) return null;
  if (failures.exhausted(key)) {
    if (enforceIpLimits()) return NextResponse.json({ error: "too many attempts" }, { status: 429 });
    logWouldBlock("admin/cron auth");
  }
  failures(key);
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
