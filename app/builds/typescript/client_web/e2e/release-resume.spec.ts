import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const mode = process.env.RELEASE_MODE ?? "fake";
const statusLabels: Record<string, string> = { proposed: "На проверке", confirmed: "Подтверждено", rejected: "Отклонено", disputed: "Оспорено" };
const timecode = (milliseconds: number) => `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}`;

test(`${mode.toUpperCase()} restart resume: ordinary login and identical persisted workspace`, async ({ page }, info) => {
  test.skip(!process.env.RELEASE_BASE_URL || process.env.RELEASE_RESUME !== "1", "NOT_RUN: resume needs the restarted external candidate");
  info.annotations.push({ type: "provider", description: `${mode}; read-only workspace verification after operator-controlled restart; no provider call` });
  const expected = JSON.parse(await readFile(process.env.RELEASE_STATE_FILE ?? `/private/tmp/ryadom-release-browser-state-${mode}.json`, "utf8"));
  const loaded = ["/goals/demo", "/goals/demo/evidence", "/goals/demo/progress"].map((suffix) =>
    page.waitForResponse((response) => response.url().endsWith(suffix) && response.request().method() === "GET" && response.ok()));
  await page.goto("/app");
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
    for (const [index, item] of expected.evidence.entries()) {
      // Real GET order was compared with the checkpoint above; the all-events
      // UI preserves it, including when multiple events share the same summary.
      const card = page.locator(".gw-event").nth(index);
      await expect(card.getByRole("heading", { name: item.summary, exact: true })).toBeVisible();
      await expect(card.locator(".gw-event-criterion")).toHaveText(expected.goal.criteria.find((criterion: { id: string }) => criterion.id === item.criterionId).description);
      await expect(card.locator(".gw-status")).toHaveText(new RegExp(`^\\s*·?\\s*${statusLabels[item.status]}\\s*$`));
      const loadedSource = page.waitForResponse((response) => response.url().endsWith(`/sources/${encodeURIComponent(item.sourceId)}`) && response.request().method() === "GET" && response.ok());
      await card.getByRole("button", { name: /Посмотреть источник|Источник открыт/ }).click();
      const source = (await (await loadedSource).json()).source;
      expect(source.id).toBe(item.sourceId);
      expect(source.goalId).toBe(item.goalId);
      expect(source.text.slice(item.textStart, item.textEnd)).toBe(item.quote);
      await expect(page.locator("#gw-source mark")).toHaveText(item.quote);
      await expect(page.locator("#gw-source .gw-source-kind")).toHaveText(source.kind === "audio" ? "Расшифровка" : "Текст");
      if (item.startMs === null) {
        await expect(page.locator("#gw-source .gw-source-timecode")).toHaveCount(0);
      } else {
        await expect(page.locator("#gw-source .gw-source-timecode")).toHaveText(`Фрагмент ${timecode(item.startMs)} – ${timecode(item.endMs)}`);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
