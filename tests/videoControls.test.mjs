import test from 'node:test';
import assert from 'node:assert/strict';

import { playVideo, pauseVideo, updateVideo } from '../src/core/videoControls.js';

function stubGroup({ failed = false, ready = true, paused = true, rejectPlay = false } = {}) {
  const calls = { play: 0, pause: 0 };
  const video = {
    paused,
    play() { calls.play++; this.paused = false; return rejectPlay ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); },
    pause() { calls.pause++; this.paused = true; },
  };
  const texture = { needsUpdate: false };
  return { group: { userData: { state: { video, failed, ready }, texture } }, calls, texture };
}

test('regression: all controls tolerate undefined/partial groups', () => {
  // visibilitychange fires from the landing screen, before any AR session.
  assert.doesNotThrow(() => pauseVideo(undefined));
  assert.doesNotThrow(() => playVideo(undefined));
  assert.doesNotThrow(() => updateVideo(undefined));
  assert.doesNotThrow(() => pauseVideo({}));
  assert.doesNotThrow(() => playVideo({ userData: {} }));
  assert.doesNotThrow(() => updateVideo({ userData: {} }));
});

test('playVideo plays once and swallows autoplay rejection', async () => {
  const { group, calls } = stubGroup({ rejectPlay: true });
  playVideo(group);
  assert.equal(calls.play, 1);
  await new Promise((r) => setImmediate(r)); // unhandled rejection would fail the test
});

test('playVideo skips failed or video-less state', () => {
  const { group, calls } = stubGroup({ failed: true });
  playVideo(group);
  assert.equal(calls.play, 0);
  playVideo({ userData: { state: { video: null } } });
});

test('pauseVideo pauses only when playing', () => {
  const { group, calls } = stubGroup({ paused: false });
  pauseVideo(group);
  assert.equal(calls.pause, 1);
  pauseVideo(group); // already paused
  assert.equal(calls.pause, 1);
});

test('updateVideo flags the texture only when ready and not failed', () => {
  const ok = stubGroup({ ready: true });
  updateVideo(ok.group);
  assert.equal(ok.texture.needsUpdate, true);

  const notReady = stubGroup({ ready: false });
  updateVideo(notReady.group);
  assert.equal(notReady.texture.needsUpdate, false);

  const failed = stubGroup({ ready: true, failed: true });
  updateVideo(failed.group);
  assert.equal(failed.texture.needsUpdate, false);
});
