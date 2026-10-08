import { count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { POOL_CANDIDATE_STATUSES, poolCandidates } from "@/db/schema";
import { adminAuthorized } from "@/lib/admin-auth";
import { authGate } from "@/lib/auth-throttle";
import { LOGO_ID_RE, logoPathFor } from "@/lib/pool-registry";
import { sanitizeText } from "@/lib/text";

export type CandidateStatus = (typeof POOL_CANDIDATE_STATUSES)[number];

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
const MAX_BODY_BYTES = 2048;
const MAX_NAME_LENGTH = 60;
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface CandidateRow {
  pool: string;
  poolMint: string;
  validatorList: string;
  withdrawAuthority: string;
  program: string;
  firstSeen: Date;
  lastSeen: Date;
  status: CandidateStatus;
  name: string | null;
  logoId: string | null;
  decidedAt: Date | null;
  decidedBy: string | null;
}

export interface CandidatePage {
  items: CandidateRow[];
  total: number;
  limit: number;
  offset: number;
}

/** Candidates of one status (pending by default), newest first, one page at a time. */
export async function listCandidates(opts: { status?: CandidateStatus; limit?: number; offset?: number } = {}): Promise<CandidatePage> {
  const status = opts.status ?? "pending";
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(opts.limit ?? DEFAULT_PAGE_SIZE)));
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const [{ total }] = await getDb().select({ total: count() }).from(poolCandidates).where(eq(poolCandidates.status, status));
  const items = await getDb()
    .select()
    .from(poolCandidates)
    .where(eq(poolCandidates.status, status))
    .orderBy(desc(poolCandidates.firstSeen), poolCandidates.pool)
    .limit(limit)
    .offset(offset);
  return { items, total, limit, offset };
}

export type PoolDecisionResult =
  | { ok: true; pool: string; status: "approved" | "rejected" }
  | { ok: false; code: "not_found" | "invalid_name" | "invalid_logo" };

/**
 * Approves a candidate with a curated name and the id of a logo that ships in public/pools, or rejects it.
 * The name is free text pasted by the admin, so it is cleaned like any other free text.
 * Approving a rejected candidate is allowed (a mistake can be undone); rejecting clears name and logo.
 */
export async function decideCandidate(
  pool: string,
  decision: { kind: "approve"; name: unknown; logoId: unknown } | { kind: "reject" },
  actor: string,
): Promise<PoolDecisionResult> {
  const db = getDb();
  const [existing] = await db.select({ pool: poolCandidates.pool }).from(poolCandidates).where(eq(poolCandidates.pool, pool)).limit(1);
  if (!existing) return { ok: false, code: "not_found" };
  if (decision.kind === "reject") {
    await db
      .update(poolCandidates)
      .set({ status: "rejected", name: null, logoId: null, decidedAt: new Date(), decidedBy: actor })
      .where(eq(poolCandidates.pool, pool));
    return { ok: true, pool, status: "rejected" };
  }
  const name = sanitizeText(decision.name, MAX_NAME_LENGTH);
  if (!name) return { ok: false, code: "invalid_name" };
  const logoId = decision.logoId;
  if (typeof logoId !== "string" || !LOGO_ID_RE.test(logoId) || !logoPathFor(logoId)) return { ok: false, code: "invalid_logo" };
  await db
    .update(poolCandidates)
    .set({ status: "approved", name, logoId, decidedAt: new Date(), decidedBy: actor })
    .where(eq(poolCandidates.pool, pool));
  return { ok: true, pool, status: "approved" };
}

const HTTP = {
  not_found: { status: 404, error: "candidate not found" },
  invalid_name: { status: 400, error: "name is required" },
  invalid_logo: { status: 400, error: "logoId must be the id of a logo file in public/pools" },
} as const;

const num = (sp: URLSearchParams, name: string) => (sp.has(name) && /^\d{1,6}$/.test(sp.get(name)!) ? Number(sp.get(name)) : undefined);

export async function handleListCandidates(req: Request) {
  const denied = authGate(req, adminAuthorized);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const rawStatus = sp.get("status");
  const status =
    rawStatus === null ? undefined : (POOL_CANDIDATE_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as CandidateStatus) : null;
  if (status === null || (sp.has("limit") && num(sp, "limit") === undefined) || (sp.has("offset") && num(sp, "offset") === undefined)) {
    return NextResponse.json({ error: "invalid query" }, { status: 400 });
  }
  try {
    return NextResponse.json(await listCandidates({ status, limit: num(sp, "limit"), offset: num(sp, "offset") }));
  } catch (err) {
    console.error("admin pool list failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function handleCandidateDecision(req: Request, rawPool: string, kind: "approve" | "reject") {
  const denied = authGate(req, adminAuthorized);
  if (denied) return denied;
  if (!BASE58_ADDRESS.test(rawPool)) return NextResponse.json({ error: "invalid pool address" }, { status: 400 });
  const actor = sanitizeText(req.headers.get("x-admin-actor"), 64) ?? "admin";
  let decision: Parameters<typeof decideCandidate>[1] = { kind: "reject" };
  if (kind === "approve") {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "payload too large" }, { status: 413 });
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload too large" }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "invalid body" }, { status: 400 });
    const b = body as Record<string, unknown>;
    decision = { kind: "approve", name: b.name, logoId: b.logoId };
  }
  try {
    const r = await decideCandidate(rawPool, decision, actor);
    if (r.ok) return NextResponse.json({ ok: true, pool: r.pool, status: r.status });
    return NextResponse.json({ error: HTTP[r.code].error }, { status: HTTP[r.code].status });
  } catch (err) {
    console.error("admin pool decision failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
