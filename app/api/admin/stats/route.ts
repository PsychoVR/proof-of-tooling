import { NextResponse } from "next/server";
import { adminAuthorized } from "@/lib/admin-auth";
import { getAdminStats } from "@/lib/admin-stats";
import { authGate } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

/** Where people get stuck: claims by status, recent growth and failed attempts by step. ADMIN_SECRET only. */
export async function GET(req: Request) {
  const denied = authGate(req, adminAuthorized);
  if (denied) return denied;
  try {
    return NextResponse.json(await getAdminStats(), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("admin stats failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "stats failed" }, { status: 500 });
  }
}
