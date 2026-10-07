// Usage: npm run db:seed   (idempotent; needs DATABASE_URL)
import { seedUnclaimed } from "@/lib/seed";

async function main() {
  const r = await seedUnclaimed();
  console.log(`seed done: ${r.tools} tools (${r.newTools} new), ${r.newEntries} new entries`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
