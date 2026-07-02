import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ArtworkStore, StoreError } from '../lib/store.mjs';

const png = { data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), type: 'image/png' };
const target = Buffer.alloc(128, 7);

async function freshStore(opts) {
  const dir = await mkdtemp(path.join(tmpdir(), 'gallery-store-'));
  const store = new ArtworkStore(dir, opts);
  await store.init();
  test.after(() => rm(dir, { recursive: true, force: true }));
  return store;
}

test('create → get round-trip with video', async () => {
  const store = await freshStore();
  const meta = await store.create({
    title: 'Bay',
    target,
    image: png,
    video: { data: Buffer.from('webmish'), type: 'video/webm' },
  });

  assert.match(meta.id, /^[A-Za-z0-9_-]{16}$/);
  const got = await store.get(meta.id);
  assert.equal(got.title, 'Bay');
  assert.equal(got.files.video, 'video.webm');

  const file = await store.filePath(meta.id, 'target');
  assert.equal(file.size, 128);
  assert.equal(file.type, 'application/octet-stream');
  const img = await store.filePath(meta.id, 'image');
  assert.equal(img.type, 'image/png');
});

test('artwork without video 404s on the video file', async () => {
  const store = await freshStore();
  const meta = await store.create({ title: '', target, image: png });
  await assert.rejects(store.filePath(meta.id, 'video'), (e) => e instanceof StoreError && e.status === 404);
});

test('get of unknown id throws 404, bad id throws 400', async () => {
  const store = await freshStore();
  await assert.rejects(store.get('AAAAAAAAAAAAAAAA'), (e) => e.status === 404);
  await assert.rejects(store.get('../escape'), (e) => e.status === 400);
});

test('evicts oldest artworks beyond the cap', async () => {
  const store = await freshStore({ maxArtworks: 2 });
  const first = await store.create({ title: '1', target, image: png });
  const second = await store.create({ title: '2', target, image: png });
  const third = await store.create({ title: '3', target, image: png });

  await assert.rejects(store.get(first.id), (e) => e.status === 404);
  assert.equal((await store.get(second.id)).title, '2');
  assert.equal((await store.get(third.id)).title, '3');
});

test('init clears leftover temp uploads', async () => {
  const store = await freshStore();
  const entries = await readdir(path.join(store.dataDir, '.tmp'));
  assert.equal(entries.length, 0);
});
