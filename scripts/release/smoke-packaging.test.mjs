import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { parseEnvironment, validateEnvironment } from './launch-lib.mjs';
import { createSourceEdge } from '../../app/installer/hackathon/source-edge.mjs';

const candidate = { HACKATHON_OWNER: 'agent-a', HACKATHON_INSTANCE_ID: 'ryadom_a_test',
  HACKATHON_SOURCE_SHA: 'a'.repeat(40), HACKATHON_SECRETS_MASTER_KEY_B64: Buffer.alloc(32, 1).toString('base64') };
test('environment preserves literal quoted secrets and rejects executable/ambiguous formats', () => {
  assert.equal(parseEnvironment("HACKATHON_LLM_API_KEY='literal$token'").HACKATHON_LLM_API_KEY, 'literal$token');
  assert.throws(() => parseEnvironment('HACKATHON_LLM_API_KEY=$TOKEN'));
  assert.throws(() => parseEnvironment('HACKATHON_LLM_API_KEY=x\nHACKATHON_LLM_API_KEY=y'));
  assert.throws(() => parseEnvironment('NODE_OPTIONS=--inspect'));
});
test('owner isolation, full SHA and master key are required', () => {
  assert.equal(validateEnvironment(candidate).HACKATHON_GATEWAY_PORT, '18787');
  assert.throws(() => validateEnvironment({ ...candidate, HACKATHON_INSTANCE_ID: 'ryadom_c' }));
  assert.throws(() => validateEnvironment({ ...candidate, HACKATHON_SOURCE_SHA: 'latest' }));
  assert.throws(() => validateEnvironment({ ...candidate, HACKATHON_UI_PORT: '17073' }));
  assert.throws(() => validateEnvironment({ ...candidate, HACKATHON_SECRETS_MASTER_KEY_B64: 'short' }));
});
test('production source edge serves built files and streams API with auth/status/cookies preserved', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ryadom-edge-test-'));
  let edge;
  const upstream = createServer((req, res) => {
    res.writeHead(req.headers.authorization === 'Bearer synthetic' ? 200 : 401, { 'Content-Type': 'application/json', 'Set-Cookie': 'synthetic=1; HttpOnly' });
    res.end(JSON.stringify({ path: req.url, method: req.method }));
  });
  try {
    await writeFile(path.join(directory, 'index.html'), '<div id="root"></div>');
    await writeFile(path.join(directory, 'app.js'), 'export const release=true;');
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    edge = createSourceEdge({ webRoot: directory, gatewayPort: upstream.address().port, sourceSha: candidate.HACKATHON_SOURCE_SHA });
    await new Promise((resolve) => edge.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${edge.address().port}`;
    assert.match(await (await fetch(base)).text(), /id="root"/);
    assert.equal((await fetch(`${base}/app.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal((await fetch(`${base}/missing.js`)).status, 404);
    assert.equal((await fetch(`${base}/release.json`)).headers.get('cache-control'), 'no-store');
    assert.equal((await (await fetch(`${base}/release.json`)).json()).source_sha, candidate.HACKATHON_SOURCE_SHA);
    assert.equal((await fetch(`${base}/api/goals/synthetic`)).status, 401);
    const response = await fetch(`${base}/api/goals/synthetic?x=1`, { headers: { Authorization: 'Bearer synthetic' }, method: 'POST', body: '{}' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.deepEqual(await response.json(), { path: '/goals/synthetic?x=1', method: 'POST' });
    assert.equal((await fetch(`${base}/%2e%2e%2foutside.txt`)).status, 403);
  } finally {
    edge?.closeAllConnections(); upstream.closeAllConnections();
    if (edge) await new Promise((resolve) => edge.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
