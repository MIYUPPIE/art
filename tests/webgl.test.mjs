// Gate tests for the WebGL capability probe. Deterministic, no DOM/GPU:
// the canvas factory is injected so we drive every branch from Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectWebGL, WEBGL_HELP } from '../src/core/webgl.js';

const canvasReturning = (map) => () => ({
  getContext: (type) => (map[type] ? {} : null),
});

test('webgl2 available → ok, version 2', () => {
  const r = detectWebGL(canvasReturning({ webgl2: true, webgl: true }));
  assert.deepEqual(r, { ok: true, version: 2 });
});

test('only webgl1 available → ok, version 1', () => {
  const r = detectWebGL(canvasReturning({ webgl: true }));
  assert.deepEqual(r, { ok: true, version: 1 });
});

test('only experimental-webgl available → ok, version 1', () => {
  const r = detectWebGL(canvasReturning({ 'experimental-webgl': true }));
  assert.deepEqual(r, { ok: true, version: 1 });
});

test('no context available → not ok, version 0', () => {
  const r = detectWebGL(canvasReturning({}));
  assert.deepEqual(r, { ok: false, version: 0 });
});

test('getContext throwing (blocked GPU) → not ok, not throwing', () => {
  const r = detectWebGL(() => ({ getContext: () => { throw new Error('blocked'); } }));
  assert.deepEqual(r, { ok: false, version: 0 });
});

test('canvas factory returning null → not ok', () => {
  const r = detectWebGL(() => null);
  assert.deepEqual(r, { ok: false, version: 0 });
});

test('WEBGL_HELP is actionable (mentions acceleration + chrome://gpu)', () => {
  assert.match(WEBGL_HELP, /acceleration/i);
  assert.match(WEBGL_HELP, /chrome:\/\/gpu/);
});
