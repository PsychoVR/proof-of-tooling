import { NextResponse } from "next/server";
import { authGate } from "@/lib/auth-throttle";
import { adminAuthorized } from "@/lib/admin-auth";
import { seedUnclaimed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/** Loads the "unclaimed" seed entries. Idempotent; protected by ADMIN_SECRET. */
export async function POST(req: Request) {
  const denied = authGate(req, adminAuthorized);
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, ...(await seedUnclaimed()) });
  } catch (err) {
    console.error("seed failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ ok: false, error: "seed failed" }, { status: 500 });
  }
}
