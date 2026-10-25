#!/usr/bin/env node
/** Add a synthetic day through the real UI, retaining existing review decisions and progress. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataset = 'docs/demo/day-context/2026-10-25/notes.json';
const notes = JSON.parse(await readFile(path.join(root, dataset), 'utf8'));
assert.equal(notes.length, 12);
assert.equal(new Set(notes.map(note => note.text)).size, notes.length);
for (const note of notes) {
  assert.match(note.time, /^\d{2}:\d{2}$/);
  assert.ok(note.title.length < 150 && note.text.includes('25 октября 2026'));
  assert.match(note.text, /[Сс]интетич/);
}
if (process.argv[2] === '--check') {
  console.log('PASS: 12 distinct synthetic notes; no browser or network started.');
  process.exit(0);
}
assert.equal(process.argv[2], '--apply', 'Use --check or --apply');
assert.ok(process.env.RYADOM_DEMO_USERNAME && process.env.RYADOM_DEMO_PASSWORD, 'Private demo login required');
const origin = 'https://77.239.111.64';
const out = path.join(root, 'output/test-data', `day-context-${Date.now()}`);
await mkdir(out, { recursive: true, mode: 0o700 });
const report = { startedAt: new Date().toISOString(), status: 'RUNNING', origin, dataset, imports: [], confirmedByRunner: false };
const receipts = new Map();
for (const directory of await readdir(path.join(root, 'output/test-data'))) {
  if (!directory.startsWith('day-context-')) continue;
  let previous;
  try { previous = JSON.parse(await readFile(path.join(root, 'output/test-data', directory, 'report.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (previous.origin !== origin || previous.dataset !== dataset) continue;
  for (const item of previous.imports) receipts.set(item.sha256, item);
}
const save = () => writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
const { chromium } = createRequire(path.join(root, 'app/builds/typescript/client_web/package.json'))('playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-http2', '--disable-quic'] });
let stage = 'login';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, locale: 'ru-RU', serviceWorkers: 'block' });
  let readToken;
  page.on('response', async response => {
    const route = new URL(response.url()).pathname;
    if (response.ok() && ['/api/auth/login', '/api/auth/refresh'].includes(route)) {
      readToken = (await response.json()).access_token;
    }
    if (route.startsWith('/api/') && response.status() >= 400) {
      report.httpErrors ??= [];
      report.httpErrors.push({ route, status: response.status() });
    }
  });
  page.on('requestfailed', request => {
    const route = new URL(request.url()).pathname;
    if (route.startsWith('/api/')) {
      report.networkErrors ??= [];
      report.networkErrors.push({ route, error: request.failure()?.errorText });
    }
  });
  page.setDefaultTimeout(30000);
  const responseIs = (method, route) => response => response.request().method() === method && new URL(response.url()).pathname === route;
  const idle = () => page.locator('.gw-workspace-grid[aria-busy="false"]').waitFor({ timeout: 180000 });
  const navigate = async route => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
        return;
      } catch (error) {
        if (attempt === 3 || !/net::ERR_(SSL_PROTOCOL_ERROR|CONNECTION_RESET)|interrupted by another navigation to "chrome-error:/.test(error.message)) throw error;
        report.navigationRetries ??= [];
        report.navigationRetries.push({ route, attempt });
        await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
      }
    }
  };
  const get = async route => {
    const response = await page.request.get(`${origin}${route}`, { headers: { authorization: `Bearer ${readToken}` } });
    if (!response.ok()) throw new Error(`Read HTTP ${response.status()}`);
    return response.json();
  };
  const counts = progress => Object.fromEntries(progress.criteria.map(item => [item.criterionId, item.confirmedCount]));
  await navigate('/login');
  await page.locator('#identifier').fill(process.env.RYADOM_DEMO_USERNAME);
  await page.locator('#password[type="password"]').fill(process.env.RYADOM_DEMO_PASSWORD);
  const login = page.waitForResponse(responseIs('POST', '/api/auth/login'));
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const loggedIn = await login;
  assert.ok(loggedIn.ok(), 'Ordinary login failed');
  readToken = (await loggedIn.json()).access_token;
  await idle();
  const { goal } = await get('/api/goals/demo');
  assert.match(goal.title, /ML|собеседован/i, 'Day dataset requires the existing ML goal');
  report.goalTitle = goal.title;
  report.beforeProgress = counts((await get('/api/goals/demo/progress')).progress);
  const before = (await get('/api/goals/demo/evidence')).evidence;
  report.beforeEvidenceCount = before.length;
  console.log(`Goal: ${goal.title}; existing evidence: ${before.length}`);
  await save();
  for (const note of notes) {
    stage = `import-${note.time}`;
    const sha256 = createHash('sha256').update(note.text).digest('hex');
    if (receipts.has(sha256)) {
      report.imports.push({ ...receipts.get(sha256), duplicate: null, resumedFromReceipt: true });
      await save();
      console.log(`RESUME ${note.time}: previously saved source; final persistence check required`);
      continue;
    }
    if (!await page.locator('#gw-import').isVisible()) await page.getByRole('button', { name: 'Добавить контекст', exact: true }).click();
    const form = page.locator('#gw-import');
    await form.getByRole('button', { name: 'Текст', exact: true }).click();
    await form.getByLabel('Название источника', { exact: true }).fill(`Демо · 25 октября · ${note.time} · ${note.title}`);
    await form.getByLabel(/^Текст источника/).fill(note.text);
    const waiting = page.waitForResponse(responseIs('POST', '/api/context/import'), { timeout: 180000 });
    await form.getByRole('button', { name: 'Найти события', exact: true }).click();
    const response = await waiting;
    assert.ok(response.ok(), `Import HTTP ${response.status()}`);
    const imported = await response.json();
    assert.equal(imported.source.text, note.text);
    for (const item of imported.evidence) {
      assert.equal(note.text.slice(item.textStart, item.textEnd), item.quote, 'Quote must be grounded');
      if (!imported.duplicate) assert.equal(item.status, 'proposed');
    }
    report.imports.push({ time: note.time, title: note.title, sourceId: imported.source.id, duplicate: imported.duplicate, sha256: createHash('sha256').update(note.text).digest('hex'), evidence: imported.evidence.map(item => ({ id: item.id, type: item.eventType, status: item.status })) });
    await idle();
    if (await page.locator('.gw-error').count()) {
      const message = await page.locator('.gw-error').innerText();
      report.uiRefreshRecoveries ??= [];
      report.uiRefreshRecoveries.push({ time: note.time, message });
      await navigate('/app');
      await idle();
      assert.equal(await page.locator('.gw-error').count(), 0, message);
    }
    await save();
    console.log(`PASS ${note.time}: ${imported.evidence.length} events; duplicate=${imported.duplicate}`);
  }
  stage = 'reload-and-progress';
  await navigate('/app');
  await idle();
  report.afterProgress = counts((await get('/api/goals/demo/progress')).progress);
  assert.deepEqual(report.afterProgress, report.beforeProgress, 'Confirmed progress changed during import');
  const after = (await get('/api/goals/demo/evidence')).evidence;
  report.afterEvidenceCount = after.length;
  for (const old of before) assert.deepEqual(after.find(item => item.id === old.id), old, 'Existing review was modified');
  for (const imported of report.imports) {
    const { source } = await get(`/api/sources/${encodeURIComponent(imported.sourceId)}`);
    assert.equal(source.text, notes.find(note => note.time === imported.time).text);
  }
  stage = 'context-chat';
  await page.getByRole('button', { name: 'Чат с агентом', exact: true }).click();
  const question = 'Когда назначено техническое собеседование в лаборатории «Маяк» и что нужно подготовить?';
  await page.getByLabel('Ваше сообщение', { exact: true }).fill(question);
  const chatWaiting = page.waitForResponse(responseIs('POST', '/api/goals/demo/chat'), { timeout: 180000 });
  await page.getByRole('button', { name: /^Отправить сообщение(?: снова)?$/ }).click();
  const chatResponse = await chatWaiting;
  assert.ok(chatResponse.ok(), `Chat HTTP ${chatResponse.status()}`);
  const chat = await chatResponse.json();
  assert.ok(chat.reply.text.includes('11:30'), 'Chat must retrieve the interview time');
  assert.equal(chat.reply.outcome, 'grounded');
  const invitation = report.imports.find(item => item.time === '09:45');
  assert.ok(chat.reply.citations.some(citation => citation.sourceId === invitation.sourceId));
  for (const citation of chat.reply.citations.filter(item => item.sourceId === invitation.sourceId)) {
    const note = notes.find(item => item.time === '09:45');
    assert.equal(note.text.slice(citation.textStart, citation.textEnd), citation.quote);
  }
  report.chat = { question, answer: chat.reply.text, citations: chat.reply.citations, citationCount: chat.reply.citations.length };
  await navigate('/app');
  await idle();
  report.status = 'PASS';
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(`PASS: ${report.imports.length} sources persisted; progress unchanged; grounded chat answered. Report: ${path.relative(root, out)}/report.json`);
} catch (error) {
  report.status = 'FAIL';
  report.failedStage = stage;
  report.error = error instanceof Error ? error.message : 'Unknown error';
  await save();
  console.error(`FAIL ${stage}: ${report.error}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
