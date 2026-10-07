import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { seedEntries, tools } from "@/db/schema";
import { SEED_ADDED_BY, SEED_TOOLS, type SeedTool } from "@/db/seed-data";

export interface SeedStore {
  findToolIdByUrl: (url: string) => Promise<number | null>;
  slugTaken: (slug: string) => Promise<boolean>;
  insertTool: (t: Pick<SeedTool, "slug" | "url" | "name" | "category"> & { kind: "repo" | "web" }) => Promise<number>;
  seedEntryExists: (toolId: number, validatorName: string) => Promise<boolean>;
  insertSeedEntry: (e: { toolId: number; validatorName: string; sourceUrl: string; addedBy: string }) => Promise<void>;
}

export interface SeedReport {
  tools: number;
  newTools: number;
  newEntries: number;
}

const dbStore = (): SeedStore => {
  const db = getDb();
  return {
    findToolIdByUrl: async (url) => (await db.select({ id: tools.id }).from(tools).where(eq(tools.url, url)))[0]?.id ?? null,
    slugTaken: async (slug) => (await db.select({ id: tools.id }).from(tools).where(eq(tools.slug, slug))).length > 0,
    insertTool: async (t) => {
      const [res] = await db.insert(tools).values(t);
      return res.insertId;
    },
    seedEntryExists: async (toolId, validatorName) =>
      (
        await db
          .select({ id: seedEntries.id })
          .from(seedEntries)
          .where(and(eq(seedEntries.toolId, toolId), eq(seedEntries.validatorName, validatorName)))
      ).length > 0,
    insertSeedEntry: async (e) => {
      await db.insert(seedEntries).values(e);
    },
  };
};

/**
 * Loads the "unclaimed" entries. Idempotent: a tool is matched by its canonical url and never
 * modified (a claimed tool keeps its category and name); only missing tools and seed entries are added.
 */
export async function seedUnclaimed(store: SeedStore = dbStore(), entries: SeedTool[] = SEED_TOOLS): Promise<SeedReport> {
  const report: SeedReport = { tools: entries.length, newTools: 0, newEntries: 0 };
  for (const s of entries) {
    let toolId = await store.findToolIdByUrl(s.url);
    if (toolId === null) {
      let slug = s.slug;
      for (let n = 2; await store.slugTaken(slug); n++) slug = `${s.slug}-${n}`;
      const kind = s.url.startsWith("github.com/") ? "repo" : "web";
      toolId = await store.insertTool({ slug, url: s.url, name: s.name, category: s.category, kind });
      report.newTools++;
    }
    if (!(await store.seedEntryExists(toolId, s.validatorName))) {
      await store.insertSeedEntry({ toolId, validatorName: s.validatorName, sourceUrl: s.sourceUrl, addedBy: SEED_ADDED_BY });
      report.newEntries++;
    }
  }
  return report;
}
