import { createHash } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { claimDecisions, claims, tools } from "@/db/schema";
import { adminAuthorized } from "@/lib/admin-auth";
import { checkProofFile } from "@/lib/claims";
import { resolveTxt } from "@/lib/dns-txt";
import { safeFetcher } from "@/lib/safe-fetch";
import { sanitizeText } from "@/lib/text";
import type { ClaimCheckResult, ClaimStatus } from "@/lib/types";

export type Decision = "approve" | "reject";

export interface PendingClaim {
  id: number;
  toolId: number;
  toolName: string;
  toolUrl: string;
  identity: string;
  cluster: string;
  message: string;
  signature: string;
  signedDate: string;
  submittedAt: Date;
}

/** What the admin reviewed. A decision only applies if the stored claim still has this content. */
export function claimEtag(c: Pick<PendingClaim, "id" | "toolId" | "identity" | "message" | "signature" | "signedDate">): string {
  const raw = [c.id, c.toolId, c.identity, c.message, c.signature, c.signedDate].join("\n");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export interface AdminClaimsDeps {
  loadClaim: (id: number) => Promise<(PendingClaim & { status: ClaimStatus }) | null>;
  checkProof: (toolUrl: string, identity: string) => Promise<ClaimCheckResult>;
  /** Applies the decision and records it atomically; false when the row changed or is no longer pending. */
  apply: (c: PendingClaim, decision: Decision, actor: string) => Promise<boolean>;
}

const selectPending = () =>
  getDb()
    .select({
      id: claims.id,
      toolId: claims.toolId,
      toolName: tools.name,
      toolUrl: tools.url,
      identity: claims.identity,
      cluster: claims.cluster,
      message: claims.message,
      signature: claims.signature,
      signedDate: claims.signedDate,
      submittedAt: claims.verifiedAt,
      status: claims.status,
    })
    .from(claims)
    .innerJoin(tools, eq(tools.id, claims.toolId));

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface PendingPage {
  items: (PendingClaim & { etag: string })[];
  total: number;
  limit: number;
  offset: number;
}

/** Oldest pending claims first, one page at a time. */
export async function listPendingClaims(opts: { limit?: number; offset?: number } = {}): Promise<PendingPage> {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(opts.limit ?? DEFAULT_PAGE_SIZE)));
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const [{ total }] = await getDb().select({ total: count() }).from(claims).where(eq(claims.status, "pending"));
  const rows = await selectPending().where(eq(claims.status, "pending")).orderBy(claims.id).limit(limit).offset(offset);
  return { items: rows.map((r) => ({ ...r, etag: claimEtag(r) })), total, limit, offset };
}

export const adminDbDeps: AdminClaimsDeps = {
  loadClaim: async (id) => (await selectPending().where(eq(claims.id, id)).limit(1))[0] ?? null,
  checkProof: (toolUrl, identity) => checkProofFile(toolUrl, identity, safeFetcher, resolveTxt),
  apply: (c, decision, actor) =>
    getDb().transaction(async (tx) => {
      const [res] = await tx
        .update(claims)
        .set(decision === "approve" ? { status: "active", verifiedAt: new Date(), lastCheckedAt: new Date() } : { status: "rejected" })
        .where(and(eq(claims.id, c.id), eq(claims.status, "pending"), eq(claims.message, c.message), eq(claims.signature, c.signature)));
      if (res.affectedRows === 0) return false;
      await tx.insert(claimDecisions).values({ claimId: c.id, decision, previousStatus: "pending", actor });
      return true;
    }),
};

export type DecisionResult =
  | { ok: true; id: number; status: "active" | "rejected" }
  | { ok: false; code: "not_found" | "precondition_required" | "precondition_failed" | "proof_invalid"; detail?: string };

/**
 * Approves or rejects a pending claim. The caller must send the etag of the claim it reviewed;
 * approving also re-checks the proof file, so a claim whose proof disappeared in the meantime
 * cannot start counting.
 */
export async function decideClaim(
  id: number,
  decision: Decision,
  opts: { actor: string; ifMatch: string | null },
  deps: AdminClaimsDeps = adminDbDeps,
): Promise<DecisionResult> {
  const claim = await deps.loadClaim(id);
  if (!claim || claim.status !== "pending") return { ok: false, code: "not_found" };
  if (!opts.ifMatch) return { ok: false, code: "precondition_required" };
  if (opts.ifMatch !== claimEtag(claim)) return { ok: false, code: "precondition_failed" };
  if (decision === "approve") {
    let proof: ClaimCheckResult;
    try {
      proof = await deps.checkProof(claim.toolUrl, claim.identity);
    } catch {
      proof = { id: "proof", ok: false, detail: "Could not fetch the proof file." };
    }
    if (!proof.ok) return { ok: false, code: "proof_invalid", detail: proof.detail };
  }
  if (!(await deps.apply(claim, decision, opts.actor))) return { ok: false, code: "precondition_failed" };
  return { ok: true, id, status: decision === "approve" ? "active" : "rejected" };
}

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

const HTTP: Record<Exclude<DecisionResult, { ok: true }>["code"], { status: number; error: string }> = {
  not_found: { status: 404, error: "claim is not pending" },
  precondition_required: { status: 428, error: "If-Match header with the claim etag is required" },
  precondition_failed: { status: 412, error: "claim changed since it was reviewed" },
  proof_invalid: { status: 409, error: "proof file is no longer valid" },
};

export async function handleDecision(req: Request, rawId: string, decision: Decision, deps?: AdminClaimsDeps) {
  if (!adminAuthorized(req.headers.get("authorization"))) return unauthorized();
  if (!/^\d{1,9}$/.test(rawId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const actor = sanitizeText(req.headers.get("x-admin-actor"), 64) ?? "admin";
  try {
    const r = await decideClaim(Number(rawId), decision, { actor, ifMatch: req.headers.get("if-match") }, deps);
    if (r.ok) return NextResponse.json({ ok: true, id: r.id, status: r.status });
    const h = HTTP[r.code];
    return NextResponse.json({ error: h.error, ...(r.detail ? { detail: r.detail } : {}) }, { status: h.status });
  } catch (err) {
    console.error("admin decision failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function handleListPending(req: Request) {
  if (!adminAuthorized(req.headers.get("authorization"))) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const num = (name: string) => (sp.has(name) && /^\d{1,6}$/.test(sp.get(name)!) ? Number(sp.get(name)) : undefined);
  if ((sp.has("limit") && num("limit") === undefined) || (sp.has("offset") && num("offset") === undefined)) {
    return NextResponse.json({ error: "invalid pagination" }, { status: 400 });
  }
  try {
    return NextResponse.json(await listPendingClaims({ limit: num("limit"), offset: num("offset") }));
  } catch (err) {
    console.error("admin list failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
