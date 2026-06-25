import * as THREE from 'three';

// Video overlay framed above the artwork. Degrades gracefully: if the mp4 is
// missing or fails to load, the plane shows a labelled placeholder telling the
// user where to drop their clip, so the feature still "works" out of the box.

export function buildVideo(videoUrl) {
  const group = new THREE.Group();
  group.name = 'video';

  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  video.loop = true;
  video.muted = true; // required for autoplay on mobile
  video.playsInline = true;
  video.preload = 'auto';

  const state = { video, ready: false, failed: false };

  const texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
  });

  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5625), material); // 16:9
  plane.position.set(0, 0.55, 0.06);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 0.62, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.15 }),
  );
  frame.position.set(0, 0.55, 0.04);

  group.add(frame, plane);

  function applyPlaceholder() {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 288;
    const ctx = cv.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 512, 288);
    grad.addColorStop(0, '#00d4ff');
    grad.addColorStop(1, '#7b2cbf');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('Add your clip at', 256, 132);
    ctx.font = '20px monospace';
    ctx.fillText('assets/video.mp4', 256, 168);

    material.map = new THREE.CanvasTexture(cv);
    material.needsUpdate = true;
  }

  video.addEventListener('canplay', () => { state.ready = true; });
  video.addEventListener('error', () => { state.failed = true; applyPlaceholder(); });

  group.userData = { state, texture };
  return group;
}

export function playVideo(group) {
  const { state } = group.userData;
  if (state.failed || !state.video) return;
  const p = state.video.play();
  if (p && p.catch) p.catch(() => {}); // ignore autoplay rejections
}

export function pauseVideo(group) {
  const v = group.userData.state.video;
  if (v && !v.paused) v.pause();
}

export function updateVideo(group) {
  const { texture, state } = group.userData;
  if (state.ready && !state.failed) texture.needsUpdate = true;
}
