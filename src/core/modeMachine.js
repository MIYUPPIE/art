// Pure mode state machine for AR effect switching.
// No DOM, no THREE — fully deterministic and unit-testable in Node.

export const MODES = Object.freeze(['particles', '3d', 'video']);
export const DEFAULT_MODE = 'particles';

export function isValidMode(mode) {
  return MODES.includes(mode);
}

// Resolve a requested mode, falling back to a default when it is not valid.
export function resolveMode(requested, fallback = DEFAULT_MODE) {
  return isValidMode(requested) ? requested : fallback;
}

// Given the active mode, return which effect groups should be visible.
// Exactly one effect is visible at a time.
export function visibilityFor(mode) {
  const m = resolveMode(mode);
  return {
    particles: m === 'particles',
    model: m === '3d',
    video: m === 'video',
  };
}

// Video should only play while in video mode AND the target is being tracked.
export function videoShouldPlay(mode, isTracking) {
  return mode === 'video' && isTracking === true;
}
