#!/usr/bin/env node
// Zero-dependency static dev server with correct MIME types and HTTP range
// support (needed for <video> seeking). localhost is a secure context, so the
// camera works without HTTPS during local development.
//
// /api/* is proxied to the gallery-api service (same-origin, exactly like the
// production nginx config). Start it with `npm run api`, or `npm run dev` for
// both at once — without it the app simply hides the share features.
import http from 'node:http';
import { stat, readFile, open } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const API_UPSTREAM = process.env.API_UPSTREAM || 'http://127.0.0.1:8787';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mind': 'application/octet-stream',
  '.ico': 'image/x-icon',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  return join(ROOT, rel);
}

function proxyApi(req, res) {
  const upstream = new URL(req.url, API_UPSTREAM);
  const fwd = http.request(upstream, { method: req.method, headers: req.headers }, (up) => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  fwd.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end('{"error":"gallery-api is not running (npm run api)"}');
  });
  req.pipe(fwd);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) return proxyApi(req, res);
    let filePath = safePath(req.url === '/' ? '/index.html' : req.url);
    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;

    if (range && /^bytes=/.test(range)) {
      const [startStr, endStr] = range.replace('bytes=', '').split('-');
      const start = Number(startStr);
      const end = endStr ? Number(endStr) : info.size - 1;
      const fh = await open(filePath, 'r');
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${info.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      fh.createReadStream({ start, end }).pipe(res).on('close', () => fh.close());
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`AR Art Gallery dev server: http://localhost:${PORT}`);
  console.log(`Compile your own artwork:  http://localhost:${PORT}/tools/compile.html`);
});
