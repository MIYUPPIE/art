// Pure upload validation + formatting. No DOM, no THREE — unit-testable in Node.
// The UI calls validateUpload() before touching the file, so the same rules are
// enforced deterministically and can be tested without a browser.

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

// `file` is anything with { type, size } (a real File, or a test stub).
export function validateUpload(file, kind = 'image', limits = {}) {
  const isVideo = kind === 'video';
  const maxBytes = limits.maxBytes ?? (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
  const prefix = isVideo ? 'video/' : 'image/';

  if (!file) return { ok: false, error: 'No file selected.' };
  if (typeof file.type !== 'string' || !file.type.startsWith(prefix)) {
    return { ok: false, error: `Please choose a${isVideo ? '' : 'n'} ${kind} file.` };
  }
  if (typeof file.size === 'number' && file.size > maxBytes) {
    return { ok: false, error: `That ${kind} is too large (max ${formatBytes(maxBytes)}).` };
  }
  return { ok: true };
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${units[i]}`;
}
