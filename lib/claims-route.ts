import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/lib/types";
import { createClaimsDeps } from "@/lib/claims-deps";
import { processClaim } from "@/lib/claims-service";
import { createRateLimiter } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/text";
import { getClientIp } from "@/lib/client-ip";
import { parseClaimMessage } from "@/lib/claims";

const bodySchema = z.object({
  message: z.string().min(1).max(1300),
  signature: z.string().min(1).max(200),
  category: z.enum(CATEGORIES).optional(),
  toolName: z.string().max(255).transform((v) => sanitizeText(v, 80) ?? undefined).optional(),
});
const MAX_BODY_BYTES = 4096;
const allow = createRateLimiter(20, 60_000);
// Requests whose client IP cannot be determined share one stricter bucket.
const allowUnknown = createRateLimiter(5, 60_000);
// Per claimed identity, so rotating IPs does not help against one validator.
const allowWriteIdentity = createRateLimiter(10, 60_000);
const allowCheckIdentity = createRateLimiter(30, 60_000);

const tooMany = () => NextResponse.json({ error: "rate limited" }, { status: 429 });

export async function handleClaimRequest(req: Request, persist: boolean) {
  const ip = getClientIp(req.headers);
  if (!(ip ? allow(`${persist ? "w" : "c"}:${ip}`) : allowUnknown(persist ? "w" : "c"))) return tooMany();
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
  // Messages that do not parse are rejected by the pipeline and only count against the IP.
  const identity = parseClaimMessage(body.data.message)?.identity;
  if (identity && !(persist ? allowWriteIdentity : allowCheckIdentity)(identity)) return tooMany();
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
