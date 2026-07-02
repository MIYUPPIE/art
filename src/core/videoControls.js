// Play/pause/texture-update controls for the video effect group. No THREE, no
// DOM construction — the group is anything with { userData: { state, texture } },
// so these are unit-tested in plain Node with stub objects.
//
// All three tolerate a missing/not-yet-built group: callers like the global
// visibilitychange handler fire before any AR session exists (regression:
// pauseVideo(undefined) used to throw on tab switch from the landing screen).

export function playVideo(group) {
  const state = group?.userData?.state;
  if (!state || state.failed || !state.video) return;
  const p = state.video.play();
  if (p && p.catch) p.catch(() => {}); // ignore autoplay rejections
}

export function pauseVideo(group) {
  const v = group?.userData?.state?.video;
  if (v && !v.paused) v.pause();
}

export function updateVideo(group) {
  const { texture, state } = group?.userData ?? {};
  if (state?.ready && !state.failed) texture.needsUpdate = true;
}
