import { desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { heartbeat } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = false;
  let lastHeartbeat: string | null = null;
  try {
    const d = getDb();
    await d.execute(sql`SELECT 1`);
    db = true;
    const [row] = await d
      .select({ createdAt: heartbeat.createdAt })
      .from(heartbeat)
      .orderBy(desc(heartbeat.id))
      .limit(1);
    lastHeartbeat = row?.createdAt.toISOString() ?? null;
  } catch {
    // db stays false (or lastHeartbeat null if the table is missing)
  }
  return NextResponse.json({
    ok: true,
    db,
    time: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    lastHeartbeat,
  });
}
