import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { authGate } from "@/lib/auth-throttle";
import { cronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

type Db = ReturnType<typeof getDb>;

// Drizzle tracks applied migrations by journal timestamp (created_at).
async function appliedTimestamps(db: Db): Promise<Set<number>> {
  try {
    const [rows] = await db.execute(sql`SELECT created_at FROM __drizzle_migrations`);
    return new Set((rows as unknown as { created_at: string | number }[]).map((r) => Number(r.created_at)));
  } catch {
    return new Set(); // table does not exist yet: nothing applied
  }
}

export async function POST(req: Request) {
  const denied = authGate(req, cronAuthorized);
  if (denied) return denied;
  try {
    const db = getDb();
    const journal = JSON.parse(await readFile(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as {
      entries: { tag: string; when: number }[];
    };
    const before = await appliedTimestamps(db);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const after = await appliedTimestamps(db);
    const applied = journal.entries.filter((e) => after.has(e.when) && !before.has(e.when)).map((e) => e.tag);
    return NextResponse.json({ ok: true, applied, total: journal.entries.length });
  } catch (err) {
    console.error("migrate failed", err);
    return NextResponse.json({ ok: false, error: "migration failed" }, { status: 500 });
  }
}
