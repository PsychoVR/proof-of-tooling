import { expect, test } from "@playwright/test";
import { DEV_VALIDATORS as V } from "../db/dev-data";
import { gotoHydrated, watchConsole } from "./helpers";

test.describe("home and leaderboard", () => {
  test("shows the total, the ranked leaderboard and no console errors", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto("/");
    await expect(page.getByRole("img", { name: /^7 tools built by validators/ })).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText("Pumpkin's Pool");
    await expect(rows.nth(1)).toContainText("Valid Blocks");
    await expect(rows.nth(2)).toContainText("Overclock");
    await expect(rows.nth(2)).toContainText("Signed");
    await expect(rows.nth(3)).toContainText("Stale");
    await expect(rows.nth(4)).toContainText("Unclaimed");
    await expect(page.getByText("Quiet Validator")).toHaveCount(0);
    c.expectClean();
  });

  test("filters by status, category and search", async ({ page }) => {
    await gotoHydrated(page, "/");
    const rows = page.locator("tbody tr");
    await page.getByRole("button", { name: "Signed", exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Overclock");
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByLabel("Filter by category").selectOption("Monitoring");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Pumpkin's Pool");
    await page.getByLabel("Filter by category").selectOption("all");
    await page.getByLabel("Search validator or tool").fill("stakewiz");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Laine");
    await page.getByLabel("Search validator or tool").fill("zzz-nothing");
    await expect(page.getByText("No validators match those filters.")).toBeVisible();
  });

  test("is scoped to Solana mainnet: no cluster filter or tags, pill says so", async ({ page }) => {
    await gotoHydrated(page, "/");
    await expect(page.locator(".pill")).toContainText("Solana mainnet");
    await expect(page.locator(".pill")).not.toContainText(/testnet|alpenglow/i);
    await expect(page.getByRole("group", { name: "Filter by cluster" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /testnet|alpenglow/i })).toHaveCount(0);
    await expect(page.locator(".cluster-tag")).toHaveCount(0);
    await expect(page.locator("tbody tr")).toHaveCount(5);
  });
});

test.describe("profiles and tools", () => {
  test("validator profile lists its tools and endorsements", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto(`/v/${V.overclock.identity}`);
    await expect(page.getByRole("heading", { name: "Overclock", level: 1 })).toBeVisible();
    await expect(page.getByText("github.com/Overclock-Validator/mithril")).toBeVisible();
    await expect(page.locator(".status", { hasText: "✓ Signed" })).toBeVisible();
    await page.goto(`/v/${V.pumpkin.identity}`);
    await expect(page.locator(".list", { hasText: V.pumpkin.identity })).toBeVisible(); // endorsement entry
    c.expectClean();
  });

  test("a validator without tools gets the claim call to action", async ({ page }) => {
    await page.goto(`/v/${V.quiet.identity}`);
    await expect(page.getByRole("heading", { name: "Quiet Validator", level: 1 })).toBeVisible();
    await expect(page.getByText("No tools listed for this validator yet.")).toBeVisible();
    await page.getByRole("link", { name: "Claim your first tool" }).click();
    await expect(page).toHaveURL(/\/claim$/);
  });

  test("a pending claim shows as In review without counting", async ({ page }) => {
    await page.goto(`/v/${V.blockLogic.identity}`);
    await expect(page.locator(".status", { hasText: "In review" })).toBeVisible();
    await page.goto("/t/new-tool");
    await expect(page.locator(".status", { hasText: "In review" }).first()).toBeVisible();
  });

  test("tool page shows the owner named by the seed entry", async ({ page }) => {
    await page.goto("/t/watchtower");
    await expect(page.getByRole("heading", { name: "Watchtower", level: 1 })).toBeVisible();
    await expect(page.getByText("Pumpkin's Pool")).toBeVisible();
    await expect(page.locator(".status", { hasText: "Unclaimed" }).first()).toBeVisible();
  });

  test("unknown validator and tool return 404", async ({ page }) => {
    expect((await page.goto(`/v/${"1".repeat(44)}`))?.status()).toBe(404);
    expect((await page.goto("/t/does-not-exist"))?.status()).toBe(404);
  });
});

test.describe("registry", () => {
  test("registry.json lists active and stale claims with message and signature, not pending", async ({ request }) => {
    const res = await request.get("/registry.json");
    expect(res.status()).toBe(200);
    const body = await res.json();
    const pairs = body.entries.map((e: { tool: { name: string }; status: string }) => [e.tool.name, e.status]);
    expect(pairs.sort()).toEqual([
      ["Mithril", "active"],
      ["Stakewiz", "stale"],
    ]);
    for (const e of body.entries) {
      expect(e.message).toMatch(/^proof-of-tooling v1 \| claim \| /);
      expect(e.signature.length).toBeGreaterThan(0);
    }
  });

  test("registry page renders", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto("/registry");
    await expect(page.getByRole("heading", { name: "Registry", level: 1 })).toBeVisible();
    await expect(page.getByText("Mithril").first()).toBeVisible();
    c.expectClean();
  });
});

test.describe("public API", () => {
  test("GET endpoints respond with the integrated shapes", async ({ request }) => {
    const stats = await (await request.get("/api/v1/stats")).json();
    expect(stats).toMatchObject({ toolsTotal: 7, toolsClaimed: 1, toolsUnclaimed: 6 });
    const lb = await (await request.get("/api/v1/validators")).json();
    expect(lb.total).toBe(5);
    const profile = await request.get(`/api/v1/validators/${V.quiet.identity}`);
    expect((await profile.json()).tools).toEqual([]);
    expect((await request.get("/api/v1/validators/not-a-key")).status()).toBe(400);
    const tools = await (await request.get("/api/v1/tools?status=claimed")).json();
    expect(tools.items.map((t: { name: string }) => t.name)).toEqual(["Mithril"]);
  });
});

test("@mobile 375px layout has no horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ["/", "/claim", "/registry", `/v/${V.overclock.identity}`, "/t/watchtower"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});

test("@mobile ledger renders one card per validator at 375px, with no horizontal scroll anywhere", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await gotoHydrated(page, "/");
  const rows = page.locator("table.ledger tbody tr");
  await expect(rows).toHaveCount(5);

  // Neither the page nor the table container scrolls sideways, and the table fits the viewport.
  const m = await page.evaluate(() => {
    const wrap = document.querySelector(".table-wrap") as HTMLElement;
    const table = document.querySelector("table.ledger") as HTMLElement;
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      wrap: wrap.scrollWidth - wrap.clientWidth,
      tableWidth: table.getBoundingClientRect().width,
    };
  });
  expect(m.page).toBeLessThanOrEqual(0);
  expect(m.wrap).toBeLessThanOrEqual(0);
  expect(m.tableWidth).toBeLessThanOrEqual(375);

  // Each card shows validator, a large count, the status pill and the tool chips, all inside the viewport.
  const card = rows.nth(2); // Overclock: one signed tool
  await expect(card.locator(".vname")).toHaveText("Overclock");
  await expect(card.locator(".status")).toHaveText("✓ Signed");
  await expect(card.locator(".tools .tool")).toHaveCount(1);
  const fontSize = await card.locator("td.count").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(30);
  for (const sel of [".vname", "td.count", ".status", ".tools .tool"]) {
    const box = await card.locator(sel).first().boundingBox();
    expect(box, sel).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${sel} inside viewport`).toBeLessThanOrEqual(375);
  }
  // Cards stack vertically instead of sharing a row.
  const ys = await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  expect(new Set(ys).size).toBe(5);

  // The header row is visually hidden but still available to assistive technology.
  await expect(page.getByRole("columnheader", { name: "Validator" })).toBeAttached();
});

test("ledger keeps the table layout above 640px", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await gotoHydrated(page, "/");
  const display = await page.locator("table.ledger tbody tr").first().evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe("table-row");
  await expect(page.getByRole("columnheader", { name: "Validator" })).toBeVisible();
});
