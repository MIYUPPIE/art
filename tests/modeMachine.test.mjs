import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES,
  DEFAULT_MODE,
  isValidMode,
  resolveMode,
  visibilityFor,
  videoShouldPlay,
} from '../src/core/modeMachine.js';

test('MODES is the frozen, expected set', () => {
  assert.deepEqual([...MODES], ['particles', '3d', 'video', 'artifact', 'vortex']);
  assert.ok(Object.isFrozen(MODES));
});

test('isValidMode accepts known modes, rejects others', () => {
  for (const m of MODES) assert.equal(isValidMode(m), true);
  assert.equal(isValidMode('lasers'), false);
  assert.equal(isValidMode(undefined), false);
});

test('resolveMode passes valid modes through and falls back otherwise', () => {
  assert.equal(resolveMode('video'), 'video');
  assert.equal(resolveMode('bogus'), DEFAULT_MODE);
  assert.equal(resolveMode('bogus', '3d'), '3d');
});

test('visibilityFor shows exactly one effect per mode', () => {
  assert.deepEqual(visibilityFor('particles'), { particles: true, model: false, video: false, artifact: false, vortex: false });
  assert.deepEqual(visibilityFor('3d'), { particles: false, model: true, video: false, artifact: false, vortex: false });
  assert.deepEqual(visibilityFor('video'), { particles: false, model: false, video: true, artifact: false, vortex: false });
  assert.deepEqual(visibilityFor('artifact'), { particles: false, model: false, video: false, artifact: true, vortex: false });
  assert.deepEqual(visibilityFor('vortex'), { particles: false, model: false, video: false, artifact: false, vortex: true });
  // invalid -> default mode visibility
  assert.deepEqual(visibilityFor('nope'), { particles: true, model: false, video: false, artifact: false, vortex: false });
  for (const m of MODES) {
    const vis = visibilityFor(m);
    const onCount = Object.values(vis).filter(Boolean).length;
    assert.equal(onCount, 1, `exactly one effect visible for ${m}`);
  }
});

test('videoShouldPlay only when in video mode and tracking', () => {
  assert.equal(videoShouldPlay('video', true), true);
  assert.equal(videoShouldPlay('video', false), false);
  assert.equal(videoShouldPlay('particles', true), false);
  assert.equal(videoShouldPlay('3d', true), false);
});
