import { NextResponse } from "next/server";
import { authGate } from "@/lib/auth-throttle";
import { adminAuthorized } from "@/lib/admin-auth";
import { enforceIpLimits } from "@/lib/ip-limit-mode";

export const dynamic = "force-dynamic";

const HEADERS = ["x-forwarded-for", "x-real-ip", "forwarded", "cf-connecting-ip", "x-client-ip"] as const;

/**
 * Shows which address headers the proxy in front of the app sets, so TRUSTED_IP_HEADER can be
 * chosen from evidence. Protected by ADMIN_SECRET; stores and logs nothing. The Node socket
 * address is not exposed to route handlers, so it is reported as null.
 */
export function GET(req: Request) {
  const denied = authGate(req, adminAuthorized);
  if (denied) return denied;
  return NextResponse.json(
    {
      headers: Object.fromEntries(HEADERS.map((h) => [h, req.headers.get(h)])),
      socketIp: null,
      limitsEnforced: enforceIpLimits(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
