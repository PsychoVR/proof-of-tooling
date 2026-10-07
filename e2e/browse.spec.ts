import { expect, test } from "@playwright/test";
import { DEV_VALIDATORS as V } from "../db/dev-data";
import { gotoHydrated, watchConsole } from "./helpers";

test.describe("home and leaderboard", () => {
  test("shows the total, the ranked signed validators and the unclaimed list, with no console errors", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto("/");
    await expect(page.getByRole("img", { name: /^7 tools built by validators/ })).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Pumpkin's Pool");
    await expect(rows.nth(0).locator("td.count")).toHaveText("2");
    await expect(rows.nth(1)).toContainText("Overclock");
    await expect(rows.nth(1).locator(".status")).toHaveText("✓ Signed");
    // validators with only seed entries, stale or pending claims, or an impostor name, are not ranked
    for (const name of ["Valid Blocks", "Laine", "Block Logic", "Quiet Validator"]) await expect(rows.filter({ hasText: name })).toHaveCount(0);
    await expect(page.getByText(V.impostor.identity)).toHaveCount(0);
    c.expectClean();
  });

  test("unclaimed tools are plain text 'built by' entries, never linked to a validator", async ({ page }) => {
    await page.goto("/");
    const panel = page.locator("#unclaimed");
    await expect(panel).toBeVisible();
    await expect(panel.locator("li")).toHaveCount(4);
    await expect(panel.locator("li", { hasText: "Alpenglow Explorer" })).toContainText("Unclaimed · built by Valid Blocks");
    await expect(panel.locator("li", { hasText: "Stakewiz" })).toContainText("Unclaimed · built by Laine");
    await expect(panel.locator('a[href^="/v/"]')).toHaveCount(0); // no profile links
    // every attribution links to its public source page
    const source = panel.locator("li", { hasText: "Alpenglow Explorer" }).getByRole("link", { name: "Source" });
    await expect(source).toHaveAttribute("href", /^https:\/\/.+/);
    await expect(source).toHaveAttribute("rel", /noopener/);
    await expect(panel.getByRole("link", { name: "Source" })).toHaveCount(4);
    await expect(panel.locator('a[href^="/t/"]')).toHaveCount(4); // only tool pages
  });

  test("avatars are initials only: no remote images anywhere", async ({ page }) => {
    for (const path of ["/", `/v/${V.overclock.identity}`, "/registry"]) {
      await page.goto(path);
      await expect(page.locator("main img, .avatar img")).toHaveCount(0);
    }
    await page.goto("/");
    await expect(page.locator(".avatar").first()).toHaveText(/^[A-Z]$/);
  });

  test("filters by status, category and search", async ({ page }) => {
    await gotoHydrated(page, "/");
    const rows = page.locator("tbody tr");
    const unclaimed = page.locator("#unclaimed li");
    await page.getByRole("button", { name: "Signed", exact: true }).click();
    await expect(rows).toHaveCount(2);
    await expect(page.locator("#unclaimed")).toHaveCount(0);
    await page.getByRole("button", { name: "Unclaimed", exact: true }).click();
    await expect(page.locator("table.ledger")).toHaveCount(0);
    await expect(unclaimed).toHaveCount(4);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByLabel("Filter by category").selectOption("Explorer");
    await expect(page.getByText("No validators match those filters.")).toBeVisible(); // no signed Explorer tool
    await expect(unclaimed).toHaveCount(3);
    await page.getByLabel("Filter by category").selectOption("Monitoring");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Pumpkin's Pool");
    await page.getByLabel("Filter by category").selectOption("all");
    await page.getByLabel("Search validator or tool").fill("laine"); // matches the owner text of an unclaimed tool
    await expect(unclaimed).toHaveCount(1);
    await page.getByLabel("Search validator or tool").fill("zzz-nothing");
    await expect(page.getByText("No validators match those filters.")).toBeVisible();
    await expect(unclaimed).toHaveCount(0);
  });

  test("is scoped to Solana mainnet: no cluster filter or tags, pill says so", async ({ page }) => {
    await gotoHydrated(page, "/");
    await expect(page.locator(".pill")).toContainText("Solana mainnet");
    await expect(page.locator(".pill")).not.toContainText(/testnet|alpenglow/i);
    await expect(page.getByRole("group", { name: "Filter by cluster" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /testnet|alpenglow/i })).toHaveCount(0);
    await expect(page.locator(".cluster-tag")).toHaveCount(0);
  });
});

test.describe("profiles and tools", () => {
  test("validator profile lists its signed tools and endorsements", async ({ page }) => {
    const c = watchConsole(page);
    await page.goto(`/v/${V.overclock.identity}`);
    await expect(page.getByRole("heading", { name: "Overclock", level: 1 })).toBeVisible();
    await expect(page.getByText("github.com/overclock-validator/mithril")).toBeVisible();
    await expect(page.locator(".status", { hasText: "✓ Signed" })).toBeVisible();
    await page.goto(`/v/${V.pumpkin.identity}`);
    await expect(page.locator(".list li")).toHaveCount(3); // 2 signed tools + 1 endorsement
    await expect(page.locator(".list", { hasText: V.pumpkin.identity })).toBeVisible();
    c.expectClean();
  });

  test("a validator without tools gets the claim call to action", async ({ page }) => {
    await page.goto(`/v/${V.quiet.identity}`);
    await expect(page.getByRole("heading", { name: "Quiet Validator", level: 1 })).toBeVisible();
    await expect(page.getByText("No tools listed for this validator yet.")).toBeVisible();
    await page.getByRole("link", { name: "Claim your first tool" }).click();
    await expect(page).toHaveURL(/\/claim$/);
  });

  test("a validator that copies another one's name gets none of its tools", async ({ page }) => {
    await page.goto(`/v/${V.impostor.identity}`);
    await expect(page.getByText("No tools listed for this validator yet.")).toBeVisible();
    await expect(page.getByText("Mithril")).toHaveCount(0);
  });

  test("a pending claim shows as In review without counting", async ({ page }) => {
    await page.goto(`/v/${V.blockLogic.identity}`);
    await expect(page.locator(".status", { hasText: "In review" })).toBeVisible();
    await page.goto("/t/new-tool");
    await expect(page.locator(".status", { hasText: "In review" }).first()).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("img", { name: /^7 tools/ })).toBeVisible();
  });

  test("tool page of an unclaimed tool says who built it as text, without a profile link", async ({ page }) => {
    await page.goto("/t/alpenglow-explorer");
    await expect(page.getByRole("heading", { name: "Alpenglow Explorer", level: 1 })).toBeVisible();
    await expect(page.getByText("Unclaimed · built by Valid Blocks")).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Source" })).toHaveAttribute("href", /^https:\/\/.+/);
    await expect(page.locator('main a[href^="/v/"]')).toHaveCount(0);
  });

  test("a signed tool links to the validator that signed it", async ({ page }) => {
    await page.goto("/t/watchtower");
    await expect(page.getByRole("link", { name: "Pumpkin's Pool" })).toHaveAttribute("href", `/v/${V.pumpkin.identity}`);
  });

  test("unknown validator and tool return 404", async ({ page }) => {
    expect((await page.goto(`/v/${"1".repeat(44)}`))?.status()).toBe(404);
    expect((await page.goto("/t/does-not-exist"))?.status()).toBe(404);
  });

  test("identities that are not public keys give a clean 404, not a 500 (N3)", async ({ request }) => {
    for (const bad of ["%C3%A9", "%E0%A4%A", "0".repeat(44), "1".repeat(31), `${V.overclock.identity}x`, "..%2F..%2Fetc", "%3Cscript%3E"]) {
      expect((await request.get(`/v/${bad}`)).status(), `/v/${bad}`).toBe(404);
    }
    for (const bad of ["%E0%A4%A", "UPPER", "a%20b"]) expect((await request.get(`/t/${bad}`)).status(), `/t/${bad}`).toBe(404);
  });

  test("the short identity sits next to validator names in the ranking, tool page and profile (N4)", async ({ page }) => {
    const short = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`;
    await page.goto("/");
    await expect(page.locator("tbody tr", { hasText: "Pumpkin's Pool" })).toContainText(short(V.pumpkin.identity));
    await expect(page.locator("tbody tr", { hasText: "Overclock" })).toContainText(short(V.overclock.identity));
    await page.goto("/t/watchtower");
    await expect(page.locator(".list li", { hasText: "Pumpkin's Pool" })).toContainText(short(V.pumpkin.identity));
    await page.goto(`/v/${V.overclock.identity}`);
    await expect(page.locator(".detail-head")).toContainText(short(V.overclock.identity));
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
      ["RugAlert", "active"],
      ["Stakewiz", "stale"],
      ["Watchtower", "active"],
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
    expect(stats).toMatchObject({ toolsTotal: 7, toolsClaimed: 3, toolsUnclaimed: 4, validatorsWithTools: 2 });
    const lb = await (await request.get("/api/v1/validators")).json();
    expect(lb.total).toBe(2);
    const profile = await request.get(`/api/v1/validators/${V.quiet.identity}`);
    expect((await profile.json()).tools).toEqual([]);
    expect((await request.get("/api/v1/validators/not-a-key")).status()).toBe(400);
    expect((await request.get("/api/v1/validators?cluster=testnet")).status()).toBe(400);
    const tools = await (await request.get("/api/v1/tools?status=claimed")).json();
    expect(tools.items.map((t: { name: string }) => t.name)).toEqual(["Mithril", "RugAlert", "Watchtower"]);
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
  await expect(rows).toHaveCount(2);

  // Neither the page nor the table container scrolls sideways, and the table fits the viewport.
  const m = await page.evaluate(() => {
    const wrap = document.querySelector(".table-wrap") as HTMLElement;
    const table = document.querySelector("table.ledger") as HTMLElement;
    const panel = document.querySelector("#unclaimed") as HTMLElement;
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      wrap: wrap.scrollWidth - wrap.clientWidth,
      tableWidth: table.getBoundingClientRect().width,
      panel: panel.scrollWidth - panel.clientWidth,
    };
  });
  expect(m.page).toBeLessThanOrEqual(0);
  expect(m.wrap).toBeLessThanOrEqual(0);
  expect(m.panel).toBeLessThanOrEqual(0);
  expect(m.tableWidth).toBeLessThanOrEqual(375);

  // Each card shows validator, a large count, the status pill and the tool chips, all inside the viewport.
  const card = rows.nth(1); // Overclock: one signed tool
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
  expect(new Set(ys).size).toBe(2);

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

test.describe("social metadata and icons", () => {
  const meta = (page: import("@playwright/test").Page, selector: string) => page.locator(selector).first().getAttribute("content");

  for (const [path, title] of [
    ["/", "Proof of Tooling"],
    ["/claim", "Claim a tool | Proof of Tooling"],
    ["/registry", "Registry | Proof of Tooling"],
    ["/t/watchtower", "Watchtower | Proof of Tooling"],
  ] as const) {
    test(`${path} has Open Graph and Twitter card tags`, async ({ page }) => {
      await page.goto(path);
      expect(await meta(page, 'meta[property="og:title"]')).toBe(title);
      expect(await meta(page, 'meta[property="og:description"]')).toBeTruthy();
      expect(await meta(page, 'meta[property="og:image"]')).toMatch(/\/og\.png$/);
      expect(await meta(page, 'meta[property="og:image:type"]')).toBe("image/png");
      expect(await meta(page, 'meta[name="twitter:image:alt"]')).toBeTruthy();
      expect(await meta(page, 'meta[name="twitter:card"]')).toBe("summary_large_image");
      expect(await meta(page, 'meta[name="twitter:site"]')).toBe("@proofoftooling");
      expect(await meta(page, 'meta[name="description"]')).toBeTruthy();
    });
  }

  test("the social image is a cached 1200x630 PNG", async ({ request }) => {
    const res = await request.get("/og.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect(res.headers()["cache-control"]).toContain("s-maxage");
    const body = await res.body();
    expect(body.length).toBeLessThan(300 * 1024);
    expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);
  });

  test("/og redirects to /og.png", async ({ request }) => {
    const res = await request.get("/og", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers().location).toBe("/og.png");
  });

  for (const ua of ["WhatsApp/2.23.20.0", "facebookexternalhit/1.1", "TelegramBot"]) {
    test(`link-preview crawler ${ua} sees og:image inside <head>`, async ({ request }) => {
      const res = await request.get("/", { headers: { "user-agent": ua } });
      expect(res.status()).toBe(200);
      const html = await res.text();
      const image = html.indexOf('property="og:image"');
      expect(image).toBeGreaterThan(-1);
      expect(image).toBeLessThan(html.indexOf("</head>"));
      const img = await request.get("/og.png", { headers: { "user-agent": ua } });
      expect(img.status()).toBe(200);
      expect(img.headers()["content-type"]).toBe("image/png");
      expect((await img.body()).length).toBeLessThan(300 * 1024);
    });
  }

  test("favicon and icons exist, and the footer links to the X profile", async ({ page, request }) => {
    expect((await request.get("/favicon.ico")).status()).toBe(200);
    expect((await request.get("/icon.svg")).status()).toBe(200);
    await page.goto("/");
    const link = page.locator("footer.site").getByRole("link", { name: /@proofoftooling/ });
    await expect(link).toHaveAttribute("href", "https://x.com/proofoftooling");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });
});
