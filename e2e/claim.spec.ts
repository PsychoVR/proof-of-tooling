import { expect, test, type Page } from "@playwright/test";
import { verifyClaimSignature } from "../lib/claims";
import fixture from "../tests/fixtures/cli-signatures.json";
import { gotoHydrated, watchConsole } from "./helpers";

const valid = fixture.cases.find((c) => c.name === "valid-claim")!;
const stale = fixture.cases.find((c) => c.name === "stale-date")!;
const unclaim = fixture.cases.find((c) => c.name === "valid-unclaim")!;
const TOOL = "github.com/psychovr/proof-of-tooling";

test.describe.configure({ mode: "serial" });

async function fillStep1(page: Page) {
  await gotoHydrated(page, "/claim");
  await page.locator("#c-name").fill("Proof of Tooling");
  await page.locator("#c-cat").selectOption("Meta");
  await page.locator("#c-url").fill(`https://www.${TOOL}/`); // normalized by the wizard
  await page.locator("#c-id").fill(fixture.identity);
  await page.getByRole("button", { name: "Generate claim" }).click();
}

test("a stale-dated real signature is rejected on the date check", async ({ request }) => {
  const res = await request.post("/api/v1/claims/check", { data: { message: stale.message, signature: stale.signature } });
  expect(res.status()).toBe(200); // dry runs report failures in the body
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(body.checks.find((c: { ok: boolean }) => !c.ok).id).toBe("date");
});

test("wizard: valid CLI signature verifies and registers end to end", async ({ page }) => {
  const c = watchConsole(page);
  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00Z"));
  await fillStep1(page);

  // Step 2 shows exactly the line the CLI signed in the fixture (URL normalized, today's date).
  await expect(page.getByText(valid.message).first()).toBeVisible();
  // The ownership block comes before signing, with the prefilled GitHub link and the JSON to copy.
  await expect(page.getByRole("heading", { name: "Prove you own this tool" })).toBeVisible();
  const link = page.getByRole("link", { name: "Create proof file on GitHub" });
  await expect(link).toHaveAttribute("href", /^https:\/\/github\.com\/psychovr\/proof-of-tooling\/new\/[^?]+\?filename=\.proof-of-tooling\.json&value=/);
  await expect(page.getByText(`"identities"`).first()).toBeVisible();
  await expect(page.getByText("covers all your repos")).toBeVisible();
  await page.getByRole("button", { name: "I have the signature" }).click();

  // A signature for a different message fails the check.
  await page.locator("#c-sig").fill(stale.signature);
  await page.getByRole("button", { name: "Verify signature" }).click();
  await expect(page.getByText("Some checks failed.")).toBeVisible();

  // The real fixture passes every server check, not the simulated preview.
  await page.locator("#c-sig").fill(valid.signature);
  await page.getByRole("button", { name: "Verify signature" }).click();
  await expect(page.getByText("All checks passed.")).toBeVisible();
  await expect(page.getByText(/simulated/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Register claim" }).click();
  await expect(page.getByRole("heading", { name: "Claim registered" })).toBeVisible();

  // The success screen links to the tool page and the profile, and offers a prefilled post on X.
  await expect(page.getByRole("link", { name: "View the tool page" })).toHaveAttribute("href", "/t/github-com-psychovr-proof-of-tooling");
  await expect(page.getByRole("link", { name: "View your validator profile" })).toHaveAttribute("href", `/v/${fixture.identity}`);
  const share = new URL((await page.getByRole("link", { name: "Share on X" }).getAttribute("href"))!);
  expect(share.origin + share.pathname).toBe("https://x.com/intent/post");
  const post = share.searchParams.get("text")!;
  expect(post).toContain("@proofoftooling");
  expect(post).toContain("https://tooling.sunshinevr.io/t/github-com-psychovr-proof-of-tooling");
  expect(post).toContain("Proof of Tooling");
  await page.getByRole("link", { name: "View the tool page" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Proof of Tooling" })).toBeVisible();

  // The claim appears in the profile, the leaderboard, the odometer and the registry.
  await page.goto(`/v/${fixture.identity}`);
  await expect(page.locator(".status", { hasText: "✓ Signed" })).toBeVisible();
  await expect(page.getByText(TOOL)).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("img", { name: /^8 tools built by validators/ })).toBeVisible();
  await expect(page.locator("tbody tr", { hasText: "SunshineVR" })).toContainText("Signed");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  const reg = await (await page.request.get("/registry.json")).json();
  const entry = reg.entries.find((e: { message: string }) => e.message === valid.message);
  expect(entry).toMatchObject({ identity: fixture.identity, cluster: "mainnet", signature: valid.signature, status: "active" });
  expect(entry.tool.category).toBe("Meta");
  // Anyone can re-verify the published registry without trusting the server.
  for (const e of reg.entries as { message: string; signature: string; identity: string }[]) {
    const r = verifyClaimSignature({ message: e.message, signature: e.signature, identity: e.identity, now: new Date("2026-10-07T12:00:00Z") });
    if (e.message === valid.message) expect(r.ok).toBe(true);
  }
  c.expectClean();
});

test("wizard: sites get three accessible proof methods", async ({ page }) => {
  await gotoHydrated(page, "/claim");
  await page.locator("#c-name").fill("Pool dashboard");
  await page.locator("#c-url").fill("pool.example.com/watch");
  await page.locator("#c-id").fill(fixture.identity);
  await page.getByRole("button", { name: "Generate claim" }).click();
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "DNS TXT" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText(`proof-of-tooling=${fixture.identity}`);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tabpanel")).toContainText('<meta name="proof-of-tooling"');
});

test("registering the same claim twice is idempotent", async ({ request }) => {
  const data = { message: valid.message, signature: valid.signature, category: "Meta", toolName: "Proof of Tooling" };
  expect((await request.post("/api/v1/claims", { data })).status()).toBe(200);
  expect((await request.post("/api/v1/claims", { data })).status()).toBe(200);
  const reg = await (await request.get("/registry.json")).json();
  expect(reg.entries.filter((e: { message: string }) => e.message === valid.message)).toHaveLength(1);
});

test("a tampered message is rejected", async ({ request }) => {
  const res = await request.post("/api/v1/claims", {
    data: { message: valid.message.replace("psychovr", "psychovq"), signature: valid.signature },
  });
  expect(res.status()).toBe(422); // registering is an HTTP error; the dry run is not
});

test("unclaim with the real fixture withdraws the claim", async ({ request }) => {
  const res = await request.post("/api/v1/claims", { data: { message: unclaim.message, signature: unclaim.signature } });
  expect(res.status()).toBe(200);
  const reg = await (await request.get("/registry.json")).json();
  expect(reg.entries.find((e: { message: string }) => e.message === valid.message)).toBeUndefined();
});
