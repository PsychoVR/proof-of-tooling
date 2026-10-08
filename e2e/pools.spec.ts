import { expect, test } from "@playwright/test";
import { DEV_VALIDATORS as V } from "../db/dev-data";
import { gotoHydrated, watchConsole } from "./helpers";

test.describe("stake pool badges", () => {
  test("profile shows every badge in SOL order plus SFDP, with a tooltip on hover and focus", async ({ page }) => {
    const c = watchConsole(page);
    await gotoHydrated(page, `/v/${V.pumpkin.identity}`);
    const section = page.getByRole("region", { name: "Stake pools and programs" });
    await expect(section.getByRole("heading", { name: "Stake pools" })).toBeVisible();
    const badges = section.locator(".pool-badge:not(.sfdp)");
    await expect(badges).toHaveCount(5);
    await expect(badges.nth(0)).toHaveAttribute("aria-label", "Jito · 12,000 SOL delegated");
    await expect(badges.nth(0)).toHaveAttribute("title", "Jito · 12,000 SOL delegated");
    await expect(badges.nth(1)).toHaveAttribute("aria-label", "Marinade · 5,000 SOL delegated");
    await expect(badges.nth(4)).toHaveAttribute("aria-label", "The Vault · 150 SOL delegated");
    await expect(section.getByLabel("SFDP participant")).toContainText("SFDP participant");

    // hover
    await badges.nth(0).hover();
    await expect(page.locator(".pool-tip")).toHaveText("Jito · 12,000 SOL delegated");
    await page.mouse.move(0, 0);
    await expect(page.locator(".pool-tip")).toHaveCount(0);
    // keyboard focus
    await badges.nth(1).focus();
    await expect(page.locator(".pool-tip")).toHaveText("Marinade · 5,000 SOL delegated");
    await page.keyboard.press("Escape");
    await expect(page.locator(".pool-tip")).toHaveCount(0);
    c.expectClean();
  });

  test("the Solana Foundation badge replaces the SFDP label, on the profile and on the home row", async ({ page }) => {
    // Overclock is an Approved SFDP participant with 4,000 SOL from the Foundation: only the stake badge shows.
    await gotoHydrated(page, `/v/${V.overclock.identity}`);
    const section = page.getByRole("region", { name: "Stake pools and programs" });
    const badges = section.locator(".pool-badge");
    await expect(badges).toHaveCount(2);
    await expect(badges.nth(0)).toHaveAttribute("aria-label", "Solana Foundation · 4,000 SOL delegated");
    await expect(badges.nth(0)).toHaveAttribute("title", "Solana Foundation · 4,000 SOL delegated");
    await expect(badges.nth(0).locator(".pool-name")).toHaveText("Solana Foundation");
    await expect(badges.nth(1)).toHaveAttribute("aria-label", "Jito · 250 SOL delegated");
    await expect(page.getByLabel("SFDP participant")).toHaveCount(0);
    await badges.nth(0).hover();
    await expect(page.locator(".pool-tip")).toHaveText("Solana Foundation · 4,000 SOL delegated");

    await gotoHydrated(page, "/");
    const row = page.locator("tbody tr", { hasText: "Overclock" });
    await expect(row.locator(".pool-badge")).toHaveCount(2);
    await expect(row.locator(".pool-badge").first()).toHaveAttribute("aria-label", "Solana Foundation · 4,000 SOL delegated");
    await expect(row.getByLabel("SFDP participant")).toHaveCount(0);
  });

  test("SFDP participant is a chip of its own, apart from the last pool badge", async ({ page }) => {
    await gotoHydrated(page, `/v/${V.pumpkin.identity}`);
    const sfdp = page.locator(".pool-badge.sfdp");
    await expect(sfdp).toHaveCount(1);
    await expect(sfdp).toHaveClass(/chip/);
    const last = page.locator(".pool-badge:not(.sfdp)").last();
    const [a, b] = [await last.boundingBox(), await sfdp.boundingBox()];
    const gap = b!.y > a!.y + a!.height - 2 ? 99 : b!.x - (a!.x + a!.width); // wrapped to the next line, or beside it
    expect(gap).toBeGreaterThanOrEqual(4);
    const styles = await sfdp.evaluate((el) => {
      const c = getComputedStyle(el);
      return { border: c.borderTopWidth, radius: c.borderTopLeftRadius, bg: c.backgroundColor };
    });
    expect(styles.border).toBe("1px");
    expect(parseFloat(styles.radius)).toBeGreaterThan(10);
    expect(styles.bg).not.toBe("rgba(0, 0, 0, 0)");
    await gotoHydrated(page, "/");
    const row = page.locator("tbody tr", { hasText: "Pumpkin" });
    await expect(row.locator(".pool-badge.sfdp.chip")).toHaveText("SFDP");
  });

  test("every badge carries its SOL label in the server-rendered HTML, with no script needed", async ({ request }) => {
    // The label is data, not state: title and aria-label must be in the HTML a crawler or a no-JS browser gets.
    for (const path of [`/v/${V.pumpkin.identity}`, "/"]) {
      const html = await (await request.get(path)).text();
      const badges = [...html.matchAll(/<span[^>]*class="pool-badge[^"]*"[^>]*>/g)].map((m) => m[0]).filter((t) => !t.includes("pool-badge sfdp"));
      expect(badges.length, path).toBeGreaterThan(0);
      for (const tag of badges) {
        expect(tag, path).toMatch(/aria-label="[^"]*SOL delegated/);
        expect(tag, path).toMatch(/title="[^"]*SOL delegated/);
      }
    }
    const profile = await (await request.get(`/v/${V.overclock.identity}`)).text();
    expect(profile).toContain("Solana Foundation · 4,000 SOL delegated");
    expect(profile).not.toContain("SFDP participant");
  });

  test("profile with one pool and no SFDP, and profile with neither, show no empty block", async ({ page }) => {
    await page.goto(`/v/${V.quiet.identity}`);
    await expect(page.locator(".pool-section")).toHaveCount(0);
    await page.goto(`/v/${V.overclock.identity}`);
    const section = page.getByRole("region", { name: "Stake pools and programs" });
    await expect(section.locator(".pool-badge")).toHaveCount(2);
    await expect(page.getByLabel("SFDP participant")).toHaveCount(0);
    await page.goto(`/v/${V.validBlocks.identity}`);
    await expect(page.getByRole("heading", { name: V.validBlocks.name })).toBeVisible();
    await expect(page.locator(".pool-section")).toHaveCount(0);
    await expect(page.getByText("Stake pools")).toHaveCount(0);
  });

  test("home row shows three icons and +2 naming the rest, SFDP compact; no external requests", async ({ page }) => {
    const origin = new URL(page.context().browser() ? "http://localhost:3100" : "http://localhost:3100").origin;
    const foreign: string[] = [];
    page.on("request", (r) => {
      if (r.url().startsWith("http") && new URL(r.url()).origin !== origin) foreign.push(r.url());
    });
    await gotoHydrated(page, "/");
    const row = page.locator("tbody tr", { hasText: "Pumpkin's Pool" });
    await expect(row.locator(".pool-badge:not(.more):not(.sfdp)")).toHaveCount(3);
    const more = row.locator(".pool-badge.more");
    await expect(more).toHaveText("+2");
    const label = await more.getAttribute("aria-label");
    expect(label).toContain("JPool · 300 SOL delegated");
    expect(label).toContain("The Vault · 150 SOL delegated");
    await expect(row.getByLabel("SFDP participant")).toHaveText("SFDP");
    await more.focus();
    await expect(page.locator(".pool-tip")).toContainText("The Vault");
    const other = page.locator("tbody tr", { hasText: "Overclock" });
    await expect(other.locator(".pool-badge")).toHaveCount(2);
    await expect(other.locator(".pool-badge.more")).toHaveCount(0);
    for (const src of await page.locator(".pool-ico img").evaluateAll((els) => els.map((e) => e.getAttribute("src") ?? ""))) {
      expect(src).toMatch(/^\/pools\/[a-z-]+\.(png|svg)$/);
    }
    expect(foreign).toEqual([]);
  });

  test("@mobile badges fit at 375px without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const path of ["/", `/v/${V.pumpkin.identity}`]) {
      await gotoHydrated(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await gotoHydrated(page, "/");
    const row = page.locator("table.ledger tbody tr", { hasText: "Pumpkin's Pool" });
    await expect(row.locator(".pool-badge.more")).toHaveText("+2");
    const box = await row.locator(".pool-row").boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await row.locator(".pool-badge.more").focus();
    const tip = await page.locator(".pool-tip").boundingBox();
    expect(tip!.x).toBeGreaterThanOrEqual(0);
    expect(tip!.x + tip!.width).toBeLessThanOrEqual(375);
  });
});
