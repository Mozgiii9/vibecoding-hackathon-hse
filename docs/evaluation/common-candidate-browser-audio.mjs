import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Real UI acceptance only: no route interception, fixtures, API writes, or auth bypass.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'app/builds/typescript/client_web/package.json'));
const { chromium, expect } = require('@playwright/test');
const base = process.env.AUDIO_SMOKE_BASE_URL ?? 'http://127.0.0.1:16073';
const target = new URL(base);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Use an isolated loopback runtime.');
const out = path.resolve(process.env.AUDIO_SMOKE_OUTPUT ?? path.join(root, 'docs/evaluation/browser-audio-artifacts'));
const audio = path.resolve(root, 'docs/demo/sources/demo-audio.wav');
const timeout = Number(process.env.AUDIO_SMOKE_TIMEOUT_MS ?? 240000);
const username = process.env.AUDIO_SMOKE_USERNAME ?? `audio_smoke_${randomBytes(6).toString('hex')}`;
const password = process.env.AUDIO_SMOKE_PASSWORD ?? `Smoke-${randomBytes(24).toString('base64url')}!`;
const loginOnly = process.env.AUDIO_SMOKE_LOGIN_ONLY === '1';
assert(!loginOnly || (process.env.AUDIO_SMOKE_USERNAME && process.env.AUDIO_SMOKE_PASSWORD), 'Login-only requires synthetic account credentials in environment.');
const result = {
  status: 'RUNNING', startedAt: new Date().toISOString(), baseUrl: target.origin,
  gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  trackedTreeDirty: execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim().length > 0,
  runnerSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
  audioSha256: createHash('sha256').update(await readFile(audio)).digest('hex'),
  checks: [], screenshots: [], limitations: [
    'Browser acceptance does not prove process restart, backup/restore, or all MVP criteria.',
    'Duplicate identity/progress is observed. STT/extraction call counts require independent service telemetry.',
  ],
};
await mkdir(out, { recursive: true });
let browser;
let page;
let stage = 'launch';
let authenticated = false;
const check = (name, data = {}) => { result.checks.push({ name, status: 'PASS', ...data }); console.log(`PASS ${name}`); };
const responseIs = (method, pathname) => (response) => response.request().method() === method && new URL(response.url()).pathname === pathname;
async function jsonResponse(response) {
  assert(response.ok(), `HTTP ${response.status()} at ${new URL(response.url()).pathname}`);
  return response.json();
}
async function observedAudioResult(index) {
  // Read the real browser-consumed response, avoiding a CDP response-body failure
  // with the locally available Chromium revision. No request/response is replaced.
  await page.waitForFunction((index) => globalThis.__ryadomAudioResults?.length > index, index, { timeout });
  const observed = await page.evaluate((index) => globalThis.__ryadomAudioResults[index], index);
  assert(!observed.invalidJson, 'Real audio response was not valid JSON');
  return observed;
}
async function screenshot(name) {
  await page.screenshot({ path: path.join(out, name), fullPage: true });
  result.screenshots.push(name);
}
async function waitIdle() {
  await expect(page.locator('.gw-workspace-grid')).toHaveAttribute('aria-busy', 'false', { timeout });
  await expect(page.locator('.gw-error')).toHaveCount(0);
}
// Token stays inside page JS and is never returned, logged, persisted, or placed in a URL.
async function serverRead(route) {
  const reply = await page.evaluate(async (route) => {
    const refresh = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!refresh.ok) return { status: refresh.status, authFailed: true };
    const { access_token: token } = await refresh.json();
    const response = await fetch(route, { credentials: 'include', headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  }, route);
  assert.equal(reply.status, 200, 'Authenticated browser read failed');
  assert(!reply.authFailed, 'Browser refresh failed');
  return reply.body;
}
const counts = (progress) => Object.fromEntries(progress.criteria.map((item) => [item.criterionId, item.confirmedCount]));
async function signIn() {
  await page.locator('#identifier').fill(username);
  await page.locator('#password').fill(password);
  const response = page.waitForResponse(responseIs('POST', '/api/auth/login'), { timeout });
  await page.getByRole('button', { name: /^(Войти|Sign in)$/, exact: true }).click();
  assert((await response).ok(), 'Ordinary UI login failed');
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
}

try {
  browser = await chromium.launch({
    headless: process.env.AUDIO_SMOKE_HEADED !== '1',
    ...(process.env.AUDIO_SMOKE_EXECUTABLE ? { executablePath: process.env.AUDIO_SMOKE_EXECUTABLE } : {}),
    ...(process.env.AUDIO_SMOKE_CHANNEL ? { channel: process.env.AUDIO_SMOKE_CHANNEL } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'ru-RU' });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.addInitScript(() => {
    globalThis.__ryadomAudioResults = [];
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = args[1]?.method ?? (input instanceof Request ? input.method : 'GET');
      if (method.toUpperCase() === 'POST' && url.pathname === '/api/context/audio') {
        response.clone().json().then((body) => {
          globalThis.__ryadomAudioResults.push({ status: response.status, body });
        }).catch(() => {
          globalThis.__ryadomAudioResults.push({ status: response.status, invalidJson: true });
        });
      }
      return response;
    };
  });
  stage = 'ordinary-ui-auth';
  const bootstrapReply = page.waitForResponse(responseIs('GET', '/api/auth/bootstrap-status'), { timeout });
  await page.goto(target.origin, { waitUntil: 'domcontentloaded' });
  const bootstrap = await jsonResponse(await bootstrapReply);
  assert.equal(bootstrap.mode, 'local', 'Acceptance requires ordinary local signup/login, not local-owner or managed bypass.');
  if (loginOnly) {
    assert.equal(bootstrap.account_initialized, true, 'Login-only account must already exist.');
    await signIn();
    check('ordinary-ui-login');
  } else {
    assert.equal(bootstrap.account_initialized, false, 'Use fresh isolated auth storage, or explicitly select login-only with synthetic credentials.');
    await page.locator('#username').fill(username);
    await page.locator('#new-password').fill(password);
    await page.locator('#confirm-password').fill(password);
    const signup = page.waitForResponse(responseIs('POST', '/api/auth/signup'), { timeout });
    await page.getByRole('button', { name: /^(Создать аккаунт|Create account)$/, exact: true }).click();
    assert((await signup).ok(), 'Ordinary UI signup failed');
    await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
    check('ordinary-ui-clean-signup');
    const logout = page.waitForResponse(responseIs('POST', '/api/auth/logout'), { timeout });
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    assert((await logout).ok(), 'Ordinary UI logout failed');
    await signIn();
    check('ordinary-ui-logout-login');
  }
  authenticated = true;
  stage = 'create-goal';
  await page.getByRole('button', { name: 'Заполнить пример про ML-стажировку', exact: true }).click();
  const saved = page.waitForResponse(responseIs('PUT', '/api/goals/demo'), { timeout });
  await page.getByRole('button', { name: 'Подтвердить цель и критерии', exact: true }).click();
  const { goal } = await jsonResponse(await saved);
  assert(goal.confirmedAt && goal.criteria.length === 3);
  await waitIdle();
  const { progress: before } = await serverRead('/api/goals/demo/progress');
  assert.deepEqual(counts(before), { cv: 0, mock: 0, feedback: 0 });
  check('ui-goal-confirmed-zero-server-progress', { goalId: goal.id, criteria: goal.criteria, counts: counts(before) });

  stage = 'real-audio-upload';
  await page.getByRole('button', { name: 'Добавить контекст', exact: true }).click();
  await page.getByRole('button', { name: 'Аудио', exact: true }).click();
  await page.getByLabel('Название источника', { exact: true }).fill('Синтетическая аудиопроверка ML');
  await page.getByLabel('Аудиофайл', { exact: true }).setInputFiles(audio);
  let audioResponseCount = 0;
  let observed;
  for (let attempt = 0; attempt < 3; attempt++) {
    const importedResponse = page.waitForResponse(responseIs('POST', '/api/context/audio'), { timeout });
    stage = 'audio-submit';
    await page.getByRole('button', { name: 'Найти события', exact: true }).click();
    stage = 'audio-response-body';
    await importedResponse;
    observed = await observedAudioResult(audioResponseCount++);
    if (observed.status === 200) break;
    const code = observed.body?.error?.code;
    result.audioAttempts ??= [];
    result.audioAttempts.push({ status: observed.status, code: typeof code === 'string' ? code : 'unknown' });
    console.log(`Audio attempt returned HTTP ${observed.status}`);
    assert(observed.status >= 500 && attempt < 2, 'Audio import failed without successful recovery');
    await expect(page.locator('.gw-workspace-grid')).toHaveAttribute('aria-busy', 'false', { timeout });
    await expect(page.locator('.gw-error')).toBeVisible();
    const { progress } = await serverRead('/api/goals/demo/progress');
    const { evidence } = await serverRead('/api/goals/demo/evidence');
    assert.deepEqual(counts(progress), counts(before));
    assert.equal(evidence.length, 0);
    check('recoverable-audio-error-no-evidence-or-progress', { status: observed.status, code });
    // A bounded operator retry through the same visible form, never a provider fallback.
    await page.waitForTimeout(5000);
  }
  assert.equal(observed.status, 200);
  const imported = observed.body;
  stage = 'audio-result-validation';
  assert.equal(imported.duplicate, false);
  assert.equal(imported.source.kind, 'audio');
  assert(imported.source.text.trim().length > 0, 'Real STT must return a transcript');
  assert.equal(imported.source.contentHash, createHash('sha256').update('audio\0').update(await readFile(audio)).digest('hex'));
  assert(imported.evidence.length > 0, 'Real extraction must produce evidence');
  for (const event of imported.evidence) {
    assert.equal(imported.source.text.slice(event.textStart, event.textEnd), event.quote, 'Evidence quote must be an exact transcript slice');
    if (event.startMs !== null) assert(imported.source.segments.some((segment) => segment.startMs <= event.startMs && segment.endMs >= event.startMs), 'Timestamp must be grounded in STT segments');
  }
  stage = 'audio-ui-idle';
  await waitIdle();
  const { progress: proposed } = await serverRead('/api/goals/demo/progress');
  assert.deepEqual(counts(proposed), counts(before), 'Model proposals must not increase progress');
  check('real-ui-audio-stt-extraction-exact-quotes', { source: imported.source, evidence: imported.evidence, proposedCounts: counts(proposed) });

  stage = 'open-source-and-manual-confirm';
  const completed = imported.evidence.find((item) => item.eventType === 'completed_action' && item.status === 'proposed');
  assert(completed, 'Audio must produce a proposed completed action for manual confirmation');
  const card = page.locator('.gw-event').filter({ has: page.getByRole('heading', { name: completed.summary, exact: true }) });
  await expect(card).toHaveCount(1);
  const sourceResponse = page.waitForResponse(responseIs('GET', `/api/sources/${encodeURIComponent(completed.sourceId)}`), { timeout });
  await card.getByRole('button', { name: 'Посмотреть источник', exact: true }).click();
  const { source } = await jsonResponse(await sourceResponse);
  assert.equal(source.id, imported.source.id);
  await expect(page.locator('#gw-source mark')).toHaveText(completed.quote);
  await screenshot('01-real-transcript-exact-quote.png');
  const review = page.waitForResponse(responseIs('PATCH', `/api/evidence/${encodeURIComponent(completed.id)}`), { timeout });
  await card.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  const { evidence: confirmed } = await jsonResponse(await review);
  assert.equal(confirmed.status, 'confirmed');
  await waitIdle();
  const { progress: after } = await serverRead('/api/goals/demo/progress');
  const expected = { ...counts(before), [completed.criterionId]: 1 };
  assert.deepEqual(counts(after), expected);
  assert(after.criteria.find((item) => item.criterionId === completed.criterionId).evidenceIds.includes(completed.id));
  await expect(page.getByRole('progressbar', { name: goal.criteria.find((item) => item.id === completed.criterionId).description, exact: true })).toHaveAttribute('aria-valuenow', '1');
  check('ui-source-open-manual-confirm-server-progress', { evidenceId: completed.id, quote: completed.quote, criterionId: completed.criterionId, counts: counts(after) });
  await screenshot('02-manually-confirmed-server-progress.png');

  stage = 'duplicate-raw-audio';
  await page.getByLabel('Название источника', { exact: true }).fill('Та же аудиозапись, другое название');
  const repeatedResponse = page.waitForResponse(responseIs('POST', '/api/context/audio'), { timeout });
  await page.getByRole('button', { name: 'Найти события', exact: true }).click();
  assert((await repeatedResponse).ok(), 'Real duplicate upload HTTP status failed');
  const repeatedObservation = await observedAudioResult(audioResponseCount++);
  assert.equal(repeatedObservation.status, 200);
  const repeated = repeatedObservation.body;
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.source.id, imported.source.id);
  assert.equal(repeated.source.contentHash, imported.source.contentHash);
  assert.deepEqual(repeated.evidence.map((item) => item.id).sort(), imported.evidence.map((item) => item.id).sort());
  await waitIdle();
  await expect(page.getByText('Этот источник уже импортирован. Повторные события не добавлены.', { exact: true })).toBeVisible();
  const { progress: duplicateProgress } = await serverRead('/api/goals/demo/progress');
  const { evidence: allEvidence } = await serverRead('/api/goals/demo/evidence');
  assert.deepEqual(counts(duplicateProgress), counts(after));
  assert.equal(allEvidence.length, imported.evidence.length);
  check('duplicate-audio-same-source-evidence-no-progress-growth', { sourceId: repeated.source.id, evidenceCount: allEvidence.length, counts: counts(duplicateProgress), sttCallCount: 'NOT_OBSERVABLE_FROM_BROWSER' });

  stage = 'reload-persistence';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitIdle();
  const { progress: reloaded } = await serverRead('/api/goals/demo/progress');
  assert.deepEqual(counts(reloaded), counts(after));
  await expect(page.locator('.gw-event')).toHaveCount(imported.evidence.length);
  check('browser-reload-preserves-auth-goal-evidence-progress', { counts: counts(reloaded) });
  await screenshot('03-duplicate-and-reload.png');
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  // Raw Playwright errors can contain entered values; do not serialize them or auth bodies.
  result.failure = { stage, type: error instanceof assert.AssertionError ? 'ASSERTION_FAILED' : 'BROWSER_OR_RUNTIME_FAILED' };
  if (authenticated && error instanceof Error) {
    const operation = /^([a-zA-Z.]+):/.exec(error.message)?.[1];
    if (operation) result.failure.operation = operation;
    // Only the operation prefix is retained; raw exceptions can contain entered values.
    if (operation) console.error(`Operation: ${operation}`);
  }
  console.error(`FAIL ${stage}; inspect the isolated runtime and safe result JSON.`);
  if (authenticated && page) {
    try { await screenshot('failure-after-auth.png'); } catch { /* browser may have exited */ }
  }
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  await writeFile(path.join(out, 'results.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  if (browser) await browser.close();
  console.log(`Result: ${path.join(out, 'results.json')}`);
}
