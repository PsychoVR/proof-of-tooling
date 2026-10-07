import { count } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { heartbeat } from "@/db/schema";
import { authGate } from "@/lib/auth-throttle";
import { cronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = authGate(req, cronAuthorized);
  if (denied) return denied;
  const db = getDb();
  await db.insert(heartbeat).values({ source: "cron" });
  const [row] = await db.select({ total: count() }).from(heartbeat);
  return NextResponse.json({ ok: true, total: row.total });
}
