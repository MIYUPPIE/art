// Single source of truth for the AR effect look. Pure numbers and math only —
// no THREE, no DOM — so the whole design system is unit-testable in plain Node
// and every effect pulls the SAME palette instead of ad-hoc per-effect neon.
//
// Design rubric (enforced in tests/palette.eval.mjs):
//   - one cohesive cool family: teal -> cyan -> indigo -> violet -> orchid
//   - exactly one warm accent (gold), used sparingly for "energy" highlights
//   - no pure-primary "gamer RGB"; tones are deep and slightly restrained

export const PALETTE = Object.freeze({
  void: 0x0a0a1f, // deep indigo base / shadow
  violet: 0x7c5cff, // royal violet
  indigo: 0x4361ee, // electric indigo
  cyan: 0x38dcff, // sky cyan (bright edge)
  teal: 0x2ee6c6, // aqua teal
  orchid: 0xc65cd6, // soft magenta — never hot pink
  gold: 0xffce6b, // warm accent — the single warm note
  white: 0xeef4ff, // cool white highlight
});

// Ordered aurora ramp for radial gradients (core -> edge).
export const AURORA = Object.freeze([
  PALETTE.violet,
  PALETTE.indigo,
  PALETTE.cyan,
  PALETTE.teal,
]);

// Split a packed 0xRRGGBB int into normalised {r,g,b} in [0,1].
export function rgb(hex) {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
  };
}

// Pack a normalised {r,g,b} back into a 0xRRGGBB int, clamped and rounded.
export function toHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

// Linear RGB blend of two hex colors. t is clamped to [0,1].
export function mixHex(a, b, t) {
  const ca = rgb(a);
  const cb = rgb(b);
  const k = Math.max(0, Math.min(1, t));
  return toHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  });
}

// Sample an evenly-spaced ramp of hex stops at t in [0,1].
export function gradient(stops, t) {
  if (stops.length === 1) return stops[0];
  const k = Math.max(0, Math.min(1, t));
  const seg = 1 / (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k / seg));
  const local = (k - i * seg) / seg;
  return mixHex(stops[i], stops[i + 1], local);
}

// Relative luminance (perceptual weights) in [0,1].
export function luminance(hex) {
  const { r, g, b } = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Hue in degrees [0,360). Meaningless for near-neutrals (check saturation first).
export function hue(hex) {
  const { r, g, b } = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return (h + 360) % 360;
}

// HSL saturation in [0,1].
export function saturation(hex) {
  const { r, g, b } = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return 0;
  return d / (1 - Math.abs(2 * l - 1));
}
