import * as THREE from 'three';

export function buildVortex() {
    const group = new THREE.Group();
    group.name = 'vortex';

    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 2000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const angles = new Float32Array(particleCount);
    const radii = new Float32Array(particleCount);
    const speeds = new Float32Array(particleCount);

    const colorInside = new THREE.Color(0xff00aa);
    const colorOutside = new THREE.Color(0x00d4ff);

    for (let i = 0; i < particleCount; i++) {
        const radius = Math.random() * Math.random() * 1.0;
        const angle = Math.random() * Math.PI * 2;

        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 0.12 * (1 - radius); // thicken near center
        positions[i * 3 + 2] = Math.sin(angle) * radius;

        const mixedColor = colorInside.clone().lerp(colorOutside, Math.min(1, radius / 1.0));
        colors[i * 3] = mixedColor.r;
        colors[i * 3 + 1] = mixedColor.g;
        colors[i * 3 + 2] = mixedColor.b;

        angles[i] = angle;
        radii[i] = radius;
        speeds[i] = 0.5 + Math.random() + (1 - radius) * 2; // closer moves faster
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: false,
    });

    const vortex = new THREE.Points(particleGeo, particleMat);
    vortex.position.set(0, 0, 0.05); // slightly above the mask

    // Tilted so it's clearly visible when phone is pointed
    vortex.rotation.x = Math.PI * 0.1;

    group.add(vortex);

    const light = new THREE.PointLight(0xff00aa, 1.5, 2);
    light.position.set(0, 0.2, 0);
    group.add(light);

    group.userData = { vortex, positions, angles, radii, speeds, particleCount };
    return group;
}

export function updateVortex(group, dt, elapsed) {
    const { vortex, positions, angles, radii, speeds, particleCount } = group.userData;

    for (let i = 0; i < particleCount; i++) {
        angles[i] += speeds[i] * dt;
        const radius = radii[i];

        positions[i * 3] = Math.cos(angles[i]) * radius;
        // adding a slow oscillation to the Y axis
        positions[i * 3 + 1] = (Math.random() - 0.5) * 0.1 * (1 - radius) + Math.sin(elapsed * 2 + radius * 5) * 0.02;
        positions[i * 3 + 2] = Math.sin(angles[i]) * radius;
    }

    vortex.geometry.attributes.position.needsUpdate = true;

    const scale = 1 + Math.sin(elapsed * 2) * 0.05;
    vortex.scale.set(scale, scale, scale);
}
