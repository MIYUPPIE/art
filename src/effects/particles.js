import * as THREE from 'three';
import {
  spawnDomePositions,
  makeVelocities,
  stepPositions,
} from '../core/particlePhysics.js';

// Three depth layers of glowing motes for parallax. Counts/colors/sizes only —
// all the actual motion math lives in core/particlePhysics.js.
const LAYERS = [
  { count: 200, color: 0x00d4ff, size: 0.14, speed: 0.25, yOffset: 0.0 },
  { count: 100, color: 0xff00aa, size: 0.24, speed: 0.18, yOffset: 0.2 },
  { count: 150, color: 0xffff00, size: 0.10, speed: 0.32, yOffset: -0.1 },
];

export function buildParticles() {
  const group = new THREE.Group();
  group.name = 'particles';

  for (const cfg of LAYERS) {
    const positions = spawnDomePositions(cfg.count, { yOffset: cfg.yOffset, rMin: 0.35, rMax: 1.4 });
    const velocities = makeVelocities(cfg.count, cfg.speed);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: cfg.color,
      size: cfg.size,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: false,
    });

    const points = new THREE.Points(geometry, material);
    points.userData = { velocities };
    group.add(points);
  }

  const light = new THREE.PointLight(0xffffff, 1, 10);
  light.position.set(0, 1, 0);
  group.add(light);

  return group;
}

export function updateParticles(group, dt, elapsed) {
  for (const child of group.children) {
    if (!child.isPoints) continue;
    const positions = child.geometry.attributes.position.array;
    stepPositions(positions, child.userData.velocities, dt, elapsed);
    child.geometry.attributes.position.needsUpdate = true;
    child.rotation.y = elapsed * 0.1;
  }
}
