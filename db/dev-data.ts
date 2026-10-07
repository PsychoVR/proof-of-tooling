// Local development and test data: example validators and claims. Never run against production.
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, endorsements, seedEntries, tools, validators } from "@/db/schema";
import { SEED_ADDED_BY, SEED_TOOLS } from "./seed-data";

type Db = ReturnType<typeof getDb>;

// Identity of the CLI fixtures in tests/fixtures/cli-signatures.json (a testnet key).
export const CLI_IDENTITY = "21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh";

export const DEV_VALIDATORS = {
  pumpkin: { identity: "MASi45ub7Qe4ZE36UT5G6cU4ud8Fhhe4deS4F3cw9KTA", vote: "b8dLcukC7edhDQ7cn5d4gEYkbUrMWeWQLGsCmrG6dLaY", name: "Pumpkin's Pool", stake: "900000000000000" },
  validBlocks: { identity: "yNoVKf58ZTBqNAYT3j5qcdsyuMNmPfYetW5v6JXmj54o", vote: "mLidkuVKnRyjP2WPBg8Y4ErK9pGSSxY6BVScJy9uUxcJ", name: "Valid Blocks", stake: "700000000000000" },
  overclock: { identity: "nTPkyRFA6CAFjF1YveCHK1ATbQgdM9mwZgikp4Wzxrxk", vote: "tcSSSS7XhS4D5EVB8Nf471dAb7Qg25xEgRAhHPfQX88w", name: "Overclock", stake: "500000000000000" },
  laine: { identity: "YWXXL6A7pNpHXvmBa2EaQAmb2qaLix6mwHaQBPrFbbrZ", vote: "NhFgtsqwDtGuSptFDaYPo22sJXHDmfPVtoPQ6F7FXDNE", name: "Laine", stake: "400000000000000" },
  blockLogic: { identity: "Xgzgv1XiPti6vj8RsnqDXyCUshN6toSWSp6oBB92AezW", vote: "tiAgufXjPAcc921toi7ap9UxDuxE2HEKZGqeMHbTv94p", name: "Block Logic", stake: "300000000000000" },
  quiet: { identity: "PzWjeuzaTuyZ9bAaZ2xVrCf1rtACAXgo8c4MkaacXsr7", vote: "yc4GDJ3r7ZVc2qz5VMgZfZDmJVZbtXZGmayyHczDvV9T", name: "Quiet Validator", stake: "200000000000000" },
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
  for (const t of ["endorsements", "claims", "seed_entries", "tools", "validators"]) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${t}\``));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
}

/** Seed entries from the prototype plus validators and claims in every state. */
export async function seedDevData(db: Db = getDb()) {
  for (const v of Object.values(DEV_VALIDATORS)) {
    await db.insert(validators).values({ identity: v.identity, cluster: "mainnet", voteAccount: v.vote, name: v.name, website: null, activatedStake: BigInt(v.stake), version: "3.0.0", delinquent: false });
  }
  await db.insert(validators).values({ identity: CLI_IDENTITY, cluster: "testnet", voteAccount: "H6DuW2" + "1".repeat(38), name: "SunshineVR", website: "https://sunshinevr.io", activatedStake: BigInt("10000000000000"), version: "3.0.0", delinquent: false });

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
  const stakewiz = SEED_TOOLS.find((s) => s.slug === "stakewiz")!.url;
  await claim(await idOf(stakewiz), DEV_VALIDATORS.laine.identity, stakewiz, "stale");

  const pendingUrl = "github.com/blocklogic/new-tool";
  await db.insert(tools).values({ slug: "new-tool", url: pendingUrl, name: "New Tool", category: "Library", kind: "repo" });
  await claim(await idOf(pendingUrl), DEV_VALIDATORS.blockLogic.identity, pendingUrl, "pending");

  await db.insert(endorsements).values({ toolId: await idOf(mithril), identity: DEV_VALIDATORS.pumpkin.identity, message: "proof-of-tooling v1 | endorse", signature: SIG });
}
