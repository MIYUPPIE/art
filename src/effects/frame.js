import * as THREE from 'three';

// A pulsing glow border that sits just behind the tracked artwork to confirm
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
    float b = 0.06;
    vec2 uv = vUv;
    float edge = smoothstep(0.0, b, uv.x) *
                 smoothstep(1.0, 1.0 - b, uv.x) *
                 smoothstep(0.0, b, uv.y) *
                 smoothstep(1.0, 1.0 - b, uv.y);
    float pulse = 0.6 + 0.4 * sin(time * 3.0);
    float glow = (1.0 - edge) * pulse;
    gl_FragColor = vec4(color, glow * 0.6);
  }
`;

export function buildFrame() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(0x00d4ff) },
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
