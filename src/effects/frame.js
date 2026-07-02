import * as THREE from 'three';
import { PALETTE } from './palette.js';

// A breathing glow border that sits just behind the tracked artwork to confirm
// detection. Pure shader work — no per-frame CPU cost beyond a uniform update.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float time;
  uniform vec3 color;
  varying vec2 vUv;
  void main() {
    float b = 0.07;
    vec2 uv = vUv;
    float edge = smoothstep(0.0, b, uv.x) *
                 smoothstep(1.0, 1.0 - b, uv.x) *
                 smoothstep(0.0, b, uv.y) *
                 smoothstep(1.0, 1.0 - b, uv.y);
    float border = 1.0 - edge;
    // Slow breathing rather than a hard blink.
    float pulse = 0.6 + 0.4 * sin(time * 1.6);
    gl_FragColor = vec4(color, border * pulse * 0.7);
  }
`;

export function buildFrame() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(PALETTE.cyan) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), material);
  mesh.name = 'frame';
  mesh.position.z = -0.01; // just behind the artwork plane
  return mesh;
}

export function updateFrame(mesh, elapsed) {
  mesh.material.uniforms.time.value = elapsed;
}
