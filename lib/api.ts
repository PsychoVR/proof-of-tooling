import { NextResponse } from "next/server";

export const CACHE_HEADERS = { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" };

/** Wraps a GET handler: JSON with short edge cache, generic 500 (no internals leaked). */
export async function jsonGet<T>(fn: () => Promise<T | null>, notFound = "not found"): Promise<NextResponse> {
  try {
    const data = await fn();
    if (data === null) return NextResponse.json({ error: notFound }, { status: 404 });
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (err) {
    console.error("api error:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}
