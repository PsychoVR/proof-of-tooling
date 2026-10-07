import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
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
 * the caller is authorized. Failed attempts are counted per client IP: after 10 in a minute the IP gets
 * 429 even for a correct secret until the window passes, which makes online guessing impractical.
 */
export function authGate(req: Request, authorized: (header: string | null) => boolean): NextResponse | null {
  warnIfSecretsShared();
  const key = getClientIp(req.headers) ?? "unknown";
  if (failures.exhausted(key)) return NextResponse.json({ error: "too many attempts" }, { status: 429 });
  if (authorized(req.headers.get("authorization"))) return null;
  failures(key);
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
