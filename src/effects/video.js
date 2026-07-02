import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { glowTexture } from './glow.js';

// Video overlay framed above the artwork, presented like a gallery screen: a
// slim metallic frame with a palette-tinted emissive rim and a soft screen
// glow. Degrades gracefully: if the mp4 is missing or fails, the plane shows a
// labelled placeholder so the feature still "works" out of the box.

export function buildVideo(videoUrl, artworkUrl = null) {
  const group = new THREE.Group();
  group.name = 'video';

  const video = document.createElement('video');
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
    opacity: 0.98,
    side: THREE.DoubleSide,
  });

  const W = 1.0;
  const H = 0.5625; // 16:9

  // Video plane (front).
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), material);
  plane.position.set(0, 0.55, 0.07);

  // Slim brushed frame with a cyan emissive rim.
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.06, H + 0.06, 0.02),
    new THREE.MeshStandardMaterial({
      color: 0x0d0d16,
      metalness: 0.85,
      roughness: 0.25,
      emissive: PALETTE.cyan,
      emissiveIntensity: 0.35,
    }),
  );
  frame.position.set(0, 0.55, 0.045);

  // Soft screen glow spilling out behind the frame.
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('dot'),
      color: PALETTE.cyan,
      opacity: 0.35,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.set(1.6, 1.1, 1);
  glow.position.set(0, 0.55, 0.03);

  // Optional artwork plane between the frame and the video, faintly showing
  // through (kept from prior behaviour).
  let artPlane = null;
  if (artworkUrl) {
    try {
      const artTex = new THREE.TextureLoader().load(artworkUrl);
      const artMat = new THREE.MeshBasicMaterial({ map: artTex, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
      artPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), artMat);
      artPlane.position.set(0, 0.55, 0.055);
    } catch (e) {
      artPlane = null;
    }
  }

  // Order: glow (back), frame, artwork (mid), video (front).
  group.add(glow, frame);
  if (artPlane) group.add(artPlane);
  group.add(plane);

  // The metallic frame needs a light to catch; scene ambient alone is too flat.
  const light = new THREE.PointLight(PALETTE.white, 1.0, 4);
  light.position.set(0, 0.9, 0.6);
  group.add(light);

  function applyPlaceholder() {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 288;
    const ctx = cv.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 512, 288);
    grad.addColorStop(0, '#1b1140');
    grad.addColorStop(1, '#0b2540');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = '#eef4ff';
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

  // No clip supplied (demo, or user skipped the optional upload): show the
  // labelled placeholder instead of trying to load a missing file.
  if (videoUrl) {
    video.src = videoUrl;
  } else {
    state.failed = true;
    applyPlaceholder();
  }

  group.userData = { state, texture };
  return group;
}

// Controls live in core (pure, unit-tested); re-exported here so consumers
// keep importing everything video-related from this effect module.
export { playVideo, pauseVideo, updateVideo } from '../core/videoControls.js';
