// Pure particle math — no THREE, no DOM. The effect layer feeds these arrays
// into a Three.js BufferGeometry. Keeping the math here makes it unit-testable
// and keeps the same-input-same-output work out of the render loop's way.
//
// rng is injectable (defaults to Math.random) so tests can seed it for
// deterministic assertions.

// Spawn `count` points in a dome above the artwork. Each point sits at radius
// r in [rMin, rMax]; y is forced non-negative (dome, not sphere) plus yOffset.
export function spawnDomePositions(count, opts = {}, rng = Math.random) {
  const { rMin = 0.3, rMax = 0.8, yOffset = 0 } = opts;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = rng() * Math.PI * 0.5; // upper hemisphere
    const r = rMin + rng() * (rMax - rMin);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + yOffset;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  return positions;
}

// Velocities: x/z drift is centered, y is strictly upward so every particle
// eventually crosses resetY and recycles. (The original draft allowed negative
// y velocity, which let particles sink forever and never reset — fixed here.)
export function makeVelocities(count, speed, rng = Math.random) {
  const v = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    v[i * 3] = (rng() - 0.5) * speed * 0.5;
    v[i * 3 + 1] = (0.2 + rng() * 0.8) * speed; // upward
    v[i * 3 + 2] = (rng() - 0.5) * speed * 0.5;
  }
  return v;
}

// Advance positions in place: rise by velocity*dt, wobble in x, recycle to
// floorY once a particle climbs past resetY. Returns the same array reference.
export function stepPositions(positions, velocities, dt, elapsed, opts = {}) {
  const { resetY = 1.5, floorY = 0, wobble = 0.001 } = opts;
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
    positions[i * 3] += Math.sin(elapsed + i) * wobble;
    if (positions[i * 3 + 1] > resetY) {
      positions[i * 3 + 1] = floorY;
    }
  }
  return positions;
}
