import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, AURORA, rgb, toHex, mixHex, gradient, luminance } from '../src/effects/palette.js';

test('every token is a valid 24-bit color', () => {
  for (const [name, v] of Object.entries(PALETTE)) {
    assert.equal(typeof v, 'number', name);
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffff, `${name}=${v.toString(16)} in range`);
  }
});

test('rgb/toHex round-trips exactly', () => {
  for (const v of Object.values(PALETTE)) {
    assert.equal(toHex(rgb(v)), v);
  }
});

test('mixHex returns the endpoints at t=0 and t=1 and clamps out of range', () => {
  assert.equal(mixHex(PALETTE.violet, PALETTE.teal, 0), PALETTE.violet);
  assert.equal(mixHex(PALETTE.violet, PALETTE.teal, 1), PALETTE.teal);
  assert.equal(mixHex(PALETTE.violet, PALETTE.teal, -5), PALETTE.violet);
  assert.equal(mixHex(PALETTE.violet, PALETTE.teal, 5), PALETTE.teal);
});

test('mixHex midpoint is the channel average', () => {
  // 127.5 rounds to 128 (0x80) on every channel.
  assert.equal(mixHex(0x000000, 0xffffff, 0.5), 0x808080);
});

test('gradient hits the first and last stop at the ends', () => {
  assert.equal(gradient(AURORA, 0), AURORA[0]);
  assert.equal(gradient(AURORA, 1), AURORA[AURORA.length - 1]);
});

test('gradient clamps out-of-range t to the ends', () => {
  assert.equal(gradient(AURORA, -1), AURORA[0]);
  assert.equal(gradient(AURORA, 9), AURORA[AURORA.length - 1]);
});

test('gradient is continuous across an interior stop', () => {
  const boundary = 1 / (AURORA.length - 1); // first interior stop
  const lo = gradient(AURORA, boundary - 1e-4);
  const hi = gradient(AURORA, boundary + 1e-4);
  assert.ok(Math.abs(luminance(lo) - luminance(hi)) < 0.02, 'no luminance jump at the boundary');
});

test('gradient with a single stop returns that stop for any t', () => {
  assert.equal(gradient([PALETTE.gold], 0.7), PALETTE.gold);
});

test('luminance is normalised and orders white above void', () => {
  const lw = luminance(PALETTE.white);
  const lv = luminance(PALETTE.void);
  assert.ok(lw > 0 && lw <= 1 && lv >= 0);
  assert.ok(lw > lv, 'white is brighter than void');
});
