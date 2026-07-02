import test from 'node:test';
import assert from 'node:assert/strict';

import { RateLimiter } from '../lib/ratelimit.mjs';

function clock(start = 0) {
  let t = start;
  return { now: () => t, tick: (ms) => { t += ms; } };
}

test('allows a burst up to capacity, then blocks', () => {
  const c = clock();
  const rl = new RateLimiter({ capacity: 3, refillMs: 1000, now: c.now });
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), false);
});

test('tokens refill over time and never exceed capacity', () => {
  const c = clock();
  const rl = new RateLimiter({ capacity: 2, refillMs: 1000, now: c.now });
  rl.allow('a'); rl.allow('a');
  assert.equal(rl.allow('a'), false);
  c.tick(999);
  assert.equal(rl.allow('a'), false); // not yet
  c.tick(1);
  assert.equal(rl.allow('a'), true); // exactly one token back
  assert.equal(rl.allow('a'), false);
  c.tick(60_000);
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), false); // capped at 2, not 60
});

test('keys are independent', () => {
  const c = clock();
  const rl = new RateLimiter({ capacity: 1, refillMs: 1000, now: c.now });
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('b'), true);
  assert.equal(rl.allow('a'), false);
});

test('prune drops fully-refilled buckets only', () => {
  const c = clock();
  const rl = new RateLimiter({ capacity: 2, refillMs: 1000, now: c.now });
  rl.allow('idle');
  c.tick(1500);
  rl.allow('busy');
  rl.prune(); // idle bucket is 1.5s old < 2s full-refill window → kept
  assert.equal(rl.buckets.has('idle'), true);
  c.tick(2000);
  rl.prune();
  assert.equal(rl.buckets.has('idle'), false);
  assert.equal(rl.buckets.has('busy'), false);
});
