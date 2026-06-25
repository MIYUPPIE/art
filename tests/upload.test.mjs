import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUpload,
  formatBytes,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from '../src/core/upload.js';

test('validateUpload accepts a normal image', () => {
  assert.deepEqual(validateUpload({ type: 'image/png', size: 1024 }, 'image'), { ok: true });
  assert.deepEqual(validateUpload({ type: 'image/jpeg', size: 500000 }, 'image'), { ok: true });
});

test('validateUpload rejects a missing file', () => {
  const r = validateUpload(null, 'image');
  assert.equal(r.ok, false);
  assert.match(r.error, /No file/);
});

test('validateUpload rejects the wrong type for the kind', () => {
  const r = validateUpload({ type: 'application/pdf', size: 10 }, 'image');
  assert.equal(r.ok, false);
  assert.match(r.error, /image file/);
  // a video file is not a valid image
  assert.equal(validateUpload({ type: 'video/mp4', size: 10 }, 'image').ok, false);
});

test('validateUpload accepts video for the video kind, rejects images', () => {
  assert.deepEqual(validateUpload({ type: 'video/mp4', size: 1024 }, 'video'), { ok: true });
  assert.equal(validateUpload({ type: 'image/png', size: 1024 }, 'video').ok, false);
});

test('validateUpload enforces size limits per kind', () => {
  assert.equal(validateUpload({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }, 'image').ok, false);
  assert.equal(validateUpload({ type: 'image/png', size: MAX_IMAGE_BYTES }, 'image').ok, true);
  assert.equal(validateUpload({ type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 }, 'video').ok, false);
  // custom limit overrides the default
  assert.equal(validateUpload({ type: 'image/png', size: 2048 }, 'image', { maxBytes: 1024 }).ok, false);
});

test('formatBytes is human-readable', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(15 * 1024 * 1024), '15 MB');
  assert.equal(formatBytes(-5), '0 B');
  assert.equal(formatBytes(NaN), '0 B');
});
