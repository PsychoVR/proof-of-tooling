import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_TOOLS } from "@/db/seed-data";
import type { SeedStore } from "@/lib/seed";

const seed = vi.fn();
vi.mock("@/lib/seed", async (orig) => ({
  ...(await orig<typeof import("@/lib/seed")>()),
  seedUnclaimed: (...a: unknown[]) => (seed.getMockImplementation() ? seed(...a) : undefined),
}));

function memoryStore() {
  const tools: { id: number; slug: string; url: string; name: string; category: string }[] = [];
  const entries: { toolId: number; validatorName: string }[] = [];
  const store: SeedStore = {
    findToolIdByUrl: async (url) => tools.find((t) => t.url === url)?.id ?? null,
    slugTaken: async (slug) => tools.some((t) => t.slug === slug),
    insertTool: async (t) => {
      tools.push({ id: tools.length + 1, slug: t.slug, url: t.url, name: t.name, category: t.category });
      return tools.length;
    },
    seedEntryExists: async (id, name) => entries.some((e) => e.toolId === id && e.validatorName === name),
    insertSeedEntry: async (e) => void entries.push({ toolId: e.toolId, validatorName: e.validatorName }),
  };
  return { store, tools, entries };
}

const realSeed = async (store: SeedStore, entries?: typeof SEED_TOOLS) => {
  const actual = await vi.importActual<typeof import("@/lib/seed")>("@/lib/seed");
  return actual.seedUnclaimed(store, entries);
};

describe("seedUnclaimed", () => {
  it("loads every entry once and is idempotent on repeat", async () => {
    const m = memoryStore();
    expect(await realSeed(m.store)).toEqual({ tools: 7, newTools: 7, newEntries: 7 });
    expect(await realSeed(m.store)).toEqual({ tools: 7, newTools: 0, newEntries: 0 });
    expect(m.tools).toHaveLength(7);
    expect(m.entries).toHaveLength(7);
  });

  it("never modifies a tool that already exists (e.g. one that was claimed)", async () => {
    const m = memoryStore();
    const first = SEED_TOOLS[0];
    m.tools.push({ id: 1, slug: first.slug, url: first.url, name: "Renamed by owner", category: "Meta" });
    const r = await realSeed(m.store);
    expect(r).toMatchObject({ newTools: 6, newEntries: 7 });
    expect(m.tools[0]).toMatchObject({ name: "Renamed by owner", category: "Meta" });
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
    seed.mockResolvedValue({ tools: 7, newTools: 7, newEntries: 7 });
    const res = await call(`Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tools: 7, newTools: 7, newEntries: 7 });
  });

  it("returns a generic 500 on failure", async () => {
    seed.mockRejectedValue(new Error("db password leaked here"));
    const res = await call(`Bearer ${ADMIN}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("leaked");
  });
});
