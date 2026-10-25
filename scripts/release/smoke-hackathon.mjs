import assert from 'node:assert/strict';
import { readEnvironment } from './launch-lib.mjs';

try {
  const [filename, expectedSha] = process.argv.slice(2);
  if (!filename) throw new Error('Usage: node scripts/release/smoke-hackathon.mjs <private.env> [expected-full-sha]');
  const { values } = readEnvironment(filename);
  const ui = `http://127.0.0.1:${values.HACKATHON_UI_PORT}`;
  const gateway = `http://127.0.0.1:${values.HACKATHON_GATEWAY_PORT}`;
  const get = async (url) => fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  for (const base of [gateway, `${ui}/api`]) {
    const response = await get(`${base}/health`);
    assert.equal(response.status, 200, 'gateway health status');
    assert.equal((await response.json()).status, 'ok', 'gateway health payload');
    assert.equal((await get(`${base}/goals/release-smoke`)).status, 401, 'goals must require authentication');
    const bootstrap = await get(`${base}/auth/bootstrap-status`);
    assert.equal(bootstrap.status, 200, 'auth bootstrap must be reachable');
  }
  const page = await get(ui);
  assert.equal(page.status, 200, 'UI status');
  assert.match(await page.text(), /<div[^>]+id="root"/, 'built React entrypoint');
  const revision = await get(`${ui}/release.json`);
  assert.equal(revision.status, 200, 'release identity status');
  assert.equal((await revision.json()).source_sha, expectedSha || values.HACKATHON_SOURCE_SHA, 'UI candidate SHA');
  console.log('PASS: UI, candidate SHA, direct/proxied gateway health, auth bootstrap, unauthenticated goals denied. No user data written.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Release smoke failed');
  process.exitCode = 1;
}
