// Usage: npm run db:seed   (idempotent; needs DATABASE_URL)
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { seedEntries, tools } from "@/db/schema";
import { SEED_ADDED_BY, SEED_TOOLS } from "./seed-data";

async function main() {
  const db = getDb();
  let created = 0;
  for (const s of SEED_TOOLS) {
    const kind = s.url.includes("github.com/") ? "repo" : "web";
    await db
      .insert(tools)
      .values({ slug: s.slug, url: s.url, name: s.name, category: s.category, kind })
      .onDuplicateKeyUpdate({ set: { name: s.name } });
    const [tool] = await db.select({ id: tools.id }).from(tools).where(eq(tools.url, s.url));
    const existing = await db
      .select({ id: seedEntries.id })
      .from(seedEntries)
      .where(and(eq(seedEntries.toolId, tool.id), eq(seedEntries.validatorName, s.validatorName)));
    if (existing.length === 0) {
      await db
        .insert(seedEntries)
        .values({ toolId: tool.id, validatorName: s.validatorName, sourceUrl: s.sourceUrl, addedBy: SEED_ADDED_BY });
      created++;
    }
  }
  console.log(`seed done: ${SEED_TOOLS.length} tools, ${created} new entries`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
