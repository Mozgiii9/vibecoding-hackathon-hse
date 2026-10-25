import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const mode = process.env.RELEASE_MODE ?? "fake";

test(`${mode.toUpperCase()} restart resume: ordinary login and identical persisted workspace`, async ({ page }, info) => {
  test.skip(!process.env.RELEASE_BASE_URL || process.env.RELEASE_RESUME !== "1", "NOT_RUN: resume needs the restarted external candidate");
  info.annotations.push({ type: "provider", description: `${mode}; read-only workspace verification after operator-controlled restart; no provider call` });
  const expected = JSON.parse(await readFile(process.env.RELEASE_STATE_FILE ?? `/private/tmp/ryadom-release-browser-state-${mode}.json`, "utf8"));
  const loaded = ["/goals/demo", "/goals/demo/evidence", "/goals/demo/progress"].map((suffix) =>
    page.waitForResponse((response) => response.url().endsWith(suffix) && response.request().method() === "GET" && response.ok()));
  await page.goto("/");
  await expect(page.locator("#identifier")).toBeVisible();
  await expect(page.locator("#username")).toHaveCount(0);
  await page.locator("#identifier").fill(process.env.RELEASE_USERNAME ?? "release-synthetic-owner");
  await page.locator("#password").fill(process.env.RELEASE_PASSWORD ?? "Synthetic-Release-2026!");
  const loggedIn = page.waitForResponse((response) => response.url().endsWith("/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: /^(?:Sign in|Войти)$/ }).click();
  expect((await loggedIn).status()).toBe(200);
  const [goal, evidence, progress] = await Promise.all(loaded.map(async (response) => (await response).json()));
  expect({ ...goal, ...evidence, ...progress }, "Server state must equal the successful pre-restart browser checkpoint, including IDs/revisions/status/progress").toEqual(expected);
  await expect(page.getByRole("heading", { name: expected.goal.title, exact: true })).toBeVisible();
  await expect(page.locator(".gw-event")).toHaveCount(expected.evidence.length);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [index, criterion] of expected.goal.criteria.entries()) {
      const count = expected.progress.criteria.find((entry: { criterionId: string }) => entry.criterionId === criterion.id);
      await expect(page.getByRole("progressbar", { name: criterion.description, exact: true })).toHaveAttribute("aria-valuenow", String(Math.min(count.confirmedCount, count.targetCount)));
      await expect(page.locator(".gw-criteria > li").nth(index).locator(".gw-criterion-count strong")).toHaveText(String(count.confirmedCount));
    }
    for (const item of expected.evidence) {
      const card = page.locator(".gw-event").filter({ has: page.getByRole("heading", { name: item.summary, exact: true }) });
      await card.getByRole("button", { name: /Посмотреть источник|Источник открыт/ }).click();
      await expect(page.locator("#gw-source mark")).toHaveText(item.quote);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
