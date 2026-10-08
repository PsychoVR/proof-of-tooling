import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { validatorIcons } from "@/db/schema";
import { isValidPubkey } from "@/lib/claims";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=86400, stale-while-revalidate=604800";
// The body is an image served from our own origin: nothing in it may run or load anything.
const HARDENING = { "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" };

/** The icon a validator published on chain, as stored by the daily job. The third-party url is never exposed. */
export async function GET(req: Request, ctx: { params: Promise<{ identity: string }> }) {
  const { identity } = await ctx.params;
  if (!isValidPubkey(identity)) return new Response(null, { status: 404 });
  try {
    const [row] = await getDb().select().from(validatorIcons).where(eq(validatorIcons.identity, identity)).limit(1);
    if (!row) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=300" } });
    const base = { etag: row.etag, "cache-control": CACHE, ...HARDENING };
    const inm = req.headers.get("if-none-match");
    if (inm && inm.split(",").some((t) => t.trim().replace(/^W\//, "") === row.etag)) return new Response(null, { status: 304, headers: base });
    return new Response(new Uint8Array(row.bytes), {
      headers: { ...base, "content-type": row.contentType, "content-length": String(row.bytes.length) },
    });
  } catch (err) {
    console.error("icon route failed:", err instanceof Error ? err.message : "unknown error");
    return new Response(null, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
