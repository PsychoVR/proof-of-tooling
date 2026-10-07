// Local development and test data: example validators and claims. Never run against production.
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, endorsements, seedEntries, tools, validators } from "@/db/schema";
import { SEED_ADDED_BY, SEED_TOOLS as ALL_SEED_TOOLS } from "./seed-data";

// Local and e2e data use a fixed subset of the real seed list, so adding entries to the list never
// shifts the counts the tests assert on.
const DEV_SEED_SLUGS = ["watchtower", "rugalert", "alpenglow-explorer", "solana-dashboards", "mithril", "stakewiz", "validators-app"];
const SEED_TOOLS = ALL_SEED_TOOLS.filter((s) => DEV_SEED_SLUGS.includes(s.slug));

type Db = ReturnType<typeof getDb>;

// Identity that signed tests/fixtures/cli-signatures.json. It was generated on testnet; the fixtures only
// provide signature bytes, so here it plays the part of a mainnet validator.
export const CLI_IDENTITY = "21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh";

export const DEV_VALIDATORS = {
  pumpkin: { identity: "5spY5Lqmm3v5Ass8nnhaDdtJymw1AxTHR1onds5m5HxN", vote: "C2TJptkEXbJFYuSiGZtW46CnW5e6w8hR1zQoPx1pEejD", name: "Pumpkin's Pool", stake: "900000000000000" },
  validBlocks: { identity: "6qdDDUonoiRaoUnQEfpUTmjVjxj3eVTVLWTuM8gDQjcW", vote: "DKujRQN8qPxvr4jhNgGe9sC3UqWzcx696NedSveo13UC", name: "Valid Blocks", stake: "700000000000000" },
  overclock: { identity: "Fn6s7tEXcZZeDSqJcKarepa7mmPCrUtBh77fheMBDvWF", vote: "Ec6dU6J2KtNS92rS7WX4s4aDV72nDPMDFPMVyWXFTi8F", name: "Overclock", stake: "500000000000000" },
  laine: { identity: "EzhAbPqVK1r7dQDUH9QxYNdqjJHijnNfvHRLep9uDhwS", vote: "7qfwF11N6FVBvqCvb9xrY64ap2QT6dLxQSCbPcioZwU7", name: "Laine", stake: "400000000000000" },
  blockLogic: { identity: "9AAD2Aizt2F3P3sFaq3TJjnKbrgyYujasSNPumC5uRtZ", vote: "HGb2yHbBVncotCHLQFVfLRFbgSjW9d4AdYhemymKtGwM", name: "Block Logic", stake: "300000000000000" },
  // Another validator that copies a real validator name (case and spacing changed) to try to pick up its seed entries.
  impostor: { identity: "DW874TTvzvWBU6k9b6mTcXZ22JPhmMe5CYqx1NwS9jiM", vote: "AUkriLSbDH3oWVFETj6SvyttNZiB4Lcq2gttxwqfmRM8", name: " overclock ", stake: "100000000000000" },
  quiet: { identity: "8ttnpLECYFDLBoH4vKtCCa31hgis1uPwSViJeXXJ5HzZ", vote: "txWBvLxu5DZN5xVGRzpPKJwrmkAwenoW62FZ7q5WB1P", name: "Quiet Validator", stake: "200000000000000" },
} as const;

const SIG = "1".repeat(88); // placeholder: stored claims are not re-verified by the read paths

/** Refuses to touch anything that is not the local docker database. */
export function assertLocalDb(url = process.env.DATABASE_URL ?? "") {
  const u = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || u.port !== "3307") {
    throw new Error(`Refusing to reset a database that is not localhost:3307 (got ${u.hostname}:${u.port})`);
  }
}

export async function resetDevDb(db: Db = getDb()) {
  assertLocalDb();
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const t of ["claim_failures", "claim_decisions", "endorsements", "claims", "seed_entries", "tools", "validators"]) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${t}\``));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
}

/** Seed entries from the prototype plus validators and claims in every state. */
export async function seedDevData(db: Db = getDb()) {
  for (const v of Object.values(DEV_VALIDATORS)) {
    await db.insert(validators).values({ identity: v.identity, cluster: "mainnet", voteAccount: v.vote, name: v.name, website: null, activatedStake: BigInt(v.stake), version: "3.0.0", delinquent: false });
  }
  await db.insert(validators).values({ identity: CLI_IDENTITY, cluster: "mainnet", voteAccount: "H6DuW2" + "1".repeat(38), name: "SunshineVR", website: "https://sunshinevr.io", activatedStake: BigInt("10000000000000"), version: "3.0.0", delinquent: false });

  for (const s of SEED_TOOLS) {
    const kind = s.url.startsWith("github.com/") ? "repo" : "web";
    await db.insert(tools).values({ slug: s.slug, url: s.url, name: s.name, category: s.category, kind });
    const [tool] = await db.select({ id: tools.id }).from(tools).where(eq(tools.url, s.url));
    await db.insert(seedEntries).values({ toolId: tool.id, validatorName: s.validatorName, sourceUrl: s.sourceUrl, addedBy: SEED_ADDED_BY });
  }
  const idOf = async (url: string) => (await db.select({ id: tools.id }).from(tools).where(eq(tools.url, url)))[0].id;
  const claim = (toolId: number, identity: string, url: string, status: "active" | "stale" | "pending") =>
    db.insert(claims).values({ toolId, identity, cluster: "mainnet", message: `proof-of-tooling v1 | claim | ${url} | ${identity} | 2026-10-06`, signature: SIG, signedDate: "2026-10-06", status });

  const mithril = SEED_TOOLS.find((s) => s.slug === "mithril")!.url;
  await claim(await idOf(mithril), DEV_VALIDATORS.overclock.identity, mithril, "active");
  for (const slug of ["watchtower", "rugalert"]) {
    const url = SEED_TOOLS.find((s) => s.slug === slug)!.url;
    await claim(await idOf(url), DEV_VALIDATORS.pumpkin.identity, url, "active");
  }
  const stakewiz = SEED_TOOLS.find((s) => s.slug === "stakewiz")!.url;
  await claim(await idOf(stakewiz), DEV_VALIDATORS.laine.identity, stakewiz, "stale");

  const pendingUrl = "github.com/blocklogic/new-tool";
  await db.insert(tools).values({ slug: "new-tool", url: pendingUrl, name: "New Tool", category: "Library", kind: "repo" });
  await claim(await idOf(pendingUrl), DEV_VALIDATORS.blockLogic.identity, pendingUrl, "pending");

  await db.insert(endorsements).values({ toolId: await idOf(mithril), identity: DEV_VALIDATORS.pumpkin.identity, message: "proof-of-tooling v1 | endorse", signature: SIG });
}
