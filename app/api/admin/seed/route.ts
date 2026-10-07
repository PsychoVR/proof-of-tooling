import { NextResponse } from "next/server";
import { adminAuthorized } from "@/lib/admin-auth";
import { seedUnclaimed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/** Loads the "unclaimed" seed entries. Idempotent; protected by ADMIN_SECRET. */
export async function POST(req: Request) {
  if (!adminAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await seedUnclaimed()) });
  } catch (err) {
    console.error("seed failed", err);
    return NextResponse.json({ ok: false, error: "seed failed" }, { status: 500 });
  }
}
