import { count } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { heartbeat } from "@/db/schema";
import { cronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  await db.insert(heartbeat).values({ source: "cron" });
  const [row] = await db.select({ total: count() }).from(heartbeat);
  return NextResponse.json({ ok: true, total: row.total });
}
