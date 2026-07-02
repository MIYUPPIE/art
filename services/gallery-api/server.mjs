// Gallery API — stores scannable artworks (image + compiled MindAR target +
// optional video) and serves them back to any device via share links.
//
// Zero dependencies. See contracts/gallery-api.md for the wire contract.
// Entry point: index.mjs. This module exports the server factory so tests can
// boot it on an ephemeral port.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import { parseMultipart, boundaryFrom, MultipartError } from './lib/multipart.mjs';
import { ArtworkStore, StoreError } from './lib/store.mjs';
import { RateLimiter } from './lib/ratelimit.mjs';
import {
  LIMITS, sniffImage, sniffVideo, validTarget, sanitizeTitle, validId,
} from './lib/validate.mjs';

const API_VERSION = 1;

export async function createGalleryServer({
  dataDir,
  maxArtworks = 500,
  trustProxy = false,
  rateLimiter = new RateLimiter({ capacity: 10, refillMs: 6000 }),
  limits = LIMITS,
} = {}) {
  const store = new ArtworkStore(dataDir, { maxArtworks });
  await store.init();

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      // Last-resort guard: never let one request crash the process.
      console.error(`[gallery-api] ${req.method} ${req.url} failed:`, err);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      else res.destroy();
    });
  });

  async function handle(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      return res.end();
    }

    const url = new URL(req.url, 'http://local');
    const seg = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    // Accept both /api/... (through the reverse proxy) and /... (direct).
    if (seg[0] === 'api') seg.shift();

    if (seg[0] === 'health' && isRead(req)) {
      return sendJson(res, 200, { ok: true, version: API_VERSION });
    }

    if (seg[0] === 'artworks') {
      if (seg.length === 1 && req.method === 'POST') return createArtwork(req, res);
      if (seg.length === 2 && isRead(req)) return artworkMeta(req, res, seg[1]);
      if (seg.length === 3 && isRead(req)) return artworkFile(req, res, seg[1], seg[2]);
    }

    sendJson(res, 404, { error: 'not found' });
  }

  async function createArtwork(req, res) {
    if (!rateLimiter.allow(clientIp(req))) {
      return sendJson(res, 429, { error: 'too many uploads, slow down' });
    }

    const boundary = boundaryFrom(req.headers['content-type']);
    if (!boundary) return sendJson(res, 415, { error: 'expected multipart/form-data' });

    let body;
    try {
      body = await readBody(req, limits.body);
    } catch (e) {
      if (e.code === 'TOO_LARGE') {
        // The client may still be mid-upload; close the connection once the 413
        // is flushed instead of waiting for a body we will never read.
        res.setHeader('Connection', 'close');
        sendJson(res, 413, { error: 'upload too large' });
        res.once('finish', () => req.destroy());
        return;
      }
      throw e;
    }

    let parts;
    try {
      parts = parseMultipart(body, boundary);
    } catch (e) {
      if (e instanceof MultipartError) return sendJson(res, 400, { error: `bad upload: ${e.message}` });
      throw e;
    }
    const field = Object.fromEntries(parts.map((p) => [p.name, p]));

    const target = field.target?.data;
    if (!validTarget(target)) {
      return sendJson(res, 400, { error: 'missing or invalid compiled target (.mind)' });
    }

    const imageType = sniffImage(field.image?.data);
    if (!imageType) return sendJson(res, 415, { error: 'image must be PNG, JPEG, or WebP' });
    if (field.image.data.length > limits.image) return sendJson(res, 413, { error: 'image too large' });

    let video = null;
    if (field.video && field.video.data.length > 0) {
      const videoType = sniffVideo(field.video.data);
      if (!videoType) return sendJson(res, 415, { error: 'video must be MP4, WebM, or Ogg' });
      if (field.video.data.length > limits.video) return sendJson(res, 413, { error: 'video too large' });
      video = { data: field.video.data, type: videoType };
    }

    const meta = await store.create({
      title: sanitizeTitle(field.title?.data.toString('utf8')),
      target,
      image: { data: field.image.data, type: imageType },
      video,
    });

    sendJson(res, 201, publicMeta(meta));
  }

  async function artworkMeta(req, res, id) {
    if (!validId(id)) return sendJson(res, 400, { error: 'bad artwork id' });
    try {
      const meta = await store.get(id);
      res.setHeader('Cache-Control', 'public, max-age=60');
      sendJson(res, 200, publicMeta(meta));
    } catch (e) {
      if (e instanceof StoreError) return sendJson(res, e.status, { error: e.message });
      throw e;
    }
  }

  async function artworkFile(req, res, id, kind) {
    if (!validId(id) || !['target', 'image', 'video'].includes(kind)) {
      return sendJson(res, 404, { error: 'not found' });
    }
    let file;
    try {
      file = await store.filePath(id, kind);
    } catch (e) {
      if (e instanceof StoreError) return sendJson(res, e.status, { error: e.message });
      throw e;
    }

    // Stored files are immutable per id — cache hard. Range support matters:
    // iOS Safari will not play media from servers that ignore byte ranges.
    const headers = {
      'Content-Type': file.type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };

    const range = parseRange(req.headers.range, file.size);
    if (range === 'invalid') {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${file.size}` });
      return res.end();
    }

    const [start, end] = range ?? [0, file.size - 1];
    const status = range ? 206 : 200;
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${file.size}`;
    headers['Content-Length'] = end - start + 1;

    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    await pipeline(createReadStream(file.path, { start, end }), res);
  }

  function clientIp(req) {
    if (trustProxy) {
      const fwd = req.headers['x-forwarded-for'];
      if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  return { server, store };
}

function isRead(req) {
  return req.method === 'GET' || req.method === 'HEAD';
}

// Buffer the request body, aborting as soon as the cap is crossed so an
// oversized upload can't exhaust memory before we reject it.
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return reject(tooLarge());
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.pause(); // stop the flow; the caller responds 413 and closes
        return reject(tooLarge());
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function tooLarge() {
  const e = new Error('body exceeds limit');
  e.code = 'TOO_LARGE';
  return e;
}

// Single-range `bytes=start-end` parser. Returns [start, end], null (no/ignored
// header), or 'invalid' (unsatisfiable → 416).
export function parseRange(header, size) {
  if (!header || size === 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null; // malformed → serve whole file
  if (m[1] === '') {
    // suffix form: last N bytes
    const n = Math.min(Number(m[2]), size);
    return n === 0 ? 'invalid' : [size - n, size - 1];
  }
  const start = Number(m[1]);
  if (start >= size) return 'invalid';
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (end < start) return 'invalid';
  return [start, end];
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// External shape: internal storage names stay private; clients build file URLs
// from the documented /artworks/:id/<kind> routes.
function publicMeta(meta) {
  return {
    id: meta.id,
    title: meta.title,
    createdAt: meta.createdAt,
    hasVideo: Boolean(meta.files.video),
  };
}
