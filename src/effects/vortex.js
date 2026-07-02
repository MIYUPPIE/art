import * as THREE from 'three';
import { PALETTE, AURORA, gradient } from './palette.js';
import { glowTexture } from './glow.js';

// A camera-facing aurora galaxy: multi-arm logarithmic spiral of soft glowing
// dust coloured along the AURORA ramp, a scatter of warm gold stars, and a
// bright pulsing core with a soft halo. Built in the XY plane (the same plane as
// the tracked artwork) so it faces the viewer head-on — the old version lived in
// XZ and sat edge-on, which is why it was barely visible.

const DUST = 2400;
const STARS = 120;
const ARMS = 3;
const RMAX = 1.5;

export function buildVortex() {
  const group = new THREE.Group();
  group.name = 'vortex';

  // ---- dust ----
  const dGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(DUST * 3);
  const dCol = new Float32Array(DUST * 3);
  const dAng = new Float32Array(DUST);
  const dRad = new Float32Array(DUST);
  const dSpd = new Float32Array(DUST);
  const dZ = new Float32Array(DUST);
  const c = new THREE.Color();
  for (let i = 0; i < DUST; i++) {
    const t = Math.pow(Math.random(), 0.7); // bias slightly outward for a full disc
    const radius = 0.06 + t * RMAX;
    const arm = (i % ARMS) * ((Math.PI * 2) / ARMS);
    const angle = arm + radius * 2.6 + (Math.random() - 0.5) * 0.6 * (1 - t * 0.4);
    dPos[i * 3] = Math.cos(angle) * radius;
    dPos[i * 3 + 1] = Math.sin(angle) * radius;
    dPos[i * 3 + 2] = (Math.random() - 0.5) * 0.16 * (1 - t); // thin bulge toward camera
    dZ[i] = dPos[i * 3 + 2];
    c.set(gradient(AURORA, Math.min(1, radius / RMAX)));
    dCol[i * 3] = c.r;
    dCol[i * 3 + 1] = c.g;
    dCol[i * 3 + 2] = c.b;
    dAng[i] = angle;
    dRad[i] = radius;
    dSpd[i] = 0.3 + (1 - t) * 1.5; // inner rotates faster (differential rotation)
  }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
  const dust = new THREE.Points(
    dGeo,
    new THREE.PointsMaterial({
      size: 0.1,
      map: glowTexture('dot'),
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );

  // ---- gold stars ----
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(STARS * 3);
  const sAng = new Float32Array(STARS);
  const sRad = new Float32Array(STARS);
  const sSpd = new Float32Array(STARS);
  const sZ = new Float32Array(STARS);
  for (let i = 0; i < STARS; i++) {
    const t = Math.pow(Math.random(), 0.5);
    const radius = 0.1 + t * RMAX;
    const angle = Math.random() * Math.PI * 2;
    sPos[i * 3] = Math.cos(angle) * radius;
    sPos[i * 3 + 1] = Math.sin(angle) * radius;
    sPos[i * 3 + 2] = (Math.random() - 0.5) * 0.16 * (1 - t);
    sZ[i] = sPos[i * 3 + 2];
    sAng[i] = angle;
    sRad[i] = radius;
    sSpd[i] = 0.3 + (1 - t) * 1.5;
  }
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const stars = new THREE.Points(
    sGeo,
    new THREE.PointsMaterial({
      size: 0.22,
      map: glowTexture('star'),
      color: PALETTE.gold,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );

  // ---- core + halo ----
  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('star'),
      color: PALETTE.white,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  core.scale.setScalar(0.5);
  core.position.z = 0.02;

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('dot'),
      color: PALETTE.violet,
      opacity: 0.4,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(3.4);
  halo.position.z = -0.05;

  const disc = new THREE.Group();
  disc.add(halo, dust, stars, core);
  disc.position.set(0, 0.2, 0.06);
  disc.rotation.x = -0.2; // slight tilt for depth while staying camera-facing
  group.add(disc);

  group.userData = { disc, dust, stars, core, dAng, dRad, dSpd, dZ, sAng, sRad, sSpd, sZ };
  return group;
}

export function updateVortex(group, dt, elapsed) {
  const { disc, dust, stars, core, dAng, dRad, dSpd, dZ, sAng, sRad, sSpd, sZ } = group.userData;

  const dp = dust.geometry.attributes.position.array;
  for (let i = 0; i < dRad.length; i++) {
    dAng[i] += dSpd[i] * dt;
    const r = dRad[i];
    dp[i * 3] = Math.cos(dAng[i]) * r;
    dp[i * 3 + 1] = Math.sin(dAng[i]) * r;
    dp[i * 3 + 2] = dZ[i] + Math.sin(elapsed * 1.6 + r * 4) * 0.02;
  }
  dust.geometry.attributes.position.needsUpdate = true;

  const sp = stars.geometry.attributes.position.array;
  for (let i = 0; i < sRad.length; i++) {
    sAng[i] += sSpd[i] * dt;
    const r = sRad[i];
    sp[i * 3] = Math.cos(sAng[i]) * r;
    sp[i * 3 + 1] = Math.sin(sAng[i]) * r;
    sp[i * 3 + 2] = sZ[i] + Math.sin(elapsed * 2 + r * 5) * 0.03;
  }
  stars.geometry.attributes.position.needsUpdate = true;

  disc.scale.setScalar(1 + Math.sin(elapsed * 1.4) * 0.04); // breathing
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3);
  core.scale.setScalar(0.5 + pulse * 0.12);
  core.material.opacity = 0.7 + pulse * 0.3;
}
