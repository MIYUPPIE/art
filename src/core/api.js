// Pure helpers for the gallery API boundary (contracts/gallery-api.md).
// No DOM, no fetch — location-like objects are passed in, so everything here
// runs and is tested in plain Node.

// Where the API lives when the frontend is on a static host with no backend
// of its own (GitHub Pages). Same-origin deploys use the /api reverse proxy.
export const DEFAULT_REMOTE_API = 'https://mqtt.okhubtech.com/api';

export function resolveApiBase(loc, override = null) {
  if (override) return override.replace(/\/+$/, '');
  if (!loc || !loc.hostname) return '/api';
  if (/\.github\.io$/i.test(loc.hostname)) return DEFAULT_REMOTE_API;
  return '/api';
}

// Artwork id as issued by the API: 16 base64url chars.
const ID = /^[A-Za-z0-9_-]{16}$/;

export function parseArtId(search) {
  const id = new URLSearchParams(search || '').get('art');
  return id && ID.test(id) ? id : null;
}

// Share links keep the current path (the app lives under /art/ on GitHub
// Pages) and drop any explicit index.html plus unrelated query params.
export function shareUrlFor(id, loc) {
  const path = (loc.pathname || '/').replace(/index\.html?$/i, '');
  return `${loc.origin}${path}?art=${id}`;
}

export function artworkUrls(apiBase, id) {
  const base = `${apiBase}/artworks/${id}`;
  return { meta: base, target: `${base}/target`, image: `${base}/image`, video: `${base}/video` };
}
