import * as THREE from 'three';

// Soft radial "glow" sprite textures. A hard square GL point is the single
// biggest tell of an amateur particle system; a soft round falloff reads
// premium. White by design so callers tint via material.color and one texture
// serves every effect. Cached per variant so each is built exactly once.

const cache = new Map();
const SIZE = 128;

function paintDot(ctx) {
  const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

function paintStar(ctx) {
  paintDot(ctx);
  // Faint diffraction streaks give the bright "energy" points a jewel sparkle.
  const c = SIZE / 2;
  ctx.globalCompositeOperation = 'lighter';
  const streak = (horizontal) => {
    const grad = horizontal
      ? ctx.createLinearGradient(0, c, SIZE, c)
      : ctx.createLinearGradient(c, 0, c, SIZE);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    if (horizontal) ctx.fillRect(0, c - 1.5, SIZE, 3);
    else ctx.fillRect(c - 1.5, 0, 3, SIZE);
  };
  streak(true);
  streak(false);
  ctx.globalCompositeOperation = 'source-over';
}

export function glowTexture(variant = 'dot') {
  if (cache.has(variant)) return cache.get(variant);
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d');
  (variant === 'star' ? paintStar : paintDot)(ctx);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  cache.set(variant, tex);
  return tex;
}
