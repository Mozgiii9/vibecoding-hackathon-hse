#!/usr/bin/env node
/** Adapt the canonical audio UI acceptance runner to the explicitly allowed HTTPS endpoint. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalRelativePath = 'docs/evaluation/browser-audio.mjs';
const canonicalPath = path.join(root, canonicalRelativePath);
const expectedRoot = "const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');";
const expectedGuard = "assert(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Use an isolated loopback runtime.');";
const strictContext = "const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'ru-RU' });";
const replacementGuard = `assert(
  process.env.AUDIO_SMOKE_BASE_URL &&
  !target.username && !target.password && !target.search && !target.hash && target.pathname === '/' &&
  (target.origin === 'https://77.239.111.64' ||
    (['http:', 'https:'].includes(target.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))),
  'Explicit HTTPS demo endpoint or isolated loopback runtime required.'
);`;

class WrapperError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const requireCondition = (condition, code) => { if (!condition) throw new WrapperError(code); };
const sha256 = (content) => createHash('sha256').update(content).digest('hex');

/** Replace exactly one reviewed line, refusing a changed canonical implementation. */
function replaceOnce(source, expected, replacement, code) {
  requireCondition(source.split(expected).length === 2, code);
  return source.replace(expected, replacement);
}

/** Validate the same endpoint policy before any temporary execution is prepared. */
function validateTarget() {
  requireCondition(process.env.AUDIO_SMOKE_BASE_URL, 'EXPLICIT_BASE_URL_REQUIRED');
  let target;
  try { target = new URL(process.env.AUDIO_SMOKE_BASE_URL); }
  catch { throw new WrapperError('INVALID_BASE_URL'); }
  requireCondition(!target.username && !target.password && !target.search && !target.hash && target.pathname === '/', 'BASE_MUST_BE_BARE_ORIGIN');
  const loopback = ['http:', 'https:'].includes(target.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
  requireCondition(target.origin === 'https://77.239.111.64' || loopback, 'TARGET_NOT_ALLOWED');
  requireCondition(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS_VERIFICATION_MUST_REMAIN_ENABLED');
  requireCondition(process.env.AUDIO_SMOKE_HEADED !== '1', 'HEADLESS_RUN_REQUIRED');
  return target;
}

/** Keep generated files in this repository and reject symlink escapes. */
async function containedLocation(value) {
  const location = path.resolve(root, value);
  requireCondition(location.startsWith(`${root}${path.sep}`), 'ARTIFACT_PATH_OUTSIDE_REPOSITORY');
  const realRoot = await realpath(root);
  let ancestor = location;
  while (true) {
    try {
      const resolved = await realpath(ancestor);
      requireCondition(resolved === realRoot || resolved.startsWith(`${realRoot}${path.sep}`), 'ARTIFACT_SYMLINK_ESCAPE');
      break;
    } catch (error) {
      if (error instanceof WrapperError || error.code !== 'ENOENT') throw error;
      ancestor = path.dirname(ancestor);
    }
  }
  return location;
}

/** Refuse to overwrite an earlier canonical result or its provenance. */
async function requireFreshOutput(out) {
  for (const name of ['results.json', 'canonical-provenance.json']) {
    try { await stat(path.join(out, name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new WrapperError('OUTPUT_ALREADY_CONTAINS_RESULTS');
  }
}

let temporaryDirectory;
try {
  const args = process.argv.slice(2);
  requireCondition(args.length === 0 || (args.length === 1 && args[0] === '--check'), 'USE_NO_ARGUMENTS_OR_CHECK');
  const checkOnly = args[0] === '--check';
  const target = validateTarget();
  const canonical = await readFile(canonicalPath, 'utf8');
  requireCondition(canonical.split(strictContext).length === 2, 'CANONICAL_CONTEXT_CHANGED');
  requireCondition(!/ignoreHTTPSErrors|ignore-certificate-errors|NODE_TLS_REJECT_UNAUTHORIZED/.test(canonical), 'CANONICAL_TLS_POLICY_CHANGED');
  let adapted = replaceOnce(canonical, expectedGuard, replacementGuard, 'CANONICAL_LOOPBACK_GUARD_CHANGED');
  adapted = replaceOnce(adapted, expectedRoot, `const root = ${JSON.stringify(root)};`, 'CANONICAL_ROOT_DERIVATION_CHANGED');
  const temporaryRoot = await containedLocation('.runtime');
  await mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
  temporaryDirectory = await mkdtemp(path.join(temporaryRoot, 'https-audio-runner-'));
  const runnerPath = path.join(temporaryDirectory, 'runner.mjs');
  await writeFile(runnerPath, adapted, { mode: 0o600, flag: 'wx' });
  // Parse the adapted module without importing it or launching a browser.
  execFileSync(process.execPath, ['--check', runnerPath], { stdio: 'pipe' });
  const canonicalSha256 = sha256(canonical);
  if (checkOnly) {
    console.log(`PASS wrapper guards and adapted syntax; canonical SHA256 ${canonicalSha256}; no browser launched.`);
  } else {
    const out = await containedLocation(process.env.AUDIO_SMOKE_OUTPUT || `output/playwright/https-audio-${Date.now()}`);
    await requireFreshOutput(out);
    await mkdir(out, { recursive: true, mode: 0o700 });
    process.env.AUDIO_SMOKE_OUTPUT = out;
    const provenance = {
      canonicalRelativePath, canonicalSha256,
      canonicalGitBlobSha: execFileSync('git', ['rev-parse', `HEAD:${canonicalRelativePath}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
      checkoutGitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
      adaptedRunnerSha256: sha256(adapted),
      wrapperSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
      adaptations: ['explicit HTTPS-IP-or-loopback target guard', 'absolute repository root for temporary module'],
      targetOrigin: target.origin, tlsErrorsIgnored: false,
      startedAt: new Date().toISOString(), finishedAt: null, status: 'RUNNING',
      limitation: 'Canonical checkout provenance is separate from the deployment SHA. Browser checks do not prove physical iPhone acceptance.',
    };
    const provenancePath = path.join(out, 'canonical-provenance.json');
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    try {
      await import(pathToFileURL(runnerPath).href);
      const result = JSON.parse(await readFile(path.join(out, 'results.json'), 'utf8'));
      provenance.status = result.status === 'PASS' && !process.exitCode ? 'PASS' : 'FAIL';
      if (provenance.status !== 'PASS') process.exitCode = 1;
    } catch {
      provenance.status = 'FAIL';
      throw new WrapperError('CANONICAL_EXECUTION_FAILED');
    } finally {
      provenance.finishedAt = new Date().toISOString();
      await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o600 });
    }
  }
} catch (error) {
  // Raw Playwright/process errors may contain entered values. Never print them.
  console.error(`HTTPS browser smoke stopped: ${error instanceof WrapperError ? error.code : 'WRAPPER_SETUP_OR_IO_FAILED'}.`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) {
    try { await rm(temporaryDirectory, { recursive: true, force: true }); }
    catch { console.error('Temporary runner cleanup failed.'); process.exitCode = 1; }
  }
}
