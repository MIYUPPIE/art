import * as THREE from 'three';

export function buildArtifact() {
    const group = new THREE.Group();
    group.name = 'artifact';

    // Floating crystalline shape
    const crystalGeo = new THREE.OctahedronGeometry(0.15, 0);
    const crystalMat = new THREE.MeshPhysicalMaterial({
        color: 0x00ffcc,
        metalness: 0.9,
        roughness: 0.1,
        transmission: 0.9,
        thickness: 0.5,
        emissive: 0x0044aa,
        emissiveIntensity: 0.5,
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);

    // Wireframe cage spinning around it
    const cageGeo = new THREE.IcosahedronGeometry(0.25, 1);
    const cageMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
    });
    const cage = new THREE.Mesh(cageGeo, cageMat);

    // Core energy
    const coreGeo = new THREE.SphereGeometry(0.05, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeo, coreMat);

    // Three intersecting rings
    const rings = new THREE.Group();
    for (let i = 0; i < 3; i++) {
        const ringGeo = new THREE.TorusGeometry(0.35, 0.005, 16, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.y = (Math.PI / 3) * i;
        rings.add(ring);
    }

    const root = new THREE.Group();
    root.add(crystal, cage, core, rings);
    root.position.set(0, 0.25, 0.1);
    group.add(root);

    // Add highly intense point light
    const light = new THREE.PointLight(0x00ffcc, 2, 5);
    root.add(light);

    group.userData = { root, crystal, cage, rings };
    return group;
}

export function updateArtifact(group, dt, elapsed) {
    const { root, crystal, cage, rings } = group.userData;

    root.position.y = 0.25 + Math.sin(elapsed * 2) * 0.05; // Hover

    crystal.rotation.y = elapsed;
    crystal.rotation.x = elapsed * 0.5;

    cage.rotation.y = -elapsed * 0.5;
    cage.rotation.z = elapsed * 0.2;

    rings.children.forEach((ring, i) => {
        ring.rotation.x = elapsed * (1 + i * 0.2);
        ring.rotation.y = elapsed * (0.8 - i * 0.1);
    });
}
