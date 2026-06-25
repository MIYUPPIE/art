import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  spawnDomePositions,
  makeVelocities,
  stepPositions,
} from '../src/core/particlePhysics.js';

// Tiny seeded PRNG so assertions are deterministic.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('spawnDomePositions returns count*3 floats', () => {
  const pos = spawnDomePositions(50, {}, mulberry32(1));
  assert.ok(pos instanceof Float32Array);
  assert.equal(pos.length, 150);
});

test('spawned points sit within the radius band and above the floor', () => {
  const rMin = 0.3, rMax = 0.8, yOffset = 0.1;
  const pos = spawnDomePositions(500, { rMin, rMax, yOffset }, mulberry32(42));
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    // y was built as abs(...) + yOffset, so it can never dip below yOffset.
    assert.ok(y >= yOffset - 1e-6, `y (${y}) >= yOffset (${yOffset})`);
    // distance from the dome origin (accounting for yOffset shift) is in band.
    const r = Math.hypot(x, y - yOffset, z);
    assert.ok(r >= rMin - 1e-6 && r <= rMax + 1e-6, `radius ${r} in [${rMin}, ${rMax}]`);
  }
});

test('spawnDomePositions is deterministic for a given seed', () => {
  const a = spawnDomePositions(20, {}, mulberry32(7));
  const b = spawnDomePositions(20, {}, mulberry32(7));
  assert.deepEqual(a, b);
});

test('makeVelocities gives strictly upward y so particles always recycle', () => {
  const v = makeVelocities(300, 0.5, mulberry32(3));
  assert.equal(v.length, 900);
  for (let i = 0; i < v.length / 3; i++) {
    assert.ok(v[i * 3 + 1] > 0, `y velocity ${v[i * 3 + 1]} must be > 0`);
  }
});

test('stepPositions raises particles and mutates in place', () => {
  const positions = new Float32Array([0, 0, 0]);
  const velocities = new Float32Array([0, 1, 0]); // 1 unit/sec upward
  const ret = stepPositions(positions, velocities, 0.5, 0, { resetY: 10, floorY: 0, wobble: 0 });
  assert.equal(ret, positions, 'returns the same array reference');
  assert.ok(Math.abs(positions[1] - 0.5) < 1e-6, 'y advanced by v*dt');
});

test('stepPositions recycles a particle past resetY back to floorY', () => {
  const positions = new Float32Array([0, 1.49, 0]);
  const velocities = new Float32Array([0, 1, 0]);
  stepPositions(positions, velocities, 0.5, 0, { resetY: 1.5, floorY: 0, wobble: 0 });
  // 1.49 + 0.5 = 1.99 > 1.5 -> recycled to floorY
  assert.equal(positions[1], 0);
});

test('stepPositions preserves array length over many steps', () => {
  const positions = spawnDomePositions(100, {}, mulberry32(9));
  const velocities = makeVelocities(100, 0.4, mulberry32(9));
  const before = positions.length;
  for (let s = 0; s < 200; s++) stepPositions(positions, velocities, 0.016, s * 0.016);
  assert.equal(positions.length, before);
  // every particle stays within the recycle ceiling
  for (let i = 0; i < positions.length / 3; i++) {
    assert.ok(positions[i * 3 + 1] <= 1.5 + 1e-6, 'y never exceeds resetY after a step');
  }
});
