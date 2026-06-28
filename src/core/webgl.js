// WebGL capability probe. Every moving part of this app needs WebGL: the MindAR
// image compiler (tfjs backend), the MindAR tracker, and the Three.js renderer.
// When WebGL is unavailable the tfjs compiler hangs silently mid-compile, so we
// detect up front and surface an actionable message instead of an endless spinner.
//
// The canvas factory is injected so the detection logic is unit-testable in Node
// (no real DOM/GPU): pass a stub that returns a context, null, or throws.

export function detectWebGL(makeCanvas = defaultCanvas) {
  try {
    const canvas = makeCanvas();
    if (canvas && typeof canvas.getContext === 'function') {
      if (canvas.getContext('webgl2')) return { ok: true, version: 2 };
      if (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) {
        return { ok: true, version: 1 };
      }
    }
    return { ok: false, version: 0 };
  } catch {
    // Some browsers throw from getContext when GPU access is blocked.
    return { ok: false, version: 0 };
  }
}

function defaultCanvas() {
  return typeof document !== 'undefined' ? document.createElement('canvas') : null;
}

// User-facing guidance shown when WebGL is missing. Kept here so the UI strings
// live next to the check that triggers them.
export const WEBGL_HELP =
  'Your browser has WebGL (GPU rendering) turned off, so the AR engine can’t run. ' +
  'Turn on hardware acceleration and reload: in Chrome open Settings → System → ' +
  '“Use graphics acceleration when available”, or visit chrome://gpu to see why it’s off. ' +
  'On Linux, launching with --ignore-gpu-blocklist also works.';
