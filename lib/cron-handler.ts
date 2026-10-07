import { NextResponse } from "next/server";
import { authGate } from "@/lib/auth-throttle";
import { cronAuthorized } from "@/lib/cron-auth";

/** Shared wrapper for POST /api/cron/*: bearer auth (constant time) + uniform error handling. */
export async function runCron(req: Request, job: () => Promise<unknown>): Promise<NextResponse> {
  const denied = authGate(req, cronAuthorized);
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, result: await job() });
  } catch (err) {
    console.error("cron job failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ ok: false, error: "job failed" }, { status: 500 });
  }
}
