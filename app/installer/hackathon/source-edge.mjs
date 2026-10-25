import { createServer, request as httpRequest } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

export function createSourceEdge({ webRoot, gatewayPort, sourceSha }) {
  return createServer(async (req, res) => {
    if (req.url === '/health' || req.url === '/api' || req.url?.startsWith('/api/')) {
      const upstream = httpRequest({ host: '127.0.0.1', port: gatewayPort,
        path: req.url === '/health' ? '/health' : req.url.slice(4) || '/', method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${gatewayPort}`, 'x-forwarded-for': req.socket.remoteAddress || '127.0.0.1' },
      }, (response) => { res.writeHead(response.statusCode || 502, response.headers); response.pipe(res); });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"error":"gateway_unavailable"}'); });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method || '')) { res.writeHead(405); res.end(); return; }
    if (req.url?.split('?')[0] === '/release.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? '' : JSON.stringify({ source_sha: sourceSha })); return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
      const filename = path.resolve(webRoot, `.${pathname}`);
      if (!filename.startsWith(`${path.resolve(webRoot)}${path.sep}`) && filename !== path.resolve(webRoot)) { res.writeHead(403); res.end(); return; }
      let target = filename;
      let info;
      try { info = await stat(target); } catch {}
      if (!info?.isFile()) {
        if (path.extname(pathname)) { res.writeHead(404); res.end(); return; }
        target = path.join(webRoot, 'index.html'); info = await stat(target);
      }
      res.writeHead(200, { 'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream',
        'Content-Length': info.size, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') res.end();
      else createReadStream(target).on('error', () => res.destroy()).pipe(res);
    } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
  });
}
