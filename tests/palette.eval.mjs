import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, AURORA, hue, saturation } from '../src/effects/palette.js';

// Design-rubric eval: encodes what makes the palette read as "mature" so the
// look can never silently regress into clashing gamer-neon. Deterministic and
// free, but it measures a quality property (design cohesion), not correctness —
// run via `npm run eval`, separate from the gate suite.

const COOL = ['violet', 'indigo', 'cyan', 'teal', 'orchid'];

test('the cool family stays inside one cohesive cyan→violet band', () => {
  for (const k of COOL) {
    const h = hue(PALETTE[k]);
    assert.ok(h >= 160 && h <= 300, `${k} hue ${h.toFixed(0)}° must sit in [160,300]`);
  }
});

test('exactly one warm accent exists, and it is gold', () => {
  const warm = Object.entries(PALETTE).filter(([, v]) => {
    const h = hue(v);
    return saturation(v) > 0.3 && h > 15 && h < 65; // vivid + warm
  });
  assert.equal(warm.length, 1, `expected one warm accent, got ${warm.map((w) => w[0]).join(',')}`);
  assert.equal(warm[0][0], 'gold');
});

test('no token is a raw primary/secondary "gamer RGB"', () => {
  const banned = new Set([0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff, 0x000000]);
  for (const [k, v] of Object.entries(PALETTE)) {
    assert.ok(!banned.has(v), `${k} must not be a raw primary/secondary`);
  }
});

test('the AURORA ramp is cohesive — no wild hue jumps between stops', () => {
  for (let i = 0; i < AURORA.length - 1; i++) {
    let d = Math.abs(hue(AURORA[i]) - hue(AURORA[i + 1]));
    if (d > 180) d = 360 - d;
    assert.ok(d <= 45, `stop ${i}→${i + 1} hue gap ${d.toFixed(0)}° must be ≤ 45°`);
  }
});
