import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import type { Evidence, Source } from "../../features/contracts.js";
import { observeReleaseAudioResponses, readReleaseAudioResponse } from "../../../../../scripts/release/browser-audio-observer.mjs";

const mode = process.env.RELEASE_MODE ?? "fake";
const username = process.env.RELEASE_USERNAME ?? "release-synthetic-owner";
const password = process.env.RELEASE_PASSWORD ?? "Synthetic-Release-2026!";
const title = "Приёмка: подготовиться к ML-собеседованию";
const intention = "Планирую отправить резюме на ML-стажировку завтра.";
const completed = "Сегодня я отправил резюме на ML-стажировку в компанию Учебный пример.";
const criteria = ["Отправить резюме", "Пройти пробные интервью", "Внести исправления по обратной связи"];
// Exact English A / Russian C (670ec69) auth copy; no permissive fallback.
const signupButton = /^(?:Create account|Создать аккаунт)$/;
const loginButton = /^(?:Sign in|Войти)$/;
const invalidCredentials = /^(?:Invalid username or password\.|Неверное имя пользователя или пароль\. Проверьте их и попробуйте снова\.)$/;

test.describe.configure({ mode: "serial" });

function recordMode(info: TestInfo) {
  info.annotations.push({ type: "provider", description: mode === "live" ? "LIVE Gemini (operator configured runtime); no browser response mocks" : "FAKE protocol provider; real auth/gateway/store; not live Gemini acceptance" });
}

async function authenticate(page: Page, allowSignup = false) {
  await page.goto("/app");
  await expect(page.locator("#username, #identifier")).toBeVisible();
  if (await page.locator("#username").isVisible()) {
    expect(allowSignup, "Signup must only happen on the first clean-runtime scenario").toBe(true);
    await page.locator("#username").fill(username);
    await page.locator("#new-password").fill(password);
    await page.locator("#confirm-password").fill(password);
    const response = page.waitForResponse((item) => item.url().endsWith("/auth/signup") && item.request().method() === "POST");
    await page.getByRole("button", { name: signupButton }).click();
    expect((await response).status()).toBe(201);
  } else {
    await page.locator("#identifier").fill(username);
    await page.locator("#password").fill(password);
    const response = page.waitForResponse((item) => item.url().endsWith("/auth/login") && item.request().method() === "POST");
    await page.getByRole("button", { name: loginButton }).click();
    expect((await response).status()).toBe(200);
  }
  await expect(page.getByRole("button", { name: "Выйти", exact: true })).toBeVisible();
}

async function createGoal(page: Page) {
  // A live acceptance run must use a fresh isolated memory root. Do not overwrite a real goal.
  await expect(page.getByLabel("Моя цель", { exact: true })).toBeVisible();
  await page.getByLabel("Моя цель", { exact: true }).fill(title);
  for (let index = 0; index < 3; index++) {
    const group = page.getByRole("group", { name: `Критерий ${index + 1}`, exact: true });
    await group.getByLabel("Действие", { exact: true }).fill(criteria[index]);
    await group.getByLabel("Сколько", { exact: true }).fill(index === 1 ? "2" : "1");
    await group.getByLabel("Единица", { exact: true }).fill(index === 1 ? "интервью" : "действие");
  }
  const response = page.waitForResponse((item) => item.url().endsWith("/goals/demo") && item.request().method() === "PUT");
  await page.getByRole("button", { name: "Подтвердить цель и критерии", exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(3);
}

async function progress(page: Page, counts: number[]) {
  for (let index = 0; index < counts.length; index++) {
    await expect(page.getByRole("progressbar", { name: criteria[index], exact: true })).toHaveAttribute("aria-valuenow", String(counts[index]));
    // The progressbar caps aria-valuenow at targetCount; the numeric label must
    // also remain exact, otherwise duplicate overcounting could be hidden.
    await expect(page.locator(".gw-criteria > li").nth(index).locator(".gw-criterion-count strong")).toHaveText(String(counts[index]));
  }
}

async function importText(page: Page, name: string, text: string) {
  await page.getByRole("button", { name: "Добавить контекст", exact: true }).click();
  await page.getByLabel("Название источника", { exact: true }).fill(name);
  await page.getByLabel("Текст источника", { exact: false }).fill(text);
  const response = page.waitForResponse((item) => item.url().endsWith("/context/import") && item.request().method() === "POST");
  await page.getByRole("button", { name: "Найти события", exact: true }).click();
  return response;
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Page must fit the mobile/desktop viewport").toBe(true);
}

function observeEvidenceReload(page: Page): Promise<Evidence[] | null> {
  // Observe the UI's own real GET. No extra API request, route interception or mock.
  return page.waitForResponse((response) => response.url().endsWith("/goals/demo/evidence") && response.request().method() === "GET" && response.ok())
    .then(async (response) => (await response.json()).evidence as Evidence[])
    .catch(() => null);
}

async function cardFromObservedOrder(page: Page, observed: Evidence[] | null, item: Evidence) {
  expect(observed, "The UI must reload the real ordered evidence list after import").not.toBeNull();
  const index = observed!.findIndex((entry) => entry.id === item.id);
  expect(index, "Imported evidence ID must exist in the server's ordered list").toBeGreaterThanOrEqual(0);
  expect(observed![index]).toMatchObject({ id: item.id, sourceId: item.sourceId, summary: item.summary, criterionId: item.criterionId, quote: item.quote });
  await expect(page.locator(".gw-event")).toHaveCount(observed!.length);
  const card = page.locator(".gw-event").nth(index);
  await expect(card.getByRole("heading", { name: item.summary, exact: true })).toBeVisible();
  const criterionIndex = ["cv", "mock", "feedback"].indexOf(item.criterionId);
  expect(criterionIndex).toBeGreaterThanOrEqual(0);
  await expect(card.locator(".gw-event-criterion")).toHaveText(criteria[criterionIndex]);
  return card;
}

function checkAudioGrounding(source: Source, evidence: Evidence[], durationSeconds: number) {
  for (const item of evidence) {
    expect(item.sourceId).toBe(source.id);
    expect(source.text.slice(item.textStart, item.textEnd)).toBe(item.quote);
    if (!source.segments.length) {
      expect(item.startMs).toBeNull();
      expect(item.endMs).toBeNull();
    } else if (item.startMs !== null) {
      // Each displayed time boundary must belong to the real STT segment that
      // contains that text boundary, rather than an estimated model timestamp.
      expect(source.segments.some((segment) => segment.textStart <= item.textStart && segment.textEnd > item.textStart && segment.startMs === item.startMs)).toBe(true);
      expect(source.segments.some((segment) => segment.textStart < item.textEnd && segment.textEnd >= item.textEnd && segment.endMs === item.endMs)).toBe(true);
      expect(item.endMs).not.toBeNull();
      expect(item.endMs!).toBeGreaterThanOrEqual(item.startMs);
      expect(item.endMs!).toBeLessThanOrEqual(Math.ceil(durationSeconds * 1000) + 1000);
    } else {
      expect(item.endMs).toBeNull();
    }
  }
}

const timecode = (milliseconds: number) => `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}`;

async function checkpointAfterReload(page: Page) {
  const paths = ["/goals/demo", "/goals/demo/evidence", "/goals/demo/progress"];
  const responses = paths.map((suffix) => page.waitForResponse((response) => response.url().endsWith(suffix) && response.request().method() === "GET" && response.ok()));
  await page.reload();
  const [goal, evidence, progress] = await Promise.all(responses.map(async (response) => (await response).json()));
  const checkpoint = { ...goal, ...evidence, ...progress };
  await writeFile(process.env.RELEASE_STATE_FILE ?? `/private/tmp/ryadom-release-browser-state-${mode}.json`, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });
  return checkpoint;
}

test(`${mode.toUpperCase()} ordinary signup/login → three criteria → intention/action/quote/confirm → mobile duplicate/reject/reload`, async ({ page }, info) => {
  test.setTimeout(mode === "live" ? 300_000 : 120_000);
  recordMode(info);
  test.skip(mode === "live" && process.env.RELEASE_ALLOW_LIVE_MUTATIONS !== "1", "NOT_RUN: live mutations need a dedicated clean runtime and explicit opt-in");
  await authenticate(page, true);
  await createGoal(page);
  await progress(page, [0, 0, 0]);
  await noOverflow(page);

  // Logout invalidates the real session. A wrong password cannot open the workspace.
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page.locator("#identifier")).toBeVisible();
  await page.locator("#identifier").fill(username);
  await page.locator("#password").fill("wrong-synthetic-password");
  const denied = page.waitForResponse((item) => item.url().endsWith("/auth/login") && item.request().method() === "POST");
  await page.getByRole("button", { name: loginButton }).click();
  expect((await denied).status()).toBe(401);
  await expect(page.getByText(invalidCredentials)).toBeVisible();
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  await authenticate(page);

  expect((await importText(page, "Синтетическое намерение", intention)).ok()).toBe(true);
  const plan = page.locator(".gw-event").filter({ hasText: "Намерение" });
  await expect(plan).toHaveCount(1);
  await expect(plan.getByRole("button", { name: "Подтвердить", exact: true })).toHaveCount(0);
  await progress(page, [0, 0, 0]);

  const orderedAfterImport = observeEvidenceReload(page);
  const imported = await importText(page, "Синтетическое выполненное действие", completed);
  const payload = await imported.json();
  expect(imported.ok(), `Import status=${imported.status()} code=${payload.error?.code ?? "none"}`).toBe(true);
  expect(payload.duplicate).toBe(false);
  const action = payload.evidence.find((item: { eventType: string; criterionId: string }) => item.eventType === "completed_action" && item.criterionId === "cv");
  expect(action, "The model must classify the concrete CV action").toBeTruthy();
  expect(payload.source.text.slice(action.textStart, action.textEnd)).toBe(action.quote);
  const card = await cardFromObservedOrder(page, await orderedAfterImport, action);
  await progress(page, [0, 0, 0]);
  await card.getByRole("button", { name: /Посмотреть источник|Источник открыт/ }).click();
  await expect(page.locator("#gw-source mark")).toHaveText(action.quote);
  await expect(page.locator("#gw-source .gw-source-document")).toContainText(completed);
  await expect(page.locator("#gw-source .gw-source-timecode")).toHaveCount(0);
  const reviewed = page.waitForResponse((item) => item.url().endsWith(`/evidence/${action.id}`) && item.request().method() === "PATCH");
  await card.getByRole("button", { name: "Подтвердить", exact: true }).click();
  const confirmedResponse = await reviewed;
  expect(confirmedResponse.ok()).toBe(true);
  const confirmed = (await confirmedResponse.json()).evidence;
  expect(confirmed).toMatchObject({ id: action.id, sourceId: action.sourceId, status: "confirmed", revision: action.revision + 1 });
  await progress(page, [1, 0, 0]);

  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  const countBefore = await page.locator(".gw-event").count();
  const repeated = await importText(page, "Повтор исходного действия", completed);
  expect(repeated.ok()).toBe(true);
  const duplicate = await repeated.json();
  expect(duplicate.duplicate).toBe(true);
  expect(duplicate.source.id).toBe(payload.source.id);
  expect(duplicate.source.contentHash).toBe(payload.source.contentHash);
  expect(duplicate.evidence.map((item: { id: string }) => item.id).sort()).toEqual(payload.evidence.map((item: { id: string }) => item.id).sort());
  await expect(page.getByText("Этот источник уже импортирован. Повторные события не добавлены.", { exact: true })).toBeVisible();
  await expect(page.locator(".gw-event")).toHaveCount(countBefore);
  await progress(page, [1, 0, 0]);
  await card.getByRole("button", { name: /Посмотреть источник|Источник открыт/ }).click();
  await expect(page.locator("#gw-source mark")).toHaveText(action.quote);
  const rejection = page.waitForResponse((item) => item.url().endsWith(`/evidence/${action.id}`) && item.request().method() === "PATCH");
  await card.getByRole("button", { name: "Отклонить", exact: true }).click();
  const rejectedResponse = await rejection;
  expect(rejectedResponse.ok()).toBe(true);
  const rejected = (await rejectedResponse.json()).evidence;
  expect(rejected).toMatchObject({ id: action.id, sourceId: action.sourceId, status: "rejected", revision: confirmed.revision + 1 });
  await expect(card.getByText("Отклонено", { exact: true })).toBeVisible();
  await progress(page, [0, 0, 0]);
  const persisted = await checkpointAfterReload(page);
  expect(persisted.evidence.find((item: { id: string }) => item.id === action.id)).toEqual(rejected);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(card.getByText("Отклонено", { exact: true })).toBeVisible();
  await expect(page.locator(".gw-event")).toHaveCount(countBefore);
  await progress(page, [0, 0, 0]);
  await noOverflow(page);
});

for (const [marker, message, code] of [
  ["RELEASE_TIMEOUT", "Модель не ответила вовремя. Попробуйте снова.", "provider_timeout"],
  ["RELEASE_UNAVAILABLE", "Не удалось обработать источник. Попробуйте снова.", "provider_failed"],
  ["RELEASE_INVALID", "Не удалось обработать источник. Попробуйте снова.", "provider_failed"],
] as const) {
  test(`FAKE fault ${marker}: no success, evidence or progress increase`, async ({ page }, info) => {
    recordMode(info);
    test.skip(mode !== "fake", "NOT_RUN: fault injection belongs only to the isolated protocol fake");
    await authenticate(page);
    await progress(page, [0, 0, 0]);
    const before = await page.locator(".gw-event").count();
    const response = await importText(page, `Синтетическая ошибка ${marker}`, `${marker}: я отправил резюме.`);
    expect(response.ok()).toBe(false);
    const payload = await response.json();
    expect(payload.error.code).toBe(code);
    expect(payload.source).toBeUndefined();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.locator(".gw-notice")).toHaveCount(0);
    await expect(page.locator(".gw-event")).toHaveCount(before);
    await progress(page, [0, 0, 0]);
    await page.reload();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.locator(".gw-event")).toHaveCount(before);
    await progress(page, [0, 0, 0]);
  });
}

test("FAKE setup, real revision conflict: refresh server state without false confirmation", async ({ page }, info) => {
  recordMode(info);
  test.skip(mode !== "fake", "NOT_RUN: controlled race belongs to isolated synthetic acceptance");
  await authenticate(page);
  await progress(page, [0, 0, 0]);
  const card = page.locator(".gw-event").filter({ hasText: "Выполненное действие" });
  await expect(card).toHaveCount(1);
  await page.route("**/api/evidence/*", async (route) => {
    const body = route.request().postDataJSON();
    // A second real authenticated writer updates the revision immediately before
    // the browser's stale write reaches the real gateway; no response is mocked.
    const concurrent = await route.fetch({ postData: JSON.stringify({ ...body, status: "disputed" }) });
    expect(concurrent.ok()).toBe(true);
    await route.continue();
  }, { times: 1 });
  const waiting = page.waitForResponse((item) => item.url().includes("/evidence/") && item.request().method() === "PATCH" && item.status() === 409);
  await card.getByRole("button", { name: "Подтвердить", exact: true }).click();
  expect((await waiting).status()).toBe(409);
  await expect(page.getByRole("alert")).toContainText("Данные обновлены.");
  await expect(card.getByText("Оспорено", { exact: true })).toBeVisible();
  await expect(card.getByText("Подтверждено", { exact: true })).toHaveCount(0);
  await progress(page, [0, 0, 0]);
});

test("FAKE setup, unconfigured STT: upload reports error without transcript or progress", async ({ page }, info) => {
  recordMode(info);
  test.skip(mode !== "fake", "NOT_RUN: this runner deliberately leaves STT unconfigured in fake mode");
  await authenticate(page);
  await progress(page, [0, 0, 0]);
  const before = await page.locator(".gw-event").count();
  await page.getByRole("button", { name: "Добавить контекст", exact: true }).click();
  await page.getByRole("button", { name: "Аудио", exact: true }).click();
  await page.getByLabel("Название источника", { exact: true }).fill("Синтетический файл: STT не настроен");
  await page.getByLabel("Аудиофайл", { exact: true }).setInputFiles({ name: "synthetic.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFF synthetic audio test bytes") });
  const waiting = page.waitForResponse((item) => item.url().includes("/context/audio?") && item.request().method() === "POST");
  await page.getByRole("button", { name: "Найти события", exact: true }).click();
  const response = await waiting;
  expect(response.status()).toBe(503);
  expect((await response.json()).error.code).toBe("stt_unconfigured");
  await expect(page.getByRole("alert")).toContainText("Распознавание речи ещё не настроено. Используйте текст.");
  await expect(page.locator(".gw-event")).toHaveCount(before);
  await progress(page, [0, 0, 0]);
  await checkpointAfterReload(page);
});

test("LIVE audio: file → STT transcript → exact quote → confirm", async ({ page }, info) => {
  test.setTimeout(300_000);
  recordMode(info);
  const audio = process.env.RELEASE_AUDIO_FILE;
  test.skip(mode !== "live" || !audio || !existsSync(audio), "NOT_RUN: requires live STT, an operator-supplied 20–60 second synthetic audio file, and live mode");
  test.skip(process.env.RELEASE_ALLOW_LIVE_MUTATIONS !== "1", "NOT_RUN: live mutations opt-in missing");
  await page.addInitScript(observeReleaseAudioResponses);
  await authenticate(page);
  await progress(page, [0, 0, 0]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Добавить контекст", exact: true }).click();
  await page.getByRole("button", { name: "Аудио", exact: true }).click();
  await page.getByLabel("Название источника", { exact: true }).fill("Синтетическое аудио для приёмки");
  await page.getByLabel("Аудиофайл", { exact: true }).setInputFiles(audio!);
  const duration = await page.getByLabel("Аудиофайл", { exact: true }).evaluate(async (input: HTMLInputElement) => {
    const url = URL.createObjectURL(input.files![0]);
    try {
      return await new Promise<number>((resolve, reject) => {
        const player = document.createElement("audio");
        player.onloadedmetadata = () => resolve(player.duration);
        player.onerror = () => reject(new Error("Cannot decode synthetic acceptance audio"));
        player.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  });
  expect(duration, "Live acceptance requires a real 20–60 second synthetic recording").toBeGreaterThanOrEqual(20);
  expect(duration).toBeLessThanOrEqual(60);
  const orderedAfterImport = observeEvidenceReload(page);
  const waiting = page.waitForResponse((item) => item.url().includes("/context/audio?") && item.request().method() === "POST");
  await page.getByRole("button", { name: "Найти события", exact: true }).click();
  const response = await waiting;
  info.annotations.push({ type: "audio-http", description: `Real audio import HTTP status=${response.status()}` });
  expect(response.ok(), `Real STT must succeed: status=${response.status()}; stt_unconfigured/provider errors are not a pass`).toBe(true);
  const captured = await readReleaseAudioResponse(page);
  expect(captured.status).toBe(response.status());
  expect(captured.invalidJson, "The real UI response clone must contain JSON").toBe(false);
  const payload = captured.body;
  expect(payload.duplicate, "Fresh synthetic audio must invoke STT; duplicates do not prove it").toBe(false);
  expect(payload.source.kind).toBe("audio");
  expect(payload.source.text.trim().length).toBeGreaterThan(10);
  const action = payload.evidence.find((item: { eventType: string }) => item.eventType === "completed_action");
  expect(action, "Synthetic audio must contain a completed goal action").toBeTruthy();
  checkAudioGrounding(payload.source, payload.evidence, duration);
  const card = await cardFromObservedOrder(page, await orderedAfterImport, action);
  await card.getByRole("button", { name: /Посмотреть источник|Источник открыт/ }).click();
  await expect(page.locator("#gw-source .gw-source-kind")).toHaveText("Расшифровка");
  await expect(page.locator("#gw-source mark")).toHaveText(action.quote);
  if (action.startMs === null) {
    await expect(page.locator("#gw-source .gw-source-timecode")).toHaveCount(0);
  } else {
    await expect(page.locator("#gw-source .gw-source-timecode")).toHaveText(`Фрагмент ${timecode(action.startMs)} – ${timecode(action.endMs)}`);
  }
  const criterionIndex = ["cv", "mock", "feedback"].indexOf(action.criterionId);
  const bar = page.getByRole("progressbar", { name: criteria[criterionIndex], exact: true });
  const numericCount = page.locator(".gw-criteria > li").nth(criterionIndex).locator(".gw-criterion-count strong");
  const before = Number(await numericCount.textContent());
  const target = Number(await bar.getAttribute("aria-valuemax"));
  const reviewed = page.waitForResponse((item) => item.url().endsWith(`/evidence/${action.id}`) && item.request().method() === "PATCH");
  await card.getByRole("button", { name: "Подтвердить", exact: true }).click();
  const reviewResponse = await reviewed;
  expect(reviewResponse.ok()).toBe(true);
  const confirmed = (await reviewResponse.json()).evidence;
  expect(confirmed).toMatchObject({ id: action.id, sourceId: payload.source.id, status: "confirmed", revision: action.revision + 1 });
  await expect(card.getByText("Подтверждено", { exact: true })).toBeVisible();
  await expect(numericCount).toHaveText(String(before + 1));
  await expect(bar).toHaveAttribute("aria-valuenow", String(Math.min(before + 1, target)));
  const persisted = await checkpointAfterReload(page);
  expect(persisted.evidence.find((item: Evidence) => item.id === action.id)).toEqual(confirmed);
  expect(persisted.progress.criteria.find((item: { criterionId: string }) => item.criterionId === action.criterionId).confirmedCount).toBe(before + 1);
  await expect(card.getByText("Подтверждено", { exact: true })).toBeVisible();
  await expect(numericCount).toHaveText(String(before + 1));
  await expect(bar).toHaveAttribute("aria-valuenow", String(Math.min(before + 1, target)));
  await noOverflow(page);
  info.annotations.push({ type: "audio", description: `Real WAV duration=${duration}s; duplicate=${payload.duplicate}; transcript=${payload.source.text.length} UTF-16 units; STT segments=${payload.source.segments.length}; grounded evidence=${payload.evidence.length}; sourceId=${payload.source.id}; confirmedEvidenceId=${action.id}; confirmedCount=${before + 1}` });
});
