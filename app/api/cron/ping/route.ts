import { count } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { heartbeat } from "@/db/schema";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

function authorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${getEnv().CRON_SECRET}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function POST(req: Request) {
  if (!authorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  await db.insert(heartbeat).values({ source: "cron" });
  const [row] = await db.select({ total: count() }).from(heartbeat);
  return NextResponse.json({ ok: true, total: row.total });
}
