// Usage: npm run db:seed:dev   (local docker database only)
import { resetDevDb, seedDevData } from "./dev-data";

async function main() {
  await resetDevDb();
  await seedDevData();
  console.log("dev data seeded");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
