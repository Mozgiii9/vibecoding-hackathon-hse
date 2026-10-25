#!/usr/bin/env node
/** Check an initialized synthetic runtime through ordinary UI login and strict HTTPS audio upload. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const countMap = progress => Object.fromEntries(progress.criteria.map(item => [item.criterionId, item.confirmedCount]));
const timecode = milliseconds => `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}`;
class SmokeError extends Error { constructor(code) { super(code); this.code = code; } }
const requireCondition = (condition, code) => { if (!condition) throw new SmokeError(code); };

/** Require a local repository path, including when an existing ancestor is a symlink. */
async function contained(value) {
  const location = path.resolve(root, value);
  requireCondition(location.startsWith(`${root}${path.sep}`), 'PATH_OUTSIDE_REPOSITORY');
  const realRoot = await realpath(root);
  let ancestor = location;
  while (true) {
    try {
      const resolved = await realpath(ancestor);
      requireCondition(resolved.startsWith(`${realRoot}${path.sep}`) || resolved === realRoot, 'SYMLINK_OUTSIDE_REPOSITORY');
      return location;
    } catch (error) {
      if (error instanceof SmokeError || error.code !== 'ENOENT') throw error;
      ancestor = path.dirname(ancestor);
    }
  }
}

/** Read synthetic WAV bytes without recording the file path or any private configuration. */
async function wav(filename) {
  const filenameInRepo = await contained(filename);
  const bytes = await readFile(filenameInRepo);
  requireCondition(bytes.length > 44 && bytes.length <= 10 * 1024 * 1024 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE', 'INVALID_SYNTHETIC_WAV');
  return { filename: filenameInRepo, bytesSha256: hash(bytes), contentHash: hash(Buffer.concat([Buffer.from('audio\0'), bytes])) };
}

let browser, result, out, stage = 'configuration';
try {
  const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
  requireCondition(process.argv.length === 2 || checkOnly, 'USE_NO_ARGUMENTS_OR_CHECK');
  requireCondition(process.env.AUDIO_SMOKE_BASE_URL, 'EXPLICIT_BASE_URL_REQUIRED');
  const target = new URL(process.env.AUDIO_SMOKE_BASE_URL);
  requireCondition(!target.username && !target.password && !target.search && !target.hash && target.pathname === '/', 'BARE_ORIGIN_REQUIRED');
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
  requireCondition(target.origin === 'https://77.239.111.64' || (loopback && ['http:', 'https:'].includes(target.protocol)), 'TARGET_NOT_ALLOWED');
  requireCondition(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'STRICT_TLS_REQUIRED');
  const username = process.env.AUDIO_SMOKE_USERNAME;
  const password = process.env.AUDIO_SMOKE_PASSWORD;
  requireCondition(checkOnly || (username && password), 'SYNTHETIC_LOGIN_REQUIRED');
  const timeout = Number(process.env.AUDIO_SMOKE_TIMEOUT_MS || 240000);
  requireCondition(Number.isInteger(timeout) && timeout >= 5000 && timeout <= 300000, 'INVALID_TIMEOUT');
  const original = await wav('docs/demo/sources/demo-audio.wav');
  const fresh = process.env.AUDIO_SMOKE_AUDIO_PATH ? await wav(process.env.AUDIO_SMOKE_AUDIO_PATH) : null;
  requireCondition(!fresh || fresh.contentHash !== original.contentHash, 'FRESH_WAV_MUST_HAVE_NEW_BYTE_HASH');
  if (checkOnly) {
    console.log('PASS configuration and WAV guards; no browser or network launched.');
  } else {
    out = await contained(process.env.AUDIO_SMOKE_OUTPUT || `output/playwright/https-existing-${Date.now()}`);
    try { await stat(path.join(out, 'results.json')); throw new SmokeError('RESULTS_ALREADY_EXIST'); }
    catch (error) { if (error instanceof SmokeError || error.code !== 'ENOENT') throw error; }
    await mkdir(out, { recursive: true, mode: 0o700 });
    result = {
      status: 'RUNNING', startedAt: new Date().toISOString(), finishedAt: null,
      targetOrigin: target.origin, runnerCheckoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
      runnerSha256: hash(await readFile(fileURLToPath(import.meta.url))), deploymentSourceSha: null,
      deploymentIdentityProvenance: 'release.json observed over target connection, separate from runner checkout',
      strictTls: true, syntheticData: true, checks: [], confirmationAttempted: false, confirmationPerformed: false,
      originalAudioSha256: original.bytesSha256, freshAudioSha256: fresh?.bytesSha256 ?? null,
      freshAudioProvenance: fresh ? 'Operator-supplied synthetic WAV with intentionally changed bytes, such as a silence prefix. This runner does not claim to verify how it was created.' : 'not-requested',
      limitations: ['No goal/auth reset or runtime restart.', 'Duplicate response does not expose STT invocation count.', 'Headless browser is not physical iPhone acceptance.'],
    };
    const { chromium, expect } = createRequire(path.join(root, 'app/builds/typescript/client_web/package.json'))('@playwright/test');
    const check = (name, details = {}) => { result.checks.push({ name, status: 'PASS', at: new Date().toISOString(), ...details }); console.log(`PASS ${name}`); };
    browser = await chromium.launch({ headless: true, channel: process.env.AUDIO_SMOKE_CHANNEL || 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'ru-RU', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const responseIs = (method, pathname) => response => response.request().method() === method && new URL(response.url()).origin === target.origin && new URL(response.url()).pathname === pathname;
    const json = async response => { requireCondition(response.ok(), `HTTP_${response.status()}`); return response.json(); };
    const idle = async () => {
      await expect(page.locator('.gw-workspace-grid')).toHaveAttribute('aria-busy', 'false', { timeout });
      await expect(page.locator('.gw-error')).toHaveCount(0);
    };
    // Passive observation only. Original fetch and responses remain unchanged.
    await page.addInitScript(() => {
      globalThis.__ryadomHttpsAudio = [];
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const input = args[0];
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        const method = args[1]?.method ?? (input instanceof Request ? input.method : 'GET');
        if (url.origin === location.origin && url.pathname === '/api/context/audio' && method.toUpperCase() === 'POST') {
          response.clone().json().then(body => globalThis.__ryadomHttpsAudio.push({ status: response.status, body }))
            .catch(() => globalThis.__ryadomHttpsAudio.push({ status: response.status, invalidJson: true }));
        }
        return response;
      };
    });
    // Refresh token remains inside the page and never enters reports or console output.
    const serverRead = async route => {
      const reply = await page.evaluate(async route => {
        const refresh = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!refresh.ok) return { status: refresh.status };
        const { access_token: token } = await refresh.json();
        const response = await fetch(route, { credentials: 'include', headers: { authorization: `Bearer ${token}` } });
        return { status: response.status, body: await response.json() };
      }, route);
      requireCondition(reply.status === 200, 'AUTHENTICATED_READ_FAILED');
      return reply.body;
    };
    stage = 'ordinary-login';
    await page.goto(target.origin, { waitUntil: 'domcontentloaded' });
    requireCondition(new URL(page.url()).origin === target.origin, 'CROSS_ORIGIN_LOGIN_FORBIDDEN');
    await page.locator('#identifier').fill(username);
    await page.locator('#password[type="password"]').fill(password);
    const login = page.waitForResponse(responseIs('POST', '/api/auth/login'), { timeout });
    await page.getByRole('button', { name: /^(Войти|Sign in)$/, exact: true }).click();
    await json(await login);
    await idle();
    await expect(page.locator('.gw-demo-banner')).toHaveCount(0);
    const release = await context.request.get(`${target.origin}/release.json`);
    const identity = await json(release);
    const deployment = identity.source_sha ?? identity.sourceSha;
    requireCondition(typeof deployment === 'string' && /^[a-f\d]{40}$/i.test(deployment), 'RELEASE_IDENTITY_MISSING');
    result.deploymentSourceSha = deployment;
    const { goal } = await serverRead('/api/goals/demo');
    requireCondition(goal?.id === 'demo' && goal.confirmedAt && Array.isArray(goal.criteria), 'PREPARED_GOAL_REQUIRED');
    const { progress: before } = await serverRead('/api/goals/demo/progress');
    const { evidence: initialEvidence } = await serverRead('/api/goals/demo/evidence');
    check('ordinary-login-existing-goal', { goalId: goal.id, counts: countMap(before) });
    await page.getByRole('button', { name: 'Добавить контекст', exact: true }).click();
    const form = page.locator('#gw-import');
    await form.getByRole('button', { name: 'Аудио', exact: true }).click();
    let observedIndex = 0;
    const upload = async (file, title) => {
      await form.getByLabel('Название источника', { exact: true }).fill(title);
      await form.getByLabel('Аудиофайл', { exact: true }).setInputFiles(file.filename);
      const response = page.waitForResponse(responseIs('POST', '/api/context/audio'), { timeout });
      await form.getByRole('button', { name: 'Найти события', exact: true }).click();
      await response;
      await page.waitForFunction(index => globalThis.__ryadomHttpsAudio.length > index, observedIndex, { timeout });
      const observed = await page.evaluate(index => globalThis.__ryadomHttpsAudio[index], observedIndex++);
      requireCondition(!observed.invalidJson && observed.status === 200, `AUDIO_HTTP_${observed.status}`);
      await idle();
      const imported = observed.body;
      requireCondition(imported.source?.goalId === goal.id && imported.source.kind === 'audio' && imported.source.contentHash === file.contentHash && Array.isArray(imported.evidence), 'AUDIO_SOURCE_MISMATCH');
      for (const item of imported.evidence) {
        requireCondition(item.sourceId === imported.source.id && item.goalId === goal.id && goal.criteria.some(criterion => criterion.id === item.criterionId), 'EVIDENCE_LINK_MISMATCH');
        requireCondition(item.quote?.length > 0 && Number.isInteger(item.textStart) && Number.isInteger(item.textEnd) && item.textStart >= 0 && item.textEnd > item.textStart && imported.source.text.slice(item.textStart, item.textEnd) === item.quote, 'EXACT_QUOTE_REQUIRED');
        if (item.startMs !== null) requireCondition(imported.source.segments.some(segment => segment.startMs <= item.startMs && segment.endMs >= item.startMs), 'UNGROUNDED_START_TIME');
        if (item.endMs !== null) requireCondition(imported.source.segments.some(segment => segment.startMs <= item.endMs && segment.endMs >= item.endMs), 'UNGROUNDED_END_TIME');
      }
      return imported;
    };
    stage = 'existing-wav-duplicate';
    const existing = await upload(original, 'HTTPS: повтор исходного синтетического WAV');
    requireCondition(existing.duplicate === true, 'EXPECTED_EXISTING_WAV_DUPLICATE');
    assert.deepEqual(existing.evidence.map(item => item.id).sort(), initialEvidence.filter(item => item.sourceId === existing.source.id).map(item => item.id).sort());
    assert.deepEqual(countMap((await serverRead('/api/goals/demo/progress')).progress), countMap(before));
    assert.deepEqual((await serverRead('/api/goals/demo/evidence')).evidence.map(item => item.id).sort(), initialEvidence.map(item => item.id).sort());
    check('https-existing-wav-duplicate-no-progress-growth', { sourceId: existing.source.id, evidenceIds: existing.evidence.map(item => item.id), sttCallCount: 'NOT_OBSERVABLE_FROM_BROWSER' });
    let finalCounts = countMap(before);
    let addedEvidenceCount = 0;
    let confirmedEvidenceId = null;
    const finalEvidenceIds = initialEvidence.map(item => item.id);
    if (fresh) {
      stage = 'fresh-wav-real-stt';
      const imported = await upload(fresh, 'HTTPS: новый synthetic WAV с изменёнными байтами');
      requireCondition(imported.duplicate === false && imported.source.text?.trim().length > 0 && imported.evidence.length > 0, 'FRESH_TRANSCRIPT_AND_EVIDENCE_REQUIRED');
      requireCondition(imported.evidence.every(item => item.status === 'proposed'), 'FRESH_EVIDENCE_MUST_BE_PROPOSED');
      assert.deepEqual(countMap((await serverRead('/api/goals/demo/progress')).progress), countMap(before));
      addedEvidenceCount = imported.evidence.length;
      finalEvidenceIds.push(...imported.evidence.map(item => item.id));
      check('real-stt-proposals-exact-quotes-no-count-growth', { sourceId: imported.source.id, transcript: imported.source.text, segments: imported.source.segments, evidence: imported.evidence });
      const item = imported.evidence.find(candidate => candidate.eventType === 'completed_action' && candidate.status === 'proposed');
      requireCondition(item, 'PROPOSED_COMPLETED_ACTION_REQUIRED');
      requireCondition(imported.evidence.filter(candidate => candidate.summary === item.summary && candidate.criterionId === item.criterionId && candidate.quote === item.quote).length === 1, 'AMBIGUOUS_COMPLETED_ACTION_WITHIN_SOURCE');
      stage = 'source-and-one-confirm';
      const cards = page.locator('.gw-event-completed_action').filter({ has: page.getByRole('heading', { name: item.summary, exact: true }) });
      let card = null;
      const criterion = goal.criteria.find(candidate => candidate.id === item.criterionId);
      for (let index = 0; index < await cards.count(); index++) {
        const candidate = cards.nth(index);
        if (await candidate.locator('.gw-event-criterion').textContent() !== criterion.description) continue;
        const sourceReply = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).origin === target.origin && new URL(response.url()).pathname.startsWith('/api/sources/'), { timeout });
        await candidate.getByRole('button', { name: 'Посмотреть источник', exact: true }).click();
        const { source } = await json(await sourceReply);
        if (source.id !== imported.source.id) continue;
        requireCondition(source.text === imported.source.text, 'OPENED_SOURCE_MISMATCH');
        await expect(page.locator('.gw-source-title')).toHaveText(source.title);
        await expect(page.locator('#gw-source mark')).toBeVisible();
        if (await page.locator('#gw-source mark').textContent() !== item.quote) continue;
        card = candidate;
        break;
      }
      requireCondition(card, 'EXACT_SOURCE_EVENT_ROW_NOT_FOUND');
      await expect(page.locator('#gw-source mark')).toHaveText(item.quote);
      if (item.startMs !== null) await expect(page.locator('.gw-source-timecode')).toHaveText(`Фрагмент ${timecode(item.startMs)}${item.endMs !== null ? ` – ${timecode(item.endMs)}` : ''}`);
      await page.screenshot({ path: path.join(out, '01-fresh-audio-quote.png'), fullPage: true });
      result.confirmationAttempted = true;
      result.confirmationPerformed = null;
      const review = page.waitForResponse(responseIs('PATCH', `/api/evidence/${encodeURIComponent(item.id)}`), { timeout });
      await card.getByRole('button', { name: 'Подтвердить', exact: true }).click();
      const { evidence: confirmed } = await json(await review);
      requireCondition(confirmed.id === item.id && confirmed.sourceId === imported.source.id && confirmed.status === 'confirmed' && confirmed.eventType === 'completed_action', 'CONFIRM_RESPONSE_MISMATCH');
      result.confirmationPerformed = true;
      confirmedEvidenceId = item.id;
      await idle();
      finalCounts = { ...countMap(before), [item.criterionId]: countMap(before)[item.criterionId] + 1 };
      assert.deepEqual(countMap((await serverRead('/api/goals/demo/progress')).progress), finalCounts);
      check('one-ui-confirm-increases-matching-server-count', { evidenceId: item.id, criterionId: item.criterionId, counts: finalCounts });
      stage = 'fresh-wav-duplicate';
      const repeated = await upload(fresh, 'HTTPS: повтор нового WAV');
      requireCondition(repeated.duplicate === true && repeated.source.id === imported.source.id, 'FRESH_DUPLICATE_IDENTITY_MISMATCH');
      assert.deepEqual(repeated.evidence.map(entry => entry.id).sort(), imported.evidence.map(entry => entry.id).sort());
      assert.deepEqual(countMap((await serverRead('/api/goals/demo/progress')).progress), finalCounts);
      check('fresh-wav-repeat-same-ids-and-counts', { sourceId: repeated.source.id, counts: finalCounts });
    }
    stage = 'reload';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await idle();
    assert.deepEqual(countMap((await serverRead('/api/goals/demo/progress')).progress), finalCounts);
    const { evidence: reloadedEvidence } = await serverRead('/api/goals/demo/evidence');
    requireCondition(reloadedEvidence.length === initialEvidence.length + addedEvidenceCount, 'RELOAD_EVIDENCE_COUNT_MISMATCH');
    assert.deepEqual(reloadedEvidence.map(item => item.id).sort(), finalEvidenceIds.sort());
    if (confirmedEvidenceId) requireCondition(reloadedEvidence.find(item => item.id === confirmedEvidenceId)?.status === 'confirmed', 'RELOAD_REVIEW_STATUS_MISMATCH');
    await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(out, '02-reload-preserved.png'), fullPage: true });
    check('reload-preserves-existing-goal-auth-evidence-and-counts', { counts: finalCounts, evidenceCount: reloadedEvidence.length });
    result.status = fresh ? 'PASS_FRESH_AUDIO' : 'PASS_DUPLICATE_ONLY';
  }
} catch (error) {
  if (result) { result.status = 'FAIL'; result.failure = { stage, code: error instanceof SmokeError ? error.code : 'ASSERTION_BROWSER_OR_IO_FAILED' }; }
  console.error(`Existing-runtime HTTPS smoke failed at ${stage}; ${error instanceof SmokeError ? error.code : 'ASSERTION_BROWSER_OR_IO_FAILED'}.`);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); }
  catch { if (result) result.status = 'FAIL'; process.exitCode = 1; }
  if (result && out) {
    result.finishedAt = new Date().toISOString();
    try { await writeFile(path.join(out, 'results.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); console.log(`Result status: ${result.status}.`); }
    catch { console.error('Safe results could not be saved.'); process.exitCode = 1; }
  }
}
