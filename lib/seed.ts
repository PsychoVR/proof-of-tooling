import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, seedEntries, tools } from "@/db/schema";
import { SEED_ADDED_BY, SEED_TOOLS, type SeedTool } from "@/db/seed-data";

export interface SeedStore {
  findToolIdByUrl: (url: string) => Promise<number | null>;
  slugTaken: (slug: string) => Promise<boolean>;
  insertTool: (t: Pick<SeedTool, "slug" | "url" | "name" | "category"> & { kind: "repo" | "web" }) => Promise<number>;
  /** True when the tool has any claim row (any status): such a tool is owned by a signature, not by the seed. */
  toolHasClaims: (toolId: number) => Promise<boolean>;
  seedEntriesOf: (toolId: number) => Promise<{ id: number; validatorName: string; sourceUrl: string }[]>;
  insertSeedEntry: (e: { toolId: number; validatorName: string; sourceUrl: string; addedBy: string }) => Promise<void>;
  updateSeedEntry: (id: number, e: { validatorName: string; sourceUrl: string }) => Promise<void>;
}

export interface SeedReport {
  tools: number;
  newTools: number;
  newEntries: number;
  updatedEntries: number;
  /** Tools left untouched because they have claims. */
  skippedClaimed: number;
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
    toolHasClaims: async (toolId) => (await db.select({ id: claims.id }).from(claims).where(eq(claims.toolId, toolId)).limit(1)).length > 0,
    seedEntriesOf: (toolId) =>
      db
        .select({ id: seedEntries.id, validatorName: seedEntries.validatorName, sourceUrl: seedEntries.sourceUrl })
        .from(seedEntries)
        .where(eq(seedEntries.toolId, toolId))
        .orderBy(seedEntries.id),
    insertSeedEntry: async (e) => {
      await db.insert(seedEntries).values(e);
    },
    updateSeedEntry: async (id, e) => {
      await db.update(seedEntries).set(e).where(eq(seedEntries.id, id));
    },
  };
};

/**
 * Loads the "unclaimed" entries. Idempotent: a tool is matched by its canonical url. Missing tools and
 * seed entries are added; the seed entry of an existing tool is brought up to date (validator name and
 * source url). A tool with any claim is never touched, so a claimed tool keeps its name and category.
 */
export async function seedUnclaimed(store: SeedStore = dbStore(), entries: SeedTool[] = SEED_TOOLS): Promise<SeedReport> {
  const report: SeedReport = { tools: entries.length, newTools: 0, newEntries: 0, updatedEntries: 0, skippedClaimed: 0 };
  for (const s of entries) {
    let toolId = await store.findToolIdByUrl(s.url);
    if (toolId === null) {
      let slug = s.slug;
      for (let n = 2; await store.slugTaken(slug); n++) slug = `${s.slug}-${n}`;
      const kind = s.url.startsWith("github.com/") ? "repo" : "web";
      toolId = await store.insertTool({ slug, url: s.url, name: s.name, category: s.category, kind });
      report.newTools++;
    } else if (await store.toolHasClaims(toolId)) {
      report.skippedClaimed++;
      continue;
    }
    const existing = await store.seedEntriesOf(toolId);
    if (existing.length === 0) {
      await store.insertSeedEntry({ toolId, validatorName: s.validatorName, sourceUrl: s.sourceUrl, addedBy: SEED_ADDED_BY });
      report.newEntries++;
      continue;
    }
    // One seed entry per tool: update the one that already names this validator, else the oldest.
    const target = existing.find((e) => e.validatorName === s.validatorName) ?? existing[0];
    if (target.validatorName !== s.validatorName || target.sourceUrl !== s.sourceUrl) {
      await store.updateSeedEntry(target.id, { validatorName: s.validatorName, sourceUrl: s.sourceUrl });
      report.updatedEntries++;
    }
  }
  return report;
}
