import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PALETTE } from './palette.js';
import { glowTexture } from './glow.js';

// A procedural butterfly that flaps and wanders on a figure-eight path above the
// artwork, with iridescent wings and a soft aura. To use a real model instead,
// set config.modelSrc and the app calls loadGltf() to swap it in.

function buildWingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.2, 0.1, 0.3, 0.3, 0.1, 0.5);
  shape.bezierCurveTo(0, 0.6, -0.1, 0.5, -0.1, 0.3);
  shape.bezierCurveTo(-0.1, 0.1, 0, 0, 0, 0);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 1,
  });
}

export function buildModel() {
  const group = new THREE.Group();
  group.name = '3d';

  const wingGeo = buildWingGeometry();
  const wingMat = new THREE.MeshPhysicalMaterial({
    color: PALETTE.teal,
    metalness: 0.2,
    roughness: 0.15,
    transmission: 0.4,
    thickness: 0.4,
    iridescence: 1.0,
    iridescenceIOR: 1.6,
    clearcoat: 1.0,
    clearcoatRoughness: 0.15,
    emissive: PALETTE.violet,
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  });

  // Each wing lives in a pivot group so it flaps about a hinge at the body.
  const left = new THREE.Group();
  const leftMesh = new THREE.Mesh(wingGeo, wingMat);
  leftMesh.position.set(-0.02, 0, 0);
  left.add(leftMesh);

  const right = new THREE.Group();
  const rightMesh = new THREE.Mesh(wingGeo, wingMat);
  rightMesh.rotation.y = Math.PI; // mirror without negative scale (keeps normals sane)
  rightMesh.position.set(0.02, 0, 0);
  right.add(rightMesh);

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.02, 0.18, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.6, roughness: 0.4 }),
  );

  const aura = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('dot'),
      color: PALETTE.cyan,
      opacity: 0.35,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  aura.scale.setScalar(0.7);

  const root = new THREE.Group();
  root.add(aura, left, right, body);
  root.position.set(0, 0.35, 0.08);
  group.add(root);

  const key = new THREE.PointLight(PALETTE.white, 1.4, 8);
  key.position.set(0.5, 1, 0.6);
  const fill = new THREE.PointLight(PALETTE.violet, 0.8, 8);
  fill.position.set(-0.5, 0.3, 0.4);
  group.add(key, fill);

  group.userData = { root, left, right, mixer: null };
  return group;
}

// Optional: replace the procedural butterfly with a GLB/GLTF model.
// Returns a Promise. Plays any embedded animation clips.
export function loadGltf(group, url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        // Drop the procedural butterfly, keep the lights.
        const { root } = group.userData;
        if (root) group.remove(root);

        const model = gltf.scene;
        model.position.set(0, 0.2, 0.05);
        model.scale.setScalar(0.5);
        group.add(model);

        let mixer = null;
        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model);
          for (const clip of gltf.animations) mixer.clipAction(clip).play();
        }
        group.userData = { root: model, left: null, right: null, mixer };
        resolve(group);
      },
      undefined,
      reject,
    );
  });
}

export function updateModel(group, dt, elapsed) {
  const { root, left, right, mixer } = group.userData;
  if (mixer) mixer.update(dt);

  if (left && right) {
    // Procedural butterfly: flap wings about the hinge.
    const flap = Math.sin(elapsed * 8) * 0.6;
    left.rotation.z = -flap;
    right.rotation.z = flap;
  }
  if (root) {
    // Lissajous figure-eight wander with a gentle bank into the turns.
    root.position.x = Math.sin(elapsed * 0.7) * 0.28;
    root.position.y = 0.35 + Math.sin(elapsed * 1.4) * 0.08;
    root.position.z = 0.08 + Math.cos(elapsed * 0.7) * 0.05;
    root.rotation.y = Math.sin(elapsed * 0.7) * 0.6;
    root.rotation.z = Math.sin(elapsed * 1.4) * 0.12;
  }
}
