import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimEtag, decideBatch, decideClaim, handleBatch, handleDecision, handleListPending, type AdminClaimsDeps } from "@/lib/admin-claims";
import { adminSecret } from "@/lib/admin-auth";

const ADMIN = "a".repeat(32);
const CRON = "c".repeat(32);

const claim = {
  id: 7,
  toolId: 3,
  toolName: "Tool",
  toolUrl: "github.com/org/tool",
  identity: "21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh",
  cluster: "mainnet",
  message: "proof-of-tooling v1 | claim | github.com/org/tool | x | 2026-10-07",
  signature: "sig",
  signedDate: "2026-10-07",
  submittedAt: new Date("2026-10-07T00:00:00Z"),
  status: "pending" as const,
};
const etag = claimEtag(claim);

function deps(over: Partial<AdminClaimsDeps> = {}): AdminClaimsDeps & { apply: ReturnType<typeof vi.fn>; checkProof: ReturnType<typeof vi.fn> } {
  return {
    loadClaim: async () => claim,
    checkProof: vi.fn(async () => ({ id: "proof" as const, ok: true })),
    apply: vi.fn(async () => true),
    ...over,
  } as never;
}

describe("claimEtag", () => {
  it("is stable and changes with any reviewed field", () => {
    expect(etag).toMatch(/^[0-9a-f]{32}$/);
    expect(claimEtag({ ...claim })).toBe(etag);
    for (const patch of [{ message: "x" }, { signature: "y" }, { signedDate: "2026-10-08" }, { identity: "z" }, { toolId: 4 }, { id: 8 }]) {
      expect(claimEtag({ ...claim, ...patch })).not.toBe(etag);
    }
  });
});

describe("decideClaim", () => {
  it("is not found when the claim is missing or no longer pending", async () => {
    expect(await decideClaim(1, "approve", { actor: "a", ifMatch: etag }, deps({ loadClaim: async () => null }))).toEqual({ ok: false, code: "not_found" });
    expect(await decideClaim(1, "approve", { actor: "a", ifMatch: etag }, deps({ loadClaim: async () => ({ ...claim, status: "active" as const }) }))).toEqual({ ok: false, code: "not_found" });
  });

  it("requires the etag of what was reviewed", async () => {
    const d = deps();
    expect(await decideClaim(7, "approve", { actor: "a", ifMatch: null }, d)).toEqual({ ok: false, code: "precondition_required" });
    expect(await decideClaim(7, "reject", { actor: "a", ifMatch: "0".repeat(32) }, d)).toEqual({ ok: false, code: "precondition_failed" });
    expect(d.apply).not.toHaveBeenCalled();
  });

  it("approving re-checks the proof and refuses when it is gone or unreachable", async () => {
    const gone = deps({ checkProof: vi.fn(async () => ({ id: "proof" as const, ok: false, detail: "Proof file not found (HTTP 404)." })) });
    expect(await decideClaim(7, "approve", { actor: "a", ifMatch: etag }, gone)).toEqual({ ok: false, code: "proof_invalid", detail: "Proof file not found (HTTP 404)." });
    const down = deps({ checkProof: vi.fn(async () => { throw new Error("net"); }) });
    expect(await decideClaim(7, "approve", { actor: "a", ifMatch: etag }, down)).toMatchObject({ ok: false, code: "proof_invalid" });
    expect(gone.apply).not.toHaveBeenCalled();
    expect(down.apply).not.toHaveBeenCalled();
  });

  it("approves and rejects with the actor, and rejecting does not need the proof", async () => {
    const d = deps();
    expect(await decideClaim(7, "approve", { actor: "rafa", ifMatch: etag }, d)).toEqual({ ok: true, id: 7, status: "active" });
    expect(d.checkProof).toHaveBeenCalledWith("github.com/org/tool", claim.identity);
    expect(d.apply).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "approve", "rafa", undefined);
    const r = deps({ checkProof: vi.fn(async () => { throw new Error("must not run"); }) });
    expect(await decideClaim(7, "reject", { actor: "rafa", ifMatch: etag }, r)).toEqual({ ok: true, id: 7, status: "rejected" });
  });

  it("fails the precondition when the row changed between review and write", async () => {
    expect(await decideClaim(7, "approve", { actor: "a", ifMatch: etag }, deps({ apply: vi.fn(async () => false) }))).toEqual({ ok: false, code: "precondition_failed" });
  });
});

describe("admin HTTP handlers", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON;
    process.env.ADMIN_SECRET = ADMIN;
    process.env.DATABASE_URL = "mysql://u:p@localhost:3306/db";
  });
  let n = 0; // a distinct client IP per request keeps the failed-auth throttle out of these tests
  const req = (auth?: string, extra: Record<string, string> = {}) =>
    new Request("http://x/api/admin", { method: "POST", headers: { "x-forwarded-for": `40.0.${++n >> 8}.${n & 255}`, ...(auth ? { authorization: auth } : {}), ...extra } });

  it("rejects missing, wrong and cron credentials before touching anything", async () => {
    const d = deps();
    const loadClaim = vi.spyOn(d, "loadClaim");
    for (const auth of [undefined, "Bearer nope", `Bearer ${CRON}`, ADMIN]) {
      expect((await handleDecision(req(auth, { "if-match": etag }), "7", "approve", d)).status).toBe(401);
      expect((await handleListPending(req(auth))).status).toBe(401);
    }
    expect(loadClaim).not.toHaveBeenCalled();
  });

  it("is switched off, not broken, when ADMIN_SECRET is missing, empty, short or equal to CRON_SECRET", async () => {
    for (const bad of [undefined, "", "short", CRON]) {
      if (bad === undefined) delete process.env.ADMIN_SECRET;
      else process.env.ADMIN_SECRET = bad;
      expect(adminSecret()).toBeNull();
      expect((await handleDecision(req(`Bearer ${bad ?? ""}`, { "if-match": etag }), "7", "approve", deps())).status).toBe(401);
    }
    expect(adminSecret({ ADMIN_SECRET: ADMIN, CRON_SECRET: CRON })).toBe(ADMIN);
  });

  it("validates the id", async () => {
    for (const id of ["abc", "1; DROP", "-1", "1234567890", ""]) {
      expect((await handleDecision(req(`Bearer ${ADMIN}`), id, "approve", deps())).status).toBe(400);
    }
  });

  it("maps outcomes to HTTP statuses", async () => {
    const auth = `Bearer ${ADMIN}`;
    const ok = await handleDecision(req(auth, { "if-match": etag, "x-admin-actor": "  rafa­  " }), "7", "approve", deps());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, id: 7, status: "active" });
    expect((await handleDecision(req(auth), "7", "approve", deps())).status).toBe(428);
    expect((await handleDecision(req(auth, { "if-match": "bad" }), "7", "approve", deps())).status).toBe(412);
    expect((await handleDecision(req(auth, { "if-match": etag }), "7", "approve", deps({ loadClaim: async () => null }))).status).toBe(404);
    const gone = await handleDecision(req(auth, { "if-match": etag }), "7", "approve", deps({ checkProof: vi.fn(async () => ({ id: "proof" as const, ok: false, detail: "gone" })) }));
    expect(gone.status).toBe(409);
    expect(await gone.json()).toMatchObject({ detail: "gone" });
  });

  it("sanitizes the actor (bidi controls) and defaults it", async () => {
    const d = deps();
    await handleDecision(req(`Bearer ${ADMIN}`, { "if-match": etag, "x-admin-actor": "ra­fa" }), "7", "approve", d);
    expect(d.apply).toHaveBeenCalledWith(expect.anything(), "approve", "ra fa", undefined);
    const d2 = deps();
    await handleDecision(req(`Bearer ${ADMIN}`, { "if-match": etag }), "7", "reject", d2);
    expect(d2.apply).toHaveBeenCalledWith(expect.anything(), "reject", "admin", undefined);
  });

  it("returns a generic 500 and logs only the message when something throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = deps({ loadClaim: async () => { throw Object.assign(new Error("select * from claims where password=hunter2"), { sql: "SECRET SQL" }); } });
    const res = await handleDecision(req(`Bearer ${ADMIN}`, { "if-match": etag }), "7", "approve", boom);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET SQL");
    log.mockRestore();
  });
});

describe("batch decisions", () => {
  const second = { ...claim, id: 8, toolId: 4 };
  const batchDeps = (apply = vi.fn(async () => true)) =>
    deps({ loadClaim: async (id: number) => (id === 7 ? claim : id === 8 ? second : null), apply });
  const items = [{ id: 7, etag }, { id: 8, etag: claimEtag(second) }];

  it("decides several claims, passes the reason and keeps going when one fails", async () => {
    const apply = vi.fn(async () => true);
    const r = await decideBatch("approve", [...items, { id: 9, etag }], { actor: "rafa", reason: "same operator" }, batchDeps(apply));
    expect(r).toMatchObject({ decided: 2, failed: 1 });
    expect(r.results.map((x) => x.ok)).toEqual([true, true, false]);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }), "approve", "rafa", "same operator");
  });

  it("rejects in batch without checking the proofs", async () => {
    const d = batchDeps();
    const r = await decideBatch("reject", items, { actor: "a", reason: "spam" }, d);
    expect(r).toMatchObject({ decided: 2, failed: 0 });
    expect(d.checkProof).not.toHaveBeenCalled();
  });

  describe("HTTP", () => {
    beforeEach(() => {
      process.env.CRON_SECRET = CRON;
      process.env.ADMIN_SECRET = ADMIN;
      process.env.DATABASE_URL = "mysql://u:p@localhost:3306/db";
    });
    let n = 0;
    const post = (body: unknown, auth: string | null = `Bearer ${ADMIN}`) =>
      new Request("http://x/api/admin/claims/batch", {
        method: "POST",
        headers: { "x-forwarded-for": `41.0.${++n >> 8}.${n & 255}`, ...(auth ? { authorization: auth } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
    const good = { decision: "approve", reason: "checked", claims: items };

    it("requires the admin secret", async () => {
      expect((await handleBatch(post(good, null), batchDeps())).status).toBe(401);
      expect((await handleBatch(post(good, `Bearer ${CRON}`), batchDeps())).status).toBe(401);
    });

    it("validates the body", async () => {
      for (const bad of ["{", { ...good, decision: "x" }, { ...good, reason: " " }, { ...good, reason: undefined }, { ...good, claims: [] }, { ...good, claims: [{ id: 7, etag: "bad" }] }, { ...good, claims: [items[0], items[0]] }, { ...good, claims: Array.from({ length: 51 }, (_, i) => ({ id: i + 1, etag })) }]) {
        expect((await handleBatch(post(bad), batchDeps())).status).toBe(400);
      }
    });

    it("returns one result per claim", async () => {
      const res = await handleBatch(post(good), batchDeps());
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ decision: "approve", decided: 2, failed: 0 });
    });
  });
});
