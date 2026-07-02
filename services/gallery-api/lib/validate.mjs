// Upload validation: size caps, magic-byte sniffing, title sanitising.
// Pure functions over Buffers/strings — no fs, no network.

export const LIMITS = {
  target: 12 * 1024 * 1024, // compiled .mind
  image: 15 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  // Whole multipart body: sum of the above plus form overhead.
  body: 80 * 1024 * 1024,
  title: 120,
};

// Sniff real content type from magic bytes. Returns a canonical MIME type or
// null when the payload is none of the formats browsers can actually use here.
export function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
      buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export function sniffVideo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  // ISO BMFF (mp4 / mov): size box then 'ftyp'.
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'video/mp4';
  // EBML header: webm / mkv.
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  // Ogg container.
  if (buf.subarray(0, 4).toString('latin1') === 'OggS') return 'video/ogg';
  return null;
}

// .mind targets are an opaque serialized format (msgpack inside); there is no
// stable magic. Guard on plausible size instead: an empty or truncated buffer
// can never track, and the cap stops abuse.
export function validTarget(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 64 && buf.length <= LIMITS.target;
}

// Strip control characters, collapse whitespace, cap length.
export function sanitizeTitle(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.title);
}

export const EXT_FOR = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
};

// Artwork ids are 16 base64url chars (96 bits of randomness). The pattern is
// shared with the store and the router so a crafted id can never become a path.
export const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;

export function validId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}
