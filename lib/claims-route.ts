import { NextResponse } from "next/server";
import { z } from "zod";
import { createClaimsDeps } from "@/lib/claims-deps";
import { processClaim } from "@/lib/claims-service";
import { createRateLimiter } from "@/lib/rate-limit";

const bodySchema = z.object({ message: z.string().min(1).max(1300), signature: z.string().min(1).max(200) });
const allow = createRateLimiter(20, 60_000);

export async function handleClaimRequest(req: Request, persist: boolean) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!allow(`${persist ? "w" : "c"}:${ip}`)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const result = await processClaim(body.data, createClaimsDeps(), persist);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
