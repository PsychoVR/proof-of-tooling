import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";

/** Shared wrapper for POST /api/cron/*: bearer auth (constant time) + uniform error handling. */
export async function runCron(req: Request, job: () => Promise<unknown>): Promise<NextResponse> {
  if (!cronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, result: await job() });
  } catch (err) {
    console.error("cron job failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "job failed" }, { status: 500 });
  }
}
