import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { DEV_VALIDATORS as V, resetDevDb, seedDevData } from "@/db/dev-data";
import { claims, validatorIcons, validators } from "@/db/schema";
import { defaultIconDeps, refreshIconFor, runIcons } from "@/jobs/icons";
import { getLeaderboard, getValidatorProfile } from "@/lib/queries";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

beforeEach(async () => {
  await resetDevDb();
  await seedDevData();
  // Seed data gives Pumpkin's Pool a stored icon; these tests start from none.
  await getDb().delete(validatorIcons);
});
afterAll(async () => {
  await resetDevDb();
  await seedDevData();
});

const setIconUrl = (identity: string, iconUrl: string | null) => getDb().update(validators).set({ iconUrl }).where(eq(validators.identity, identity));

describe("validator icons", () => {
  it("fetches the icon of one validator on demand from its stored icon url", async () => {
    await setIconUrl(V.pumpkin.identity, "https://pumpkin.example/i.png");
    expect(await defaultIconDeps.iconUrlOf(V.pumpkin.identity)).toBe("https://pumpkin.example/i.png");
    expect(await defaultIconDeps.iconUrlOf(V.quiet.identity)).toBeNull();
    expect(await refreshIconFor(V.pumpkin.identity, { ...defaultIconDeps, fetchIcon: async () => ({ status: 200, body: PNG }) })).toBe("saved");
    const [row] = await getDb().select().from(validatorIcons);
    expect(row.identity).toBe(V.pumpkin.identity);
  });

  it("only verified validators (active claim) with an icon url are fetched", async () => {
    await setIconUrl(V.pumpkin.identity, "https://pumpkin.example/i.png"); // active claims
    await setIconUrl(V.laine.identity, "https://laine.example/i.png"); // stale claim only
    await setIconUrl(V.blockLogic.identity, "https://bl.example/i.png"); // pending claim only
    await setIconUrl(V.quiet.identity, "https://quiet.example/i.png"); // no claim
    await setIconUrl(V.overclock.identity, null); // active claim, no icon url
    expect(await defaultIconDeps.targets()).toEqual([{ identity: V.pumpkin.identity, iconUrl: "https://pumpkin.example/i.png" }]);
  });

  it("stores the icon, serves it as our own path, replaces it and drops it when the validator is no longer a target", async () => {
    await setIconUrl(V.pumpkin.identity, "https://pumpkin.example/i.png");
    const run = () => runIcons({ ...defaultIconDeps, fetchIcon: async () => ({ status: 200, body: PNG }) });
    expect(await run()).toMatchObject({ checked: 1, saved: 1 });

    const [row] = await getDb().select().from(validatorIcons);
    expect(row.contentType).toBe("image/png");
    expect(Buffer.compare(row.bytes, PNG)).toBe(0);

    const board = await getLeaderboard({});
    const pumpkin = board.items.find((r) => r.validator.identity === V.pumpkin.identity)!;
    expect(pumpkin.validator.iconUrl).toBe(`/api/validators/${V.pumpkin.identity}/icon`);
    expect(board.items.find((r) => r.validator.identity === V.overclock.identity)!.validator.iconUrl).toBeNull();
    expect((await getValidatorProfile(V.pumpkin.identity))!.validator.iconUrl).toBe(`/api/validators/${V.pumpkin.identity}/icon`);

    // Same bytes again: still one row. A later failure keeps it; a non-image removes it.
    await run();
    expect(await getDb().select().from(validatorIcons)).toHaveLength(1);
    await runIcons({ ...defaultIconDeps, fetchIcon: async () => { throw new Error("timeout"); } });
    expect(await getDb().select().from(validatorIcons)).toHaveLength(1);
    expect(await runIcons({ ...defaultIconDeps, fetchIcon: async () => ({ status: 200, body: Buffer.from("<svg/>") }) })).toMatchObject({ rejected: 1, removed: 1 });
    expect(await getDb().select().from(validatorIcons)).toHaveLength(0);

    // The icon is also dropped when the validator stops publishing a url.
    await run();
    await setIconUrl(V.pumpkin.identity, null);
    expect(await runIcons({ ...defaultIconDeps, fetchIcon: async () => ({ status: 200, body: PNG }) })).toMatchObject({ checked: 0, removed: 1 });
  });

  it("keeps a stale validator's icon hidden for 30 days, shows it again at once on recovery, and drops it after 30 days", async () => {
    const id = V.pumpkin.identity;
    await setIconUrl(id, "https://pumpkin.example/i.png");
    await runIcons({ ...defaultIconDeps, fetchIcon: async () => ({ status: 200, body: PNG }) });
    const run = () => runIcons({ ...defaultIconDeps, fetchIcon: async () => ({ status: 200, body: PNG }) });
    const iconOf = async () => (await getLeaderboard({})).items.find((r) => r.validator.identity === id)?.validator.iconUrl ?? null;
    const setClaims = (status: "active" | "stale", checked: Date) => getDb().update(claims).set({ status, lastCheckedAt: checked }).where(eq(claims.identity, id));

    await setClaims("stale", new Date());
    expect(await run()).toMatchObject({ checked: 0, removed: 0 });
    expect(await getDb().select().from(validatorIcons)).toHaveLength(1);
    expect(await iconOf()).toBeNull(); // hidden while no claim is active
    expect((await getValidatorProfile(id))!.validator.iconUrl).toBeNull();

    await setClaims("active", new Date());
    expect(await iconOf()).toBe(`/api/validators/${id}/icon`); // back at once, no download needed

    await setClaims("stale", new Date(Date.now() - 31 * 86_400_000));
    expect(await run()).toMatchObject({ removed: 1 });
    expect(await getDb().select().from(validatorIcons)).toHaveLength(0);
  });

  it("the third-party url never shows up in the profile", async () => {
    await setIconUrl(V.pumpkin.identity, "https://evil.example/track.png");
    expect(JSON.stringify(await getValidatorProfile(V.pumpkin.identity))).not.toContain("evil.example");
  });
});
