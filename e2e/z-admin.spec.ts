import { expect, test } from "@playwright/test";
import { DEV_VALIDATORS as V } from "../db/dev-data";

const ADMIN = "e2e-admin-secret-0123456789abcdef";
const auth = { authorization: `Bearer ${ADMIN}` };

// Runs last (files run alphabetically): it consumes the pending claim that the browse specs look at.
test.describe.configure({ mode: "serial" });

test("admin endpoints reject anonymous, wrong and cron credentials", async ({ request }) => {
  const wrong: Record<string, string>[] = [{}, { authorization: "Bearer nope" }, { authorization: "Bearer local-dev-cron-secret-0123456789abcdef" }];
  for (const headers of wrong) {
    expect((await request.get("/api/admin/claims", { headers })).status()).toBe(401);
    expect((await request.post("/api/admin/claims/1/approve", { headers })).status()).toBe(401);
    expect((await request.post("/api/admin/seed", { headers })).status()).toBe(401);
  }
  // only POST on the mutating routes
  expect((await request.get("/api/admin/seed", { headers: auth })).status()).toBe(405);
});

test("lists pending claims with an etag and requires it to decide", async ({ request }) => {
  const list = await (await request.get("/api/admin/claims", { headers: auth })).json();
  expect(list.items).toHaveLength(1);
  const p = list.items[0];
  expect(p).toMatchObject({ toolName: "New Tool", identity: V.blockLogic.identity });

  expect((await request.post(`/api/admin/claims/${p.id}/approve`, { headers: auth })).status()).toBe(428);
  expect((await request.post(`/api/admin/claims/${p.id}/approve`, { headers: { ...auth, "if-match": "0".repeat(32) } })).status()).toBe(412);

  // reject with the reviewed etag, as a named actor
  const done = await request.post(`/api/admin/claims/${p.id}/reject`, { headers: { ...auth, "if-match": p.etag, "x-admin-actor": "e2e" } });
  expect(done.status()).toBe(200);
  expect(await done.json()).toEqual({ ok: true, id: p.id, status: "rejected" });
  expect((await request.post(`/api/admin/claims/${p.id}/reject`, { headers: { ...auth, "if-match": p.etag } })).status()).toBe(404);
  expect((await (await request.get("/api/admin/claims", { headers: auth })).json()).items).toEqual([]);
});

test("seed endpoint is idempotent: nothing new on a database that is already seeded", async ({ request }) => {
  const res = await request.post("/api/admin/seed", { headers: auth });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true, tools: 7, newTools: 0, newEntries: 0 });
});
