import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_TOOLS } from "@/db/seed-data";
import { normalizeToolUrl } from "@/lib/claims/message";
import { CATEGORIES } from "@/lib/types";
import type { SeedStore } from "@/lib/seed";

const seed = vi.fn();
vi.mock("@/lib/seed", async (orig) => ({
  ...(await orig<typeof import("@/lib/seed")>()),
  seedUnclaimed: (...a: unknown[]) => (seed.getMockImplementation() ? seed(...a) : undefined),
}));

const N = SEED_TOOLS.length;

function memoryStore() {
  const tools: { id: number; slug: string; url: string; name: string; category: string }[] = [];
  const entries: { id: number; toolId: number; validatorName: string; sourceUrl: string }[] = [];
  const claimed = new Set<number>();
  const store: SeedStore = {
    findToolIdByUrl: async (url) => tools.find((t) => t.url === url)?.id ?? null,
    slugTaken: async (slug) => tools.some((t) => t.slug === slug),
    insertTool: async (t) => {
      tools.push({ id: tools.length + 1, slug: t.slug, url: t.url, name: t.name, category: t.category });
      return tools.length;
    },
    toolHasClaims: async (id) => claimed.has(id),
    seedEntriesOf: async (id) => entries.filter((e) => e.toolId === id),
    insertSeedEntry: async (e) => void entries.push({ id: entries.length + 1, toolId: e.toolId, validatorName: e.validatorName, sourceUrl: e.sourceUrl }),
    updateSeedEntry: async (id, e) => void Object.assign(entries.find((x) => x.id === id)!, e),
  };
  return { store, tools, entries, claimed };
}

const realSeed = async (store: SeedStore, entries?: typeof SEED_TOOLS) => {
  const actual = await vi.importActual<typeof import("@/lib/seed")>("@/lib/seed");
  return actual.seedUnclaimed(store, entries);
};

describe("seed data", () => {
  it("has canonical, unique urls and unique slugs", () => {
    expect(SEED_TOOLS).toHaveLength(27);
    for (const t of SEED_TOOLS) expect(normalizeToolUrl(t.url), t.url).toBe(t.url);
    expect(new Set(SEED_TOOLS.map((t) => t.url)).size).toBe(N);
    expect(new Set(SEED_TOOLS.map((t) => t.slug)).size).toBe(N);
  });

  it("has valid categories, https source pages and fields that fit their columns", () => {
    for (const t of SEED_TOOLS) {
      expect(CATEGORIES, t.name).toContain(t.category);
      expect(t.sourceUrl, t.name).toMatch(/^https:\/\/[^\s]+$/);
      expect(t.sourceUrl.length).toBeLessThanOrEqual(512);
      expect(t.name.length).toBeLessThanOrEqual(255);
      expect(t.validatorName.length).toBeLessThanOrEqual(255);
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("seedUnclaimed", () => {
  it("loads every entry once and is idempotent on repeat", async () => {
    const m = memoryStore();
    expect(await realSeed(m.store)).toEqual({ tools: N, newTools: N, newEntries: N, updatedEntries: 0, skippedClaimed: 0 });
    expect(await realSeed(m.store)).toEqual({ tools: N, newTools: 0, newEntries: 0, updatedEntries: 0, skippedClaimed: 0 });
    expect(m.tools).toHaveLength(N);
    expect(m.entries).toHaveLength(N);
  });

  it("never modifies a tool that has claims (it keeps its name, category and seed entry)", async () => {
    const m = memoryStore();
    const first = SEED_TOOLS[0];
    m.tools.push({ id: 1, slug: first.slug, url: first.url, name: "Renamed by owner", category: "Meta" });
    m.entries.push({ id: 1, toolId: 1, validatorName: "Old name", sourceUrl: "https://old.example" });
    m.claimed.add(1);
    const r = await realSeed(m.store);
    expect(r).toMatchObject({ newTools: N - 1, newEntries: N - 1, updatedEntries: 0, skippedClaimed: 1 });
    expect(m.tools[0]).toMatchObject({ name: "Renamed by owner", category: "Meta" });
    expect(m.entries[0]).toMatchObject({ validatorName: "Old name", sourceUrl: "https://old.example" });
  });

  it("updates validator name and source url of an existing unclaimed seed entry, keeping the tool", async () => {
    const m = memoryStore();
    const s = SEED_TOOLS.find((x) => x.slug === "stakewiz")!;
    m.tools.push({ id: 1, slug: s.slug, url: s.url, name: "Stakewiz (kept)", category: "Explorer" });
    m.entries.push({ id: 1, toolId: 1, validatorName: "Laine", sourceUrl: "https://stakewiz.com" });
    const r = await realSeed(m.store, [s]);
    expect(r).toMatchObject({ newTools: 0, newEntries: 0, updatedEntries: 1, skippedClaimed: 0 });
    expect(m.entries).toEqual([{ id: 1, toolId: 1, validatorName: s.validatorName, sourceUrl: s.sourceUrl }]);
    expect(m.tools[0].name).toBe("Stakewiz (kept)");
    expect(m.entries).toHaveLength(1);
  });

  it("adds a seed entry to an existing tool that has none", async () => {
    const m = memoryStore();
    const s = SEED_TOOLS[1];
    m.tools.push({ id: 1, slug: s.slug, url: s.url, name: s.name, category: s.category });
    expect(await realSeed(m.store, [s])).toMatchObject({ newTools: 0, newEntries: 1, updatedEntries: 0 });
  });

  it("avoids slug collisions with a different url", async () => {
    const m = memoryStore();
    m.tools.push({ id: 1, slug: SEED_TOOLS[0].slug, url: "github.com/someone/else", name: "Other", category: "Library" });
    await realSeed(m.store, [SEED_TOOLS[0]]);
    expect(m.tools.map((t) => t.slug)).toEqual([SEED_TOOLS[0].slug, `${SEED_TOOLS[0].slug}-2`]);
    expect(m.tools[0].name).toBe("Other");
  });
});

describe("POST /api/admin/seed", () => {
  const ADMIN = "a".repeat(32);

  beforeEach(() => {
    process.env.CRON_SECRET = "c".repeat(32);
    process.env.ADMIN_SECRET = ADMIN;
    process.env.DATABASE_URL = "mysql://u:p@localhost:3306/db";
    seed.mockReset();
  });

  const call = async (auth?: string) => {
    const { POST } = await import("@/app/api/admin/seed/route");
    return POST(new Request("http://x/api/admin/seed", { method: "POST", headers: auth ? { authorization: auth } : {} }));
  };

  it("requires ADMIN_SECRET (cron secret and anonymous callers get 401, nothing is seeded)", async () => {
    seed.mockResolvedValue({});
    for (const a of [undefined, "Bearer nope", `Bearer ${"c".repeat(32)}`]) expect((await call(a)).status).toBe(401);
    expect(seed).not.toHaveBeenCalled();
  });

  it("seeds and reports the counts", async () => {
    seed.mockResolvedValue({ tools: 7, newTools: 7, newEntries: 7, updatedEntries: 0, skippedClaimed: 0 });
    const res = await call(`Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tools: 7, newTools: 7, newEntries: 7, updatedEntries: 0, skippedClaimed: 0 });
  });

  it("returns a generic 500 on failure", async () => {
    seed.mockRejectedValue(new Error("db password leaked here"));
    const res = await call(`Bearer ${ADMIN}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("leaked");
  });
});
