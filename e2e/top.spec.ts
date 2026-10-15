import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { DEV_VALIDATORS as V, resetDevDb, seedDevData } from "../db/dev-data";
import { claims, tools } from "@/db/schema";
import { saveMonthlySnapshot } from "@/lib/top-queries";
import { gotoHydrated, watchConsole } from "./helpers";

// Changes the claims in the shared e2e database and puts the dev data back at the end.
test.describe.configure({ mode: "serial" });

let n = 0;
async function addClaim(identity: string, at: string) {
  const i = ++n;
  const [t] = await getDb().insert(tools).values({ slug: `e2e-top-${i}`, url: `e2e-top${i}.example.com`, name: `E2E Top ${i}`, category: "Library", kind: "web" }).$returningId();
  await getDb().insert(claims).values({ toolId: t.id, identity, cluster: "mainnet", message: `m${i}`, signature: "s", signedDate: "2026-09-01", status: "active", verifiedAt: new Date(at) });
}

test.afterAll(async () => {
  await resetDevDb();
  await seedDevData();
});

test("the board is hidden with fewer than 5 validators, on the home page and on /top", async ({ page }) => {
  const c = watchConsole(page);
  // dev data: only Overclock and Pumpkin's Pool hold active claims
  for (const path of ["/", "/top"]) {
    await gotoHydrated(page, path);
    const soon = page.locator(".top-soon");
    await expect(soon).toContainText("Top builders: coming soon. Claim your tools to get on the board");
    await expect(soon.getByRole("link", { name: "Claim a tool" })).toHaveAttribute("href", "/claim");
    await expect(page.locator(".podium")).toHaveCount(0);
  }
  c.expectClean();
});

test("with 5 validators it shows the podium, the list, the order and the tie-breaks", async ({ page }) => {
  // Valid Blocks 3 tools; Pumpkin 2 (dev data); then three validators with 1 tool, ordered by their first claim.
  await addClaim(V.validBlocks.identity, "2026-10-01T00:00:00Z");
  await addClaim(V.validBlocks.identity, "2026-10-02T00:00:00Z");
  await addClaim(V.validBlocks.identity, "2026-10-03T00:00:00Z");
  await addClaim(V.quiet.identity, "2020-01-01T00:00:00Z");
  await addClaim(V.laine.identity, "2026-10-04T00:00:00Z");
  await addClaim(V.blockLogic.identity, "2026-10-05T00:00:00Z");
  // the dev claims were made "now"; pin them so the tie-breaks do not depend on the clock
  await getDb().update(claims).set({ verifiedAt: new Date("2026-10-03T12:00:00Z") }).where(eq(claims.identity, V.overclock.identity));
  await getDb().update(claims).set({ verifiedAt: new Date("2026-09-01T00:00:00Z") }).where(eq(claims.identity, V.pumpkin.identity));
  const c = watchConsole(page);
  await gotoHydrated(page, "/top");

  const cards = page.locator(".podium > li");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("Valid Blocks");
  await expect(cards.nth(0)).toHaveAttribute("aria-label", "Number 1: Valid Blocks, 3 tools");
  await expect(cards.nth(1)).toContainText("Pumpkin's Pool");
  await expect(cards.nth(1).locator(".odometer")).toHaveAttribute("aria-label", /^2 tools/);
  await expect(cards.nth(1).locator(".pool-badge").first()).toBeVisible(); // stake badges on the podium
  await expect(cards.nth(1).locator(".avatar img")).toHaveCount(1); // Pumpkin has a stored icon
  // 1 tool each, so the earliest first claim wins: Quiet (2020), Overclock (Oct 3), Laine (Oct 4), Block Logic (Oct 5)
  const names = await page.locator(".podium-name, .toplist-name").allTextContents();
  expect(names.slice(0, 3)).toEqual(["Valid Blocks", "Pumpkin's Pool", "Quiet Validator"]);
  expect(names.slice(3)).toEqual(["Overclock", "Laine", "Block Logic"]);
  c.expectClean();
});

test("every row has a Share my rank link with the handle and the profile link", async ({ page }) => {
  await gotoHydrated(page, "/top");
  const links = page.getByRole("link", { name: /Share the rank of/ });
  await expect(links).toHaveCount(6);
  const first = links.first();
  await expect(first).toHaveText("Share my rank");
  const href = new URL((await first.getAttribute("href"))!);
  expect(href.searchParams.get("text")).toContain("@proofoftooling");
  expect(href.searchParams.get("text")).toContain("#1");
  expect(href.searchParams.get("url")).toBe(`https://tooling.sunshinevr.io/v/${V.validBlocks.identity}`);
  await expect(first).toHaveAttribute("target", "_blank");
  await expect(first).toHaveAttribute("rel", /noopener/);
});

test("the home page shows the same board as its own section", async ({ page }) => {
  await gotoHydrated(page, "/");
  const section = page.getByRole("region", { name: "Top builders" });
  await expect(section.locator(".podium > li")).toHaveCount(3);
  await expect(section.getByRole("link", { name: "Full ranking and archive" })).toHaveAttribute("href", "/top");
});

test("New this month lists the tools claimed in the current month with their validator", async ({ page }) => {
  await addClaim(V.laine.identity, new Date().toISOString());
  await gotoHydrated(page, "/top");
  const panel = page.locator(".new-month");
  await expect(panel.getByRole("heading", { name: "New this month" })).toBeVisible();
  await expect(panel.locator("li", { hasText: `E2E Top ${n}` })).toContainText("by Laine");
});

test("on day 1 the daily job freezes last month; the snapshot page, image and archive do not change afterwards", async ({ page, request }) => {
  // Everything counted so far was verified before 2026-10-01 for the purposes of this snapshot.
  await getDb().update(claims).set({ verifiedAt: new Date("2026-09-15T00:00:00Z") });
  expect(await saveMonthlySnapshot(new Date("2026-10-01T00:10:00Z"))).toBe("saved");
  await gotoHydrated(page, "/top/archive");
  await expect(page.getByRole("link", { name: "September 2026" })).toHaveAttribute("href", "/top/2026-09");

  await gotoHydrated(page, "/top/2026-09");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Top tool builders · September 2026");
  const before = await page.locator(".podium").innerText();
  await expect(page.locator(".podium > li").first()).toContainText("Valid Blocks");

  // claims change afterwards: the snapshot does not
  await getDb().update(claims).set({ status: "withdrawn" });
  await gotoHydrated(page, "/top/2026-09");
  expect(await page.locator(".podium").innerText()).toBe(before);
  expect(await saveMonthlySnapshot(new Date("2026-10-01T12:00:00Z"))).toBe("exists");

  const og = await request.get("/top/2026-09/og.png");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toBe("image/png");
  const png = await og.body();
  expect(png.readUInt32BE(16)).toBe(1200); // IHDR width
  expect(png.readUInt32BE(20)).toBe(675); // IHDR height
  await gotoHydrated(page, "/top/2026-09");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/top\/2026-09\/og\.png$/);

  expect((await request.get("/top/2026-08")).status()).toBe(404);
  expect((await request.get("/top/not-a-month")).status()).toBe(404);
  expect((await request.get("/top/2026-08/og.png")).status()).toBe(404);
});
