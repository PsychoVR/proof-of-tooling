import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { claims } from "@/db/schema";
import { adminAuthorized } from "@/lib/admin-auth";

export type Decision = "approve" | "reject";

/** Moves a pending claim to active (approve) or rejected (reject). Returns false when it is not pending. */
export async function decideClaim(id: number, decision: Decision): Promise<boolean> {
  const set =
    decision === "approve"
      ? { status: "active" as const, verifiedAt: new Date(), lastCheckedAt: new Date() }
      : { status: "rejected" as const };
  const [result] = await getDb()
    .update(claims)
    .set(set)
    .where(and(eq(claims.id, id), eq(claims.status, "pending")));
  return result.affectedRows > 0;
}

export async function handleDecision(req: Request, rawId: string, decision: Decision) {
  if (!adminAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!/^\d{1,9}$/.test(rawId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    const changed = await decideClaim(Number(rawId), decision);
    if (!changed) return NextResponse.json({ error: "claim is not pending" }, { status: 404 });
    return NextResponse.json({ ok: true, id: Number(rawId), status: decision === "approve" ? "active" : "rejected" });
  } catch (err) {
    console.error("admin decision failed", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
