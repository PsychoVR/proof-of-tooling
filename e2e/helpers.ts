import { expect, type Page } from "@playwright/test";

/** Collects console errors and page errors; call `expectClean()` at the end of a test. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return { expectClean: () => expect(errors).toEqual([]) };
}

/** Navigates and waits until the client bundle has hydrated, so clicks are not lost in dev mode. */
export async function gotoHydrated(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}
