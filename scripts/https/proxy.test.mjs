import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { mkdtemp, mkdir, writeFile, readFile, realpath, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { createProxy, readConfig } from './proxy.mjs';

let root, tls;
before(async () => {
  root = await realpath(await mkdtemp(path.join(tmpdir(), 'ryadom-https-test-')));
  await mkdir(path.join(root, '.well-known/acme-challenge'), { recursive: true });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1,DNS:attacker.example', '-keyout', path.join(root, 'test-key.pem'), '-out', path.join(root, 'test-cert.pem')], { stdio: 'ignore' });
  tls = { cert: await readFile(path.join(root, 'test-cert.pem')), key: await readFile(path.join(root, 'test-key.pem')) };
});
after(async () => { if (root) await rm(root, { recursive: true, force: true }); });
const listen = async (server) => { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); return server.address().port; };
const close = async (...servers) => { await Promise.all(servers.filter(Boolean).map((server) => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }))); };
function request(port, pathname, { secure = false, method = 'GET', headers = {}, body, chunks } = {}) {
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request({ hostname: '127.0.0.1', port, path: pathname, method, headers, agent: false, ...(secure ? { ca: tls.cert } : {}) }, (res) => {
      const buffers = []; res.on('data', (chunk) => buffers.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(buffers).toString() })); res.on('error', reject);
    });
    req.setTimeout(3000, () => req.destroy(new Error('Synthetic request timeout'))); req.on('error', reject);
    if (chunks) for (const chunk of chunks) req.write(chunk);
    req.end(body);
  });
}

test('challenge phase serves only strict regular token files; other routes are 503', async () => {
  const token = 'synthetic_Challenge-123';
  await writeFile(path.join(root, '.well-known/acme-challenge', token), 'synthetic-proof');
  await writeFile(path.join(root, 'outside'), 'not a challenge');
  await symlink(path.join(root, 'outside'), path.join(root, '.well-known/acme-challenge', 'linked'));
  const { httpServer, httpsServer } = createProxy({ publicHost: '127.0.0.1', challengeRoot: root });
  assert.equal(httpsServer, null);
  try {
    const port = await listen(httpServer);
    assert.equal((await request(port, '/')).status, 503);
    assert.equal((await request(port, '/api/auth/login')).status, 503);
    const response = await request(port, `/.well-known/acme-challenge/${token}`);
    assert.equal(response.status, 200); assert.equal(response.text, 'synthetic-proof');
    assert.equal((await request(port, `/.well-known/acme-challenge/${token}`, { method: 'HEAD' })).text, '');
    for (const unsafe of ['../outside', '%2e%2e%2foutside', 'linked', 'bad.token', 'x/y', '', 'a'.repeat(129)]) {
      assert.equal((await request(port, `/.well-known/acme-challenge/${unsafe}`)).status, 404, unsafe);
    }
    assert.equal((await request(port, `/.well-known/acme-challenge/${token}`, { method: 'POST' })).status, 404);
  } finally { await close(httpServer); }
});

test('challenge rejects symlinked parent directories', async () => {
  const webroot = path.join(root, 'linked-root'); await mkdir(webroot);
  await symlink(path.join(root, '.well-known'), path.join(webroot, '.well-known'));
  const { httpServer } = createProxy({ publicHost: '127.0.0.1', challengeRoot: webroot });
  try { assert.equal((await request(await listen(httpServer), '/.well-known/acme-challenge/synthetic_Challenge-123')).status, 404); }
  finally { await close(httpServer); }
});

test('TLS forwards UI/API, auth, cookies and body; sanitizes proxy headers; HTTP redirects safely', async () => {
  const captures = [];
  const makeUpstream = (name) => http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    captures.push({ name, path: req.url, headers: req.headers, body });
    res.writeHead(201, { 'Content-Type': 'application/json', 'Set-Cookie': ['synthetic=1; HttpOnly; Secure', 'other=2; SameSite=Strict'] }); res.end(name);
  });
  const ui = makeUpstream('ui'), api = makeUpstream('api'); let servers;
  try {
    servers = createProxy({ publicHost: '127.0.0.1', challengeRoot: root, tls, uiPort: await listen(ui), apiPort: await listen(api) });
    const httpPort = await listen(servers.httpServer), tlsPort = await listen(servers.httpsServer);
    const headers = { Authorization: 'Bearer synthetic', Cookie: 'synthetic-client=1', Host: 'attacker.example', 'Content-Type': 'audio/wav',
      Forwarded: 'host=attacker.example', 'X-Forwarded-For': '198.51.100.1', 'X-Forwarded-Proto': 'http', 'X-Forwarded-Host': 'attacker.example', 'X-Real-IP': '198.51.100.1' };
    const response = await request(tlsPort, '/api/context/audio?goal=synthetic', { secure: true, method: 'POST', headers, body: 'synthetic-wav' });
    assert.equal(response.status, 201); assert.equal(response.headers['set-cookie'].length, 2);
    const item = captures[0]; assert.equal(item.name, 'api'); assert.equal(item.path, '/context/audio?goal=synthetic'); assert.equal(item.body, 'synthetic-wav');
    assert.equal(item.headers.authorization, 'Bearer synthetic'); assert.equal(item.headers.cookie, 'synthetic-client=1'); assert.equal(item.headers['content-type'], 'audio/wav');
    assert.equal(item.headers.host, '127.0.0.1'); assert.equal(item.headers['x-forwarded-proto'], 'https'); assert.equal(item.headers['x-forwarded-for'], '127.0.0.1');
    assert.equal(item.headers['x-forwarded-host'], '127.0.0.1'); assert.equal(item.headers.forwarded, undefined); assert.equal(item.headers['x-real-ip'], '127.0.0.1');
    await request(tlsPort, '/api?x=1', { secure: true }); assert.equal(captures[1].path, '/?x=1');
    await request(tlsPort, '/assets/app.js', { secure: true }); assert.equal(captures[2].name, 'ui'); assert.equal(captures[2].path, '/assets/app.js');
    const redirect = await request(httpPort, '/a?b=1', { headers: { Host: 'attacker.example' } });
    assert.equal(redirect.status, 308); assert.equal(redirect.headers.location, 'https://127.0.0.1/a?b=1');
    assert.equal((await request(httpPort, '//attacker.example/a')).status, 400);
    servers.reloadTLS(tls); assert.equal((await request(tlsPort, '/', { secure: true })).status, 201);
    assert.throws(() => servers.reloadTLS({ cert: 'invalid', key: 'invalid' }));
    assert.equal((await request(tlsPort, '/', { secure: true })).status, 201);
  } finally { await close(servers?.httpServer, servers?.httpsServer, ui, api); }
});

test('SSE first chunk arrives before upstream response completes', async () => {
  let upstreamResponse;
  const upstream = http.createServer((_req, res) => { upstreamResponse = res; res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: first\n\n'); });
  let servers;
  try {
    servers = createProxy({ publicHost: '127.0.0.1', challengeRoot: root, tls, apiPort: await listen(upstream) });
    const port = await listen(servers.httpsServer);
    let req;
    const firstChunk = await new Promise((resolve, reject) => {
      req = https.get({ hostname: '127.0.0.1', port, path: '/api/events', ca: tls.cert }, (res) => res.once('data', (chunk) => resolve(chunk.toString())));
      req.setTimeout(3000, () => req.destroy(new Error('SSE buffered'))); req.on('error', reject);
    });
    assert.match(firstChunk, /data: first/); assert.equal(upstreamResponse.writableEnded, false);
    upstreamResponse.end('data: done\n\n'); req.destroy();
  } finally { upstreamResponse?.end(); await close(servers?.httpsServer, upstream); }
});

test('body cap rejects Content-Length before forwarding and bounds chunked uploads', async () => {
  let received = 0, count = 0;
  const upstream = http.createServer((req, res) => { count++; req.on('data', (chunk) => { received += chunk.length; }); req.on('end', () => res.end('accepted')); });
  let servers;
  try {
    servers = createProxy({ publicHost: '127.0.0.1', challengeRoot: root, tls, apiPort: await listen(upstream), maxBodyBytes: 1024 });
    const port = await listen(servers.httpsServer);
    assert.equal((await request(port, '/api/audio', { secure: true, method: 'POST', headers: { 'Content-Length': '1025' } })).status, 413);
    assert.equal(count, 0);
    assert.equal((await request(port, '/api/audio', { secure: true, method: 'POST', chunks: [Buffer.alloc(512), Buffer.alloc(513)] })).status, 413);
    assert.ok(received <= 1024);
    assert.equal((await request(port, '/api/audio', { secure: true, method: 'POST', body: Buffer.alloc(1024) })).status, 200);
    const defaults = createProxy({ publicHost: '127.0.0.1', challengeRoot: root, tls, apiPort: upstream.address().port });
    try { assert.equal((await request(await listen(defaults.httpsServer), '/api/audio', { secure: true, method: 'POST', headers: { 'Content-Length': String(12 * 1024 * 1024 + 1) } })).status, 413); }
    finally { await close(defaults.httpsServer); }
  } finally { await close(servers?.httpsServer, upstream); }
});

test('private config refuses paths outside C workspace', () => {
  assert.throws(() => readConfig(path.join(root, 'test-cert.pem')), /outside integration workspace/);
});

test('an occupied port is preserved instead of replacing its listener', async () => {
  const existing = http.createServer((_req, res) => res.end('existing-service'));
  const { httpServer } = createProxy({ publicHost: '127.0.0.1', challengeRoot: root });
  try {
    const port = await listen(existing);
    await assert.rejects(new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(port, '127.0.0.1', resolve); }), { code: 'EADDRINUSE' });
    assert.equal((await request(port, '/')).text, 'existing-service');
  } finally { await close(existing, httpServer); }
});

test('TLS-only mode creates no HTTP listener; challenge mode cannot disable HTTP', async () => {
  assert.throws(() => createProxy({ publicHost: '127.0.0.1', challengeRoot: root, httpEnabled: false }), /Challenge phase requires HTTP/);
  assert.throws(() => createProxy({ publicHost: '127.0.0.1', challengeRoot: root, tls, httpEnabled: '0' }), /Challenge phase requires HTTP/);
  const upstream = http.createServer((_req, res) => res.end('tls-only-upstream'));
  let servers;
  try {
    servers = createProxy({ publicHost: '127.0.0.1', challengeRoot: root, tls, httpEnabled: false, uiPort: await listen(upstream) });
    assert.equal(servers.httpServer, null);
    assert.equal((await request(await listen(servers.httpsServer), '/', { secure: true })).text, 'tls-only-upstream');
  } finally { await close(servers?.httpsServer, upstream); }
});

async function withLanding(callback, { enabled = true } = {}) {
  const captures = [];
  const makeUpstream = (name) => http.createServer((req, res) => {
    captures.push({ name, path: req.url, method: req.method, headers: req.headers });
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Set-Cookie': 'synthetic-upstream=1; HttpOnly' });
    res.end(name);
  });
  const ui = makeUpstream('ui'), api = makeUpstream('api'), landing = makeUpstream('landing');
  let servers;
  try {
    servers = createProxy({ publicHost: '127.0.0.1', challengeRoot: root, tls, httpEnabled: false,
      uiPort: await listen(ui), apiPort: await listen(api), landingPort: enabled ? await listen(landing) : null });
    await callback({ port: await listen(servers.httpsServer), captures });
  } finally { await close(servers?.httpsServer, ui, api, landing); }
}

test('landing routing preserves query, isolates auth/cookies and never reaches gateway', async () => {
  await withLanding(async ({ port, captures }) => {
    const headers = { Authorization: 'Bearer synthetic-app', Cookie: 'synthetic-app-session=1' };
    const redirect = await request(port, '/landing?from=synthetic%20test', { secure: true, headers });
    assert.equal(redirect.status, 308);
    assert.equal(new URL(redirect.headers.location, 'https://127.0.0.1').href, 'https://127.0.0.1/landing/?from=synthetic%20test');
    assert.equal(captures.length, 0);
    for (const [url, stripped] of [['/landing/', '/'], ['/landing/assets/site.css?x=1', '/assets/site.css?x=1'], ['/landing/api/auth/login?x=1', '/api/auth/login?x=1']]) {
      const response = await request(port, url, { secure: true, headers });
      assert.equal(response.status, 200); assert.equal(response.text, 'landing');
      assert.equal(response.headers['set-cookie'], undefined);
      const entry = captures.at(-1);
      assert.equal(entry.name, 'landing'); assert.equal(entry.path, stripped);
      assert.equal(entry.headers.authorization, undefined); assert.equal(entry.headers.cookie, undefined);
    }
    await request(port, '/landing/../api/auth/login', { secure: true, headers });
    assert.equal(captures.some((entry) => entry.name === 'api'), false);
    assert.equal((await request(port, '/landing/', { secure: true, method: 'HEAD', headers })).text, '');
    const ui = await request(port, '/landingish', { secure: true, headers });
    assert.equal(ui.text, 'ui'); assert.equal(captures.at(-1).name, 'ui');
    assert.equal(captures.at(-1).headers.authorization, 'Bearer synthetic-app');
    assert.equal(captures.at(-1).headers.cookie, 'synthetic-app-session=1');
    assert.ok(ui.headers['set-cookie']);
    const api = await request(port, '/api/health', { secure: true, headers });
    assert.equal(api.text, 'api'); assert.equal(captures.at(-1).path, '/health');
  });
});

test('landing config is local static frozen appUrl only; landing methods are read-only', async () => {
  await withLanding(async ({ port, captures }) => {
    const response = await request(port, '/landing/config.js?cache=synthetic', { secure: true,
      headers: { Host: 'attacker.example', Authorization: 'Bearer synthetic-app', Cookie: 'synthetic-app-session=1' } });
    assert.equal(response.status, 200); assert.match(response.headers['content-type'], /(?:java|ecma)script/);
    assert.equal(response.headers['set-cookie'], undefined); assert.equal(captures.length, 0);
    const window = {};
    runInNewContext(response.text, { window }, { timeout: 1000 });
    assert.deepEqual(Object.keys(window), ['RYADOM_CONFIG']);
    assert.deepEqual(Object.keys(window.RYADOM_CONFIG), ['appUrl']);
    assert.equal(window.RYADOM_CONFIG.appUrl, 'https://127.0.0.1/');
    assert.equal(Object.isFrozen(window.RYADOM_CONFIG), true);
    const head = await request(port, '/landing/config.js', { secure: true, method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(head.text, '');
    for (const pathname of ['/landing', '/landing/', '/landing/config.js', '/landing/api/auth/login']) {
      for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await request(port, pathname, { secure: true, method, body: 'synthetic' })).status, 405, `${method} ${pathname}`);
    }
    assert.equal(captures.length, 0);
  });
});

test('landing is opt-in; omitted upstream preserves existing UI behavior', async () => {
  await withLanding(async ({ port, captures }) => {
    assert.equal((await request(port, '/landing/config.js', { secure: true })).text, 'ui');
    assert.deepEqual(captures.map((entry) => entry.name), ['ui']);
  }, { enabled: false });
});
