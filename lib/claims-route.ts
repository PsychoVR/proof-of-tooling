import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/lib/types";
import { createClaimsDeps } from "@/lib/claims-deps";
import { processClaim } from "@/lib/claims-service";
import { createRateLimiter } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/text";

const bodySchema = z.object({
  message: z.string().min(1).max(1300),
  signature: z.string().min(1).max(200),
  category: z.enum(CATEGORIES).optional(),
  toolName: z.string().max(255).transform((v) => sanitizeText(v, 80) ?? undefined).optional(),
});
const MAX_BODY_BYTES = 4096;
const allow = createRateLimiter(20, 60_000);

export async function handleClaimRequest(req: Request, persist: boolean) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!allow(`${persist ? "w" : "c"}:${ip}`)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  let result;
  try {
    result = await processClaim(body.data, createClaimsDeps(), persist);
  } catch (err) {
    // Never echo internals (SQL, stack traces); the message alone is enough to diagnose.
    console.error("claim request failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
  // A dry run reports failed steps in the body; only a real registration attempt is an HTTP error.
  return NextResponse.json(result, { status: result.ok || !persist ? 200 : 422 });
}
