import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { glowTexture } from './glow.js';

// A floating jewel: an iridescent, clearcoated crystal with a bright pulsing
// core and soft halo, wrapped in two counter-rotating wire cages and an
// armillary set of glowing rings, with warm gold sparks in orbit. Lit by a
// cyan key + violet rim so the gem actually reads as a gem.

export function buildArtifact() {
  const group = new THREE.Group();
  group.name = 'artifact';
  const root = new THREE.Group();

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.17, 0),
    new THREE.MeshPhysicalMaterial({
      color: PALETTE.violet,
      metalness: 0.0,
      roughness: 0.08,
      transmission: 0.85,
      thickness: 0.6,
      ior: 1.7,
      iridescence: 1.0,
      iridescenceIOR: 1.9,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      emissive: PALETTE.indigo,
      emissiveIntensity: 0.35,
    }),
  );

  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('star'),
      color: PALETTE.white,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  core.scale.setScalar(0.36);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('dot'),
      color: PALETTE.cyan,
      opacity: 0.5,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(1.3);
  halo.position.z = -0.15;

  const cageA = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.3, 1),
    new THREE.MeshBasicMaterial({ color: PALETTE.cyan, wireframe: true, transparent: true, opacity: 0.28 }),
  );
  const cageB = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.4, 0),
    new THREE.MeshBasicMaterial({ color: PALETTE.teal, wireframe: true, transparent: true, opacity: 0.16 }),
  );

  const rings = new THREE.Group();
  const ringColors = [PALETTE.cyan, PALETTE.violet, PALETTE.teal];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34 + i * 0.05, 0.004, 12, 96),
      new THREE.MeshBasicMaterial({
        color: ringColors[i],
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2 + (i - 1) * 0.4;
    ring.rotation.y = (Math.PI / 3) * i;
    rings.add(ring);
  }

  // Orbiting sparks on tilted circular orbits.
  const SPARKS = 40;
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(SPARKS * 3);
  const orbit = [];
  for (let i = 0; i < SPARKS; i++) {
    const o = {
      r: 0.3 + Math.random() * 0.25,
      a: Math.random() * Math.PI * 2,
      tilt: Math.random() * Math.PI,
      speed: 0.4 + Math.random() * 0.8,
    };
    orbit.push(o);
    sPos[i * 3] = Math.cos(o.a) * o.r;
    sPos[i * 3 + 1] = Math.sin(o.a) * o.r * Math.cos(o.tilt);
    sPos[i * 3 + 2] = Math.sin(o.a) * o.r * Math.sin(o.tilt);
  }
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const sparks = new THREE.Points(
    sGeo,
    new THREE.PointsMaterial({
      size: 0.06,
      map: glowTexture('star'),
      color: PALETTE.gold,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );

  root.add(halo, crystal, core, cageA, cageB, rings, sparks);
  root.position.set(0, 0.35, 0.12);
  root.scale.setScalar(1.15);
  group.add(root);

  const key = new THREE.PointLight(PALETTE.cyan, 2.2, 4);
  key.position.set(0.4, 0.6, 0.6);
  const rim = new THREE.PointLight(PALETTE.violet, 1.6, 4);
  rim.position.set(-0.5, 0.2, 0.3);
  group.add(key, rim);

  group.userData = { root, crystal, core, cageA, cageB, rings, sparks, orbit };
  return group;
}

export function updateArtifact(group, dt, elapsed) {
  const { root, crystal, core, cageA, cageB, rings, sparks, orbit } = group.userData;

  root.position.y = 0.35 + Math.sin(elapsed * 1.6) * 0.04; // hover

  crystal.rotation.y = elapsed * 0.9;
  crystal.rotation.x = elapsed * 0.45;

  cageA.rotation.y = -elapsed * 0.5;
  cageA.rotation.z = elapsed * 0.2;
  cageB.rotation.y = elapsed * 0.3;
  cageB.rotation.x = -elapsed * 0.15;

  rings.children.forEach((ring, i) => {
    ring.rotation.z = elapsed * (0.5 + i * 0.15);
  });

  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.5);
  core.scale.setScalar(0.32 + pulse * 0.1);
  core.material.opacity = 0.7 + pulse * 0.3;

  const p = sparks.geometry.attributes.position.array;
  for (let i = 0; i < orbit.length; i++) {
    const o = orbit[i];
    o.a += o.speed * dt;
    p[i * 3] = Math.cos(o.a) * o.r;
    p[i * 3 + 1] = Math.sin(o.a) * o.r * Math.cos(o.tilt);
    p[i * 3 + 2] = Math.sin(o.a) * o.r * Math.sin(o.tilt);
  }
  sparks.geometry.attributes.position.needsUpdate = true;
}
