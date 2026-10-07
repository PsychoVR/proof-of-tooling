import { resetDevDb, seedDevData } from "../db/dev-data";

export default async function globalSetup() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // variables may come from the environment
  }
  await resetDevDb(); // refuses anything that is not the local docker database
  await seedDevData();
}
