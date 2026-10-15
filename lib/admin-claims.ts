import { createHash } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { claimDecisions, claims, tools } from "@/db/schema";
import { authGate } from "@/lib/auth-throttle";
import { adminAuthorized } from "@/lib/admin-auth";
import { checkProofFile } from "@/lib/claims";
import { resolveTxt } from "@/lib/dns-txt";
import { onClaimActivated } from "@/lib/claim-activation";
import { createGithubAwareFetcher } from "@/lib/github-proof-fetch";
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
  apply: (c: PendingClaim, decision: Decision, actor: string, reason?: string | null) => Promise<boolean>;
  /** Called after an approval: the validator now has an active claim (fetch its icon and pools). Must not throw. */
  activated?: (identity: string) => void;
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

export interface PendingGroup {
  identity: string;
  claims: (PendingClaim & { etag: string })[];
}

/** Pending claims grouped by validator identity (oldest claim first inside each group, groups by their oldest claim). */
export async function listPendingByValidator(): Promise<{ total: number; groups: PendingGroup[] }> {
  const rows = await selectPending().where(eq(claims.status, "pending")).orderBy(claims.id);
  const byIdentity = new Map<string, PendingGroup>();
  for (const r of rows) {
    const g = byIdentity.get(r.identity) ?? { identity: r.identity, claims: [] };
    g.claims.push({ ...r, etag: claimEtag(r) });
    byIdentity.set(r.identity, g);
  }
  return { total: rows.length, groups: [...byIdentity.values()] };
}

export const adminDbDeps: AdminClaimsDeps = {
  loadClaim: async (id) => (await selectPending().where(eq(claims.id, id)).limit(1))[0] ?? null,
  checkProof: (toolUrl, identity) => checkProofFile(toolUrl, identity, createGithubAwareFetcher(safeFetcher), resolveTxt),
  activated: (identity) => void onClaimActivated(identity),
  apply: (c, decision, actor, reason) =>
    getDb().transaction(async (tx) => {
      const [res] = await tx
        .update(claims)
        .set(decision === "approve" ? { status: "active", verifiedAt: new Date(), lastCheckedAt: new Date() } : { status: "rejected" })
        .where(and(eq(claims.id, c.id), eq(claims.status, "pending"), eq(claims.message, c.message), eq(claims.signature, c.signature)));
      if (res.affectedRows === 0) return false;
      await tx.insert(claimDecisions).values({ claimId: c.id, decision, previousStatus: "pending", actor, reason: reason ?? null });
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
  opts: { actor: string; ifMatch: string | null; reason?: string | null },
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
  if (!(await deps.apply(claim, decision, opts.actor, opts.reason))) return { ok: false, code: "precondition_failed" };
  if (decision === "approve") deps.activated?.(claim.identity); // icon and stake badges appear now, not tomorrow
  return { ok: true, id, status: decision === "approve" ? "active" : "rejected" };
}

const HTTP: Record<Exclude<DecisionResult, { ok: true }>["code"], { status: number; error: string }> = {
  not_found: { status: 404, error: "claim is not pending" },
  precondition_required: { status: 428, error: "If-Match header with the claim etag is required" },
  precondition_failed: { status: 412, error: "claim changed since it was reviewed" },
  proof_invalid: { status: 409, error: "proof file is no longer valid" },
};

export async function handleDecision(req: Request, rawId: string, decision: Decision, deps?: AdminClaimsDeps) {
  const denied = authGate(req, adminAuthorized);
  if (denied) return denied;
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
  const denied = authGate(req, adminAuthorized);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const num = (name: string) => (sp.has(name) && /^\d{1,6}$/.test(sp.get(name)!) ? Number(sp.get(name)) : undefined);
  if ((sp.has("limit") && num("limit") === undefined) || (sp.has("offset") && num("offset") === undefined)) {
    return NextResponse.json({ error: "invalid pagination" }, { status: 400 });
  }
  try {
    if (sp.get("group") === "validator") return NextResponse.json(await listPendingByValidator());
    return NextResponse.json(await listPendingClaims({ limit: num("limit"), offset: num("offset") }));
  } catch (err) {
    console.error("admin list failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export const MAX_BATCH = 50;
export const MAX_REASON_LENGTH = 255;

export interface BatchItem {
  id: number;
  etag: string;
}

export interface BatchResult {
  decision: Decision;
  results: ({ id: number } & ({ ok: true; status: "active" | "rejected" } | { ok: false; code: Exclude<DecisionResult, { ok: true }>["code"]; detail?: string }))[];
  decided: number;
  failed: number;
}

/** Applies one decision to several pending claims. Each claim is decided on its own: one failure does not stop the others. */
export async function decideBatch(
  decision: Decision,
  items: BatchItem[],
  opts: { actor: string; reason: string },
  deps: AdminClaimsDeps = adminDbDeps,
): Promise<BatchResult> {
  const results: BatchResult["results"] = [];
  for (const it of items) {
    const r = await decideClaim(it.id, decision, { actor: opts.actor, ifMatch: it.etag, reason: opts.reason }, deps);
    results.push(r.ok ? { id: it.id, ok: true, status: r.status } : { id: it.id, ok: false, code: r.code, ...(r.detail ? { detail: r.detail } : {}) });
  }
  const decided = results.filter((r) => r.ok).length;
  return { decision, results, decided, failed: results.length - decided };
}

export async function handleBatch(req: Request, deps?: AdminClaimsDeps) {
  const denied = authGate(req, adminAuthorized);
  if (denied) return denied;
  let body: { decision?: unknown; reason?: unknown; claims?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const decision = body.decision;
  const reason = typeof body.reason === "string" ? sanitizeText(body.reason, MAX_REASON_LENGTH) : null;
  const list = body.claims;
  const valid =
    (decision === "approve" || decision === "reject") &&
    Array.isArray(list) &&
    list.length >= 1 &&
    list.length <= MAX_BATCH &&
    list.every((c) => c && typeof c === "object" && Number.isInteger(c.id) && c.id > 0 && typeof c.etag === "string" && /^[0-9a-f]{32}$/.test(c.etag));
  if (!valid) return NextResponse.json({ error: `decision (approve|reject) and 1-${MAX_BATCH} claims with id and etag are required` }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });
  const items = (list as BatchItem[]).map((c) => ({ id: c.id, etag: c.etag }));
  if (new Set(items.map((i) => i.id)).size !== items.length) return NextResponse.json({ error: "duplicate claim ids" }, { status: 400 });
  const actor = sanitizeText(req.headers.get("x-admin-actor"), 64) ?? "admin";
  try {
    return NextResponse.json(await decideBatch(decision as Decision, items, { actor, reason }, deps));
  } catch (err) {
    console.error("admin batch failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
