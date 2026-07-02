import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';

import { createGalleryServer, parseRange } from '../server.mjs';
import { RateLimiter } from '../lib/ratelimit.mjs';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(52, 2)]);
const TARGET = Buffer.alloc(256, 3);

async function boot(opts = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'gallery-srv-'));
  const { server, store } = await createGalleryServer({ dataDir: dir, ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  test.after(async () => {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  return { base, store };
}

function artworkForm({ image = PNG, target = TARGET, video = null, title = 'Test piece' } = {}) {
  const fd = new FormData();
  if (title !== null) fd.set('title', title);
  if (target) fd.set('target', new Blob([target]), 'art.mind');
  if (image) fd.set('image', new Blob([image], { type: 'image/png' }), 'art.png');
  if (video) fd.set('video', new Blob([video], { type: 'video/mp4' }), 'clip.mp4');
  return fd;
}

test('health responds on both /api/health and /health', async () => {
  const { base } = await boot();
  for (const p of ['/api/health', '/health']) {
    const res = await fetch(base + p);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, version: 1 });
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  }
});

test('upload → meta → files round-trip', async () => {
  const { base } = await boot();
  const res = await fetch(`${base}/api/artworks`, { method: 'POST', body: artworkForm({ video: MP4 }) });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.match(created.id, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(created.title, 'Test piece');
  assert.equal(created.hasVideo, true);

  const meta = await (await fetch(`${base}/api/artworks/${created.id}`)).json();
  assert.deepEqual(meta, created);

  const target = await fetch(`${base}/api/artworks/${created.id}/target`);
  assert.equal(target.status, 200);
  assert.equal(target.headers.get('content-type'), 'application/octet-stream');
  assert.equal(target.headers.get('accept-ranges'), 'bytes');
  assert.match(target.headers.get('cache-control'), /immutable/);
  assert.deepEqual(Buffer.from(await target.arrayBuffer()), TARGET);

  const image = await fetch(`${base}/api/artworks/${created.id}/image`);
  assert.equal(image.headers.get('content-type'), 'image/png');

  const video = await fetch(`${base}/api/artworks/${created.id}/video`);
  assert.equal(video.headers.get('content-type'), 'video/mp4');
  assert.equal(Number(video.headers.get('content-length')), MP4.length);
});

test('range requests: partial, suffix, unsatisfiable (iOS video path)', async () => {
  const { base } = await boot();
  const { id } = await (await fetch(`${base}/api/artworks`, { method: 'POST', body: artworkForm({ video: MP4 }) })).json();
  const url = `${base}/api/artworks/${id}/video`;

  const part = await fetch(url, { headers: { Range: 'bytes=0-3' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 0-3/${MP4.length}`);
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), MP4.subarray(0, 4));

  const suffix = await fetch(url, { headers: { Range: 'bytes=-8' } });
  assert.equal(suffix.status, 206);
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), MP4.subarray(MP4.length - 8));

  const open = await fetch(url, { headers: { Range: `bytes=8-` } });
  assert.equal(open.status, 206);
  assert.equal(Number(open.headers.get('content-length')), MP4.length - 8);

  const bad = await fetch(url, { headers: { Range: `bytes=${MP4.length}-` } });
  assert.equal(bad.status, 416);
  assert.equal(bad.headers.get('content-range'), `bytes */${MP4.length}`);
});

test('HEAD returns headers without a body', async () => {
  const { base } = await boot();
  const { id } = await (await fetch(`${base}/api/artworks`, { method: 'POST', body: artworkForm() })).json();
  const res = await fetch(`${base}/api/artworks/${id}/image`, { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(Number(res.headers.get('content-length')), PNG.length);
  assert.equal((await res.arrayBuffer()).byteLength, 0);
});

test('validation: missing target, wrong image format, empty video field, bad multipart', async () => {
  const { base } = await boot();

  const noTarget = await fetch(`${base}/api/artworks`, { method: 'POST', body: artworkForm({ target: null }) });
  assert.equal(noTarget.status, 400);

  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)]);
  const badImage = await fetch(`${base}/api/artworks`, { method: 'POST', body: artworkForm({ image: gif }) });
  assert.equal(badImage.status, 415);

  // Empty video field (user skipped the optional upload) is not an error.
  const emptyVideo = await fetch(`${base}/api/artworks`, { method: 'POST', body: artworkForm({ video: Buffer.alloc(0) }) });
  assert.equal(emptyVideo.status, 201);
  assert.equal((await emptyVideo.json()).hasVideo, false);

  const garbled = await fetch(`${base}/api/artworks`, {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=xyz' },
    body: 'this is not multipart',
  });
  assert.equal(garbled.status, 400);

  const notMultipart = await fetch(`${base}/api/artworks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(notMultipart.status, 415);
});

test('rejects oversized declared content-length up front with 413', async () => {
  const { base } = await boot();
  const status = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/api/artworks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=big',
        'Content-Length': String(200 * 1024 * 1024),
      },
    });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); req.destroy(); });
    req.on('error', reject);
    req.write('partial');
    // Server responds without waiting for the (never-sent) full body.
  });
  assert.equal(status, 413);
});

test('rejects mid-stream overflow (no content-length) with 413', async () => {
  const { base } = await boot({ limits: { body: 1024, image: 1024, video: 1024, target: 1024 } });
  const status = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/api/artworks`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=big', 'Transfer-Encoding': 'chunked' },
    });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); req.destroy(); });
    req.on('error', reject);
    req.write(Buffer.alloc(4096)); // crosses the 1 KiB cap in one chunk
  });
  assert.equal(status, 413);
});

test('unknown routes and ids', async () => {
  const { base } = await boot();
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  assert.equal((await fetch(`${base}/api/artworks/AAAAAAAAAAAAAAAA`)).status, 404);
  assert.equal((await fetch(`${base}/api/artworks/..%2Fescape`)).status, 400);
  assert.equal((await fetch(`${base}/api/artworks/AAAAAAAAAAAAAAAA/video`)).status, 404);
  assert.equal((await fetch(`${base}/api/artworks/AAAAAAAAAAAAAAAA/nonsense`)).status, 404);
});

test('rate limiter returns 429 beyond the burst', async () => {
  const { base } = await boot({ rateLimiter: new RateLimiter({ capacity: 2, refillMs: 60_000 }) });
  assert.equal((await fetch(`${base}/api/artworks`, { method: 'POST', body: artworkForm() })).status, 201);
  assert.equal((await fetch(`${base}/api/artworks`, { method: 'POST', body: artworkForm() })).status, 201);
  assert.equal((await fetch(`${base}/api/artworks`, { method: 'POST', body: artworkForm() })).status, 429);
});

test('OPTIONS preflight advertises methods and headers', async () => {
  const { base } = await boot();
  const res = await fetch(`${base}/api/artworks`, { method: 'OPTIONS' });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(res.headers.get('access-control-allow-headers'), 'Content-Type');
});

test('parseRange edge cases', () => {
  assert.deepEqual(parseRange('bytes=0-0', 10), [0, 0]);
  assert.deepEqual(parseRange('bytes=5-', 10), [5, 9]);
  assert.deepEqual(parseRange('bytes=0-99', 10), [0, 9]); // end clamped
  assert.deepEqual(parseRange('bytes=-4', 10), [6, 9]);
  assert.deepEqual(parseRange('bytes=-99', 10), [0, 9]); // suffix clamped
  assert.equal(parseRange('bytes=10-', 10), 'invalid');
  assert.equal(parseRange('bytes=4-2', 10), 'invalid');
  assert.equal(parseRange('bytes=-0', 10), 'invalid');
  assert.equal(parseRange('bytes=-', 10), null); // malformed → full body
  assert.equal(parseRange('chunks=1-2', 10), null);
  assert.equal(parseRange(undefined, 10), null);
  assert.equal(parseRange('bytes=0-1', 0), null);
});
