import * as THREE from 'three';
import {
  spawnDomePositions,
  makeVelocities,
  stepPositions,
} from '../core/particlePhysics.js';
import { PALETTE } from './palette.js';
import { glowTexture } from './glow.js';

// Three depth layers of soft glowing motes rising off the artwork for parallax.
// Counts/colors/sizes/twinkle live here; all the motion math stays in
// core/particlePhysics.js (pure and unit-tested). Colors come from the shared
// palette so this reads as the same family as every other effect.
const LAYERS = [
  { count: 220, color: PALETTE.cyan, size: 0.18, speed: 0.24, yOffset: 0.0, base: 0.85, twinkle: 0.12, rate: 1.7 },
  { count: 120, color: PALETTE.violet, size: 0.3, speed: 0.16, yOffset: 0.25, base: 0.8, twinkle: 0.15, rate: 1.1 },
  { count: 90, color: PALETTE.gold, size: 0.12, speed: 0.3, yOffset: -0.05, base: 0.78, twinkle: 0.2, rate: 2.3 },
];

export function buildParticles() {
  const group = new THREE.Group();
  group.name = 'particles';
  const map = glowTexture('dot');

  LAYERS.forEach((cfg, idx) => {
    const positions = spawnDomePositions(cfg.count, { yOffset: cfg.yOffset, rMin: 0.35, rMax: 1.4 });
    const velocities = makeVelocities(cfg.count, cfg.speed);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: cfg.color,
      size: cfg.size,
      map,
      transparent: true,
      opacity: cfg.base,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    points.userData = { velocities, base: cfg.base, twinkle: cfg.twinkle, rate: cfg.rate, phase: idx * 1.7 };
    group.add(points);
  });

  return group;
}

export function updateParticles(group, dt, elapsed) {
  for (const child of group.children) {
    if (!child.isPoints) continue;
    const { velocities, base, twinkle, rate, phase } = child.userData;
    const positions = child.geometry.attributes.position.array;
    stepPositions(positions, velocities, dt, elapsed);
    child.geometry.attributes.position.needsUpdate = true;
    child.rotation.y = elapsed * 0.08;
    child.material.opacity = base + Math.sin(elapsed * rate + phase) * twinkle;
  }
}
