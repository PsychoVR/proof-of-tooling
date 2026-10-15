import { NextResponse } from "next/server";
import { authGate } from "@/lib/auth-throttle";
import { cronAuthorized } from "@/lib/cron-auth";
import { hasStepErrors } from "@/lib/job-errors";

/** Shared wrapper for POST /api/cron/*: bearer auth (constant time) + uniform error handling. */
export async function runCron(req: Request, job: () => Promise<unknown>): Promise<NextResponse> {
  const denied = authGate(req, cronAuthorized);
  if (denied) return denied;
  try {
    const result = await job();
    // A job made of independent steps reports the ones that failed; the rest of its work was still done.
    if (hasStepErrors(result)) {
      return NextResponse.json({ ok: false, error: "job failed", failed: result.errors, result }, { status: 500 });
    }
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("cron job failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ ok: false, error: "job failed" }, { status: 500 });
  }
}
