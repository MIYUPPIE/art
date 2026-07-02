import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sniffImage, sniffVideo, validTarget, sanitizeTitle, validId, LIMITS,
} from '../lib/validate.mjs';

const pad = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);

test('sniffImage recognises png/jpeg/webp and rejects the rest', () => {
  assert.equal(sniffImage(pad([0x89, 0x50, 0x4e, 0x47])), 'image/png');
  assert.equal(sniffImage(pad([0xff, 0xd8, 0xff, 0xe1])), 'image/jpeg');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
  assert.equal(sniffImage(webp), 'image/webp');
  assert.equal(sniffImage(pad([0x47, 0x49, 0x46, 0x38])), null); // gif: not accepted
  assert.equal(sniffImage(Buffer.alloc(4)), null); // too short
  assert.equal(sniffImage(null), null);
});

test('sniffVideo recognises mp4/webm/ogg and rejects the rest', () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(8)]);
  assert.equal(sniffVideo(mp4), 'video/mp4');
  assert.equal(sniffVideo(pad([0x1a, 0x45, 0xdf, 0xa3])), 'video/webm');
  assert.equal(sniffVideo(pad([0x4f, 0x67, 0x67, 0x53])), 'video/ogg');
  assert.equal(sniffVideo(pad([0x00, 0x01, 0x02, 0x03])), null);
  assert.equal(sniffVideo(undefined), null);
});

test('validTarget bounds size', () => {
  assert.equal(validTarget(Buffer.alloc(64)), true);
  assert.equal(validTarget(Buffer.alloc(63)), false);
  assert.equal(validTarget(Buffer.alloc(LIMITS.target + 1)), false);
  assert.equal(validTarget('not a buffer'), false);
});

test('sanitizeTitle strips control chars, collapses whitespace, caps length', () => {
  assert.equal(sanitizeTitle('  Sunset \x00\x1f over\n\nthe   bay \x7f '), 'Sunset over the bay');
  assert.equal(sanitizeTitle(42), '');
  assert.equal(sanitizeTitle('x'.repeat(500)).length, LIMITS.title);
});

test('validId accepts store-shaped ids only', () => {
  assert.equal(validId('AbC123-_AbC123-_'), true);
  assert.equal(validId('short'), false);
  assert.equal(validId('../../../etc/pwd'), false);
  assert.equal(validId('AbC123-_AbC123-_x'), false); // 17 chars
  assert.equal(validId(null), false);
});
