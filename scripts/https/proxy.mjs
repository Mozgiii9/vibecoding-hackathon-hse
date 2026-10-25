import http from 'node:http';
import https from 'node:https';
import { constants, readFileSync, realpathSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { isIP } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = '/srv/ryadom-hackathon/integration';
const HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];
function headersWithoutHop(headers) {
  const blocked = new Set([...HOP, ...(headers.connection || '').split(',').map((name) => name.trim().toLowerCase())]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !blocked.has(name)));
}
function end(res, status) { if (!res.headersSent) { if (status === 413) res.shouldKeepAlive = false; res.writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); } res.end(); }

/** Creates listeners without binding ports; TLS is required for application traffic. */
export function createProxy({ publicHost, challengeRoot, uiPort = 17073, apiPort = 18789, tls = null, httpEnabled = true, maxBodyBytes = 12 * 1024 * 1024 }) {
  if (!isIP(publicHost) || !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1) throw new Error('Invalid proxy configuration');
  if (typeof httpEnabled !== 'boolean' || (!httpEnabled && !tls)) throw new Error('Challenge phase requires HTTP');
  const authority = isIP(publicHost) === 6 ? `[${publicHost}]` : publicHost;
  const proxy = (req, res) => {
    if (!req.url?.startsWith('/') || req.url.startsWith('//') || req.url.includes('\\')) { end(res, 400); return; }
    const length = req.headers['content-length'];
    if (length && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) { end(res, 413); req.resume(); return; }
    const api = /^\/api(?:\/|\?|$)/.test(req.url);
    const stripped = api ? req.url.slice(4) : req.url;
    const headers = headersWithoutHop(req.headers);
    for (const key of Object.keys(headers)) if (/^(x-forwarded-|forwarded$|x-real-ip$)/i.test(key)) delete headers[key];
    Object.assign(headers, { host: authority, 'x-forwarded-host': authority, 'x-forwarded-proto': req.socket.encrypted ? 'https' : 'http',
      'x-forwarded-for': req.socket.remoteAddress, 'x-real-ip': req.socket.remoteAddress });
    let exceeded = false;
    const upstream = http.request({ hostname: '127.0.0.1', port: api ? apiPort : uiPort, method: req.method,
      path: stripped.startsWith('?') ? `/${stripped}` : stripped || '/', headers }, (reply) => {
      if (exceeded) { reply.destroy(); return; }
      res.writeHead(reply.statusCode || 502, headersWithoutHop(reply.headers));
      reply.on('error', () => res.destroy()); reply.pipe(res);
    });
    upstream.setTimeout(180_000, () => { upstream.destroy(); end(res, 504); });
    upstream.on('error', () => { if (!exceeded && !res.writableEnded) end(res, 502); });
    let bytes = 0;
    const limit = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBodyBytes) { exceeded = true; req.unpipe(this); upstream.destroy(); end(res, 413); req.resume(); callback(); }
      else callback(null, chunk);
    } });
    req.on('aborted', () => upstream.destroy()); req.on('error', () => upstream.destroy());
    res.on('close', () => upstream.destroy()); req.pipe(limit).pipe(upstream);
  };
  const httpsServer = tls ? https.createServer({ ...tls, minVersion: 'TLSv1.2' }, proxy) : null;
  const httpServer = httpEnabled ? http.createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] || '';
    if (pathname.startsWith('/.well-known/acme-challenge')) {
      const token = /^\/\.well-known\/acme-challenge\/([A-Za-z0-9_-]{1,128})$/.exec(pathname)?.[1];
      if (!token || !['GET', 'HEAD'].includes(req.method)) { end(res, 404); return; }
      let file;
      try {
        const directory = path.resolve(challengeRoot, '.well-known/acme-challenge');
        if (await realpath(directory) !== directory) { end(res, 404); return; }
        file = await open(path.join(directory, token), constants.O_RDONLY | constants.O_NOFOLLOW);
        const info = await file.stat();
        if (!info.isFile()) { await file.close(); end(res, 404); return; }
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
        if (req.method === 'HEAD') { await file.close(); res.end(); }
        else file.createReadStream().on('error', () => res.destroy()).pipe(res);
      } catch { if (file) await file.close().catch(() => {}); end(res, 404); }
      return;
    }
    if (!httpsServer) { end(res, 503); return; }
    if (!req.url?.startsWith('/') || req.url.startsWith('//') || /[\\\r\n]/.test(req.url)) { end(res, 400); return; }
    res.writeHead(308, { Location: `https://${authority}${req.url}`, 'Cache-Control': 'no-store' }); res.end();
  }) : null;
  return { httpServer, httpsServer, reloadTLS: (options) => { if (!httpsServer) throw new Error('TLS listener unavailable'); httpsServer.setSecureContext(options); } };
}

/** Reads private runtime configuration; no provider credentials are accepted or logged. */
export function readConfig(filename) {
  const contained = (value) => { const resolved = path.resolve(value); if (!resolved.startsWith(`${ROOT}/`)) throw new Error('Runtime path outside integration workspace'); return resolved; };
  const privateFile = contained(realpathSync(filename));
  if (!statSync(privateFile).isFile() || (statSync(privateFile).mode & 0o077)) throw new Error('Private configuration requires mode 600');
  const values = {};
  const allowed = new Set(['RUNTIME_DIR', 'PUBLIC_IP', 'BIND_HOST', 'HTTP_ENABLED', 'HTTP_PORT', 'TLS_PORT', 'UI_PORT', 'API_PORT', 'WEBROOT', 'FULLCHAIN', 'KEY', 'PIDFILE']);
  for (const line of readFileSync(privateFile, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^HACKATHON_HTTPS_([A-Z_]+)=(.*)$/.exec(line);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(values, match[1]) || /[\x00-\x1f]/.test(match[2])) throw new Error('Invalid HTTPS configuration');
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  const runtime = contained(values.RUNTIME_DIR || `${ROOT}/https`);
  const localPath = (value) => { const resolved = contained(value); if (!resolved.startsWith(`${runtime}/`)) throw new Error('Path outside HTTPS runtime'); return resolved; };
  const port = (name, fallback) => { const value = Number(values[name] || fallback); if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Invalid HTTPS port'); return value; };
  if (!/^[01]$/.test(values.HTTP_ENABLED ?? '1')) throw new Error('HTTP_ENABLED must be 0 or 1');
  const config = { publicHost: values.PUBLIC_IP || '77.239.111.64', bindHost: values.BIND_HOST || '0.0.0.0',
    httpEnabled: (values.HTTP_ENABLED ?? '1') === '1',
    httpPort: port('HTTP_PORT', 80), tlsPort: port('TLS_PORT', 443), uiPort: port('UI_PORT', 17073), apiPort: port('API_PORT', 18789),
    challengeRoot: localPath(values.WEBROOT || `${runtime}/acme`), certPath: localPath(values.FULLCHAIN || `${runtime}/fullchain.pem`),
    keyPath: localPath(values.KEY || `${runtime}/privkey.pem`), pidfile: localPath(values.PIDFILE || `${runtime}/proxy.pid`) };
  if (!isIP(config.publicHost) || !isIP(config.bindHost) || new Set([config.httpPort, config.tlsPort, config.uiPort, config.apiPort]).size !== 4) throw new Error('Invalid listener configuration');
  if (realpathSync(runtime) !== runtime || realpathSync(path.dirname(config.pidfile)) !== path.dirname(config.pidfile)) throw new Error('Runtime symlinks are forbidden');
  return config;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let listeners, config, ownPidfile = false;
  const stop = () => { for (const server of [listeners?.httpServer, listeners?.httpsServer]) { server?.close(); server?.closeAllConnections(); } if (ownPidfile) { unlinkSync(config.pidfile); ownPidfile = false; } };
  try {
    const [mode, filename] = process.argv.slice(2);
    if (!['challenge', 'tls'].includes(mode) || !filename || process.argv.length !== 4) throw new Error('Usage: proxy.mjs <challenge|tls> <private.env>');
    config = readConfig(filename);
    const readTLS = () => {
      for (const name of [config.certPath, config.keyPath]) if (!realpathSync(name).startsWith(`${ROOT}/`)) throw new Error('TLS material outside integration workspace');
      return { cert: readFileSync(config.certPath), key: readFileSync(config.keyPath) };
    };
    listeners = createProxy({ ...config, tls: mode === 'tls' ? readTLS() : null });
    writeFileSync(config.pidfile, `${process.pid}\n`, { flag: 'wx', mode: 0o600 }); ownPidfile = true;
    for (const [server, port] of [[listeners.httpServer, config.httpPort], [listeners.httpsServer, config.tlsPort]]) {
      if (server) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, config.bindHost, resolve); });
    }
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
    if (mode === 'tls') process.on('SIGHUP', () => { try { listeners.reloadTLS(readTLS()); } catch { console.error('TLS reload failed; previous certificate retained'); } });
    console.log(`HTTPS proxy ready (${mode}); PID ${process.pid}`);
  } catch { stop(); console.error('HTTPS proxy startup failed; verify private config, PEM files and unoccupied ports'); process.exitCode = 1; }
}
