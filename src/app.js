import * as THREE from 'three';
import 'mindar-image-three'; // side-effect: defines window.MINDAR.IMAGE.MindARThree

import { config } from './config.js';
import {
  visibilityFor,
  resolveMode,
  videoShouldPlay,
  DEFAULT_MODE,
} from './core/modeMachine.js';
import { buildParticles, updateParticles } from './effects/particles.js';
import { buildModel, updateModel, loadGltf } from './effects/model.js';
import { buildVideo, updateVideo, playVideo, pauseVideo } from './effects/video.js';
import { buildFrame, updateFrame } from './effects/frame.js';

class ARArtApp {
  constructor() {
    this.clock = new THREE.Clock();
    this.mode = DEFAULT_MODE;
    this.isTracking = false;
    this.entrance = { scale: 0, active: false };

    // Diagnostics. Add ?debug=1 to the URL for an on-screen state overlay.
    this.debug = new URLSearchParams(location.search).has('debug');
    this.state = {
      secure: window.isSecureContext,
      mindar: false,
      targetHttp: '?',
      camera: 'pending',
      tracking: 'scanning',
      found: 0,
      frames: 0,
      fps: 0,
    };
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._cameraStartedAt = 0;
    this._scanHintShown = false;

    this.init();
  }

  async init() {
    this.buildHud();
    try {
      if (!window.isSecureContext) {
        throw new Error(
          'Not a secure context. The camera only works on https:// or http://localhost — ' +
            'not file:// or a plain LAN IP. See the README "Test it on your phone" section.',
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported in this browser.');
      }
      await this.setupAR();
      this.setupUI();
      this.hideLoading();
    } catch (err) {
      console.error('AR init failed:', err);
      this.state.camera = err?.name || 'error';
      this.updateHud();
      this.showError(this.explainError(err));
    }
  }

  async setupAR() {
    const MindARThree = window.MINDAR?.IMAGE?.MindARThree;
    if (!MindARThree) throw new Error('MindAR failed to load (check your connection).');
    this.state.mindar = true;
    this.updateHud();

    // Preflight the target file so a wrong path / 404 is an obvious error
    // instead of a camera that silently never detects anything.
    this.setLoading('Loading image target…');
    try {
      const res = await fetch(config.targetSrc, { method: 'GET' });
      this.state.targetHttp = String(res.status);
      if (!res.ok) {
        throw new Error(
          `Target file ${config.targetSrc} returned HTTP ${res.status}. ` +
            'Check targetSrc in src/config.js and that the .mind file exists.',
        );
      }
    } catch (e) {
      this.state.targetHttp = 'FETCH FAIL';
      throw e;
    }
    this.updateHud();

    this.mindar = new MindARThree({
      container: document.querySelector('#ar-container'),
      imageTargetSrc: config.targetSrc,
      ...config.mindar,
    });

    const { renderer, scene, camera } = this.mindar;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const anchor = this.mindar.addAnchor(0);
    this.anchor = anchor;

    this.content = new THREE.Group();
    anchor.group.add(this.content);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    this.particles = buildParticles();
    this.model = buildModel();
    this.video = buildVideo(config.videoSrc);
    this.frame = buildFrame();
    this.content.add(this.frame, this.particles, this.model, this.video);

    if (config.modelSrc) {
      loadGltf(this.model, config.modelSrc).catch((e) =>
        console.warn('Model load failed, keeping procedural butterfly:', e),
      );
    }

    this.applyMode(this.mode);

    anchor.onTargetFound = () => {
      this.isTracking = true;
      this.onTargetFound();
    };
    anchor.onTargetLost = () => {
      this.isTracking = false;
      this.onTargetLost();
    };

    this.setLoading('Requesting camera…');
    await this.mindar.start(); // resolves once the camera stream is live
    this.state.camera = 'live';
    this._cameraStartedAt = performance.now();
    this.updateHud();

    // Plain rAF loop (no WebXR here). MindAR runs its own camera-processing loop
    // for detection; this loop just renders the AR layer each frame.
    const loop = () => {
      this.tick();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  tick() {
    const dt = this.clock.getDelta();
    const t = this.clock.getElapsedTime();

    this.state.frames++;
    this._fpsFrames++;
    this._fpsAccum += dt;
    if (this._fpsAccum >= 0.5) {
      this.state.fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
      this.updateHud();
    }

    // If the camera has been live a while with no detection, guide the user.
    if (!this.isTracking && !this._scanHintShown && this._cameraStartedAt &&
        performance.now() - this._cameraStartedAt > 6000) {
      this._scanHintShown = true;
      this.setInstructions(
        'Still scanning. Point at assets/example-card.png, well-lit, flat, filling most of the frame. ' +
          'Your own art only works after compiling it (tools/compile.html).',
      );
    }

    if (this.entrance.active) {
      this.entrance.scale += (1 - this.entrance.scale) * Math.min(1, dt * 8);
      if (this.entrance.scale > 0.999) {
        this.entrance.scale = 1;
        this.entrance.active = false;
      }
      this.content.scale.setScalar(this.entrance.scale);
    }

    updateFrame(this.frame, t);
    if (this.particles.visible) updateParticles(this.particles, dt, t);
    if (this.model.visible) updateModel(this.model, dt, t);
    if (this.video.visible) updateVideo(this.video);

    this.renderer.render(this.scene, this.camera);
  }

  applyMode(requested) {
    this.mode = resolveMode(requested);
    const vis = visibilityFor(this.mode);
    this.particles.visible = vis.particles;
    this.model.visible = vis.model;
    this.video.visible = vis.video;

    if (videoShouldPlay(this.mode, this.isTracking)) playVideo(this.video);
    else pauseVideo(this.video);

    this.syncButtons();
  }

  // ---- tracking callbacks ----
  onTargetFound() {
    this.state.tracking = 'FOUND';
    this.state.found++;
    this.updateHud();
    this.setStatus('✓ Artwork detected', true);
    this.setInstructions('Tap a control to switch effects');
    this.entrance = { scale: 0, active: true };
    if (videoShouldPlay(this.mode, true)) playVideo(this.video);
  }

  onTargetLost() {
    this.state.tracking = 'scanning';
    this.updateHud();
    this.setStatus('Scanning…', false);
    this.setInstructions('Point your camera at the artwork');
    pauseVideo(this.video);
  }

  // ---- UI ----
  setupUI() {
    const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
    on('btn-particles', () => this.applyMode('particles'));
    on('btn-3d', () => this.applyMode('3d'));
    on('btn-video', () => this.applyMode('video'));
    on('btn-reset', () => {
      this.content.rotation.set(0, 0, 0);
      this.applyMode('particles');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseVideo(this.video);
      else if (videoShouldPlay(this.mode, this.isTracking)) playVideo(this.video);
    });
  }

  syncButtons() {
    const map = { particles: 'btn-particles', '3d': 'btn-3d', video: 'btn-video' };
    for (const [mode, id] of Object.entries(map)) {
      document.getElementById(id)?.classList.toggle('active', this.mode === mode);
    }
  }

  setStatus(text, tracking) {
    const el = document.getElementById('tracker-status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('tracking', tracking);
  }

  setInstructions(text) {
    const el = document.getElementById('instructions');
    if (el) el.textContent = text;
  }

  setLoading(text) {
    const p = document.querySelector('#loading p');
    if (p) p.textContent = text;
  }

  hideLoading() {
    document.getElementById('loading')?.classList.add('hidden');
    document.getElementById('ui-layer')?.classList.remove('hidden');
  }

  showError(msg) {
    const loading = document.getElementById('loading');
    if (!loading) return;
    loading.classList.remove('hidden');
    const p = loading.querySelector('p');
    if (p) {
      p.textContent = 'Error: ' + msg;
      p.style.color = '#ff5577';
    }
    const spinner = loading.querySelector('.spinner');
    if (spinner) spinner.style.display = 'none';
  }

  // Turn cryptic getUserMedia/DOMException names into actionable messages.
  explainError(err) {
    const name = err?.name;
    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Camera permission was denied. Allow camera access for this site and reload.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No camera found. Connect/enable a camera and reload.';
      case 'NotReadableError':
        return 'The camera is in use by another app. Close it and reload.';
      default:
        return err?.message || String(err);
    }
  }

  // ---- debug HUD ----
  buildHud() {
    if (!this.debug) return;
    window.__arApp = this; // debug-only handle for inspecting live state
    const hud = document.createElement('div');
    hud.id = 'debug-hud';
    Object.assign(hud.style, {
      position: 'fixed', left: '8px', bottom: '8px', zIndex: '9999',
      font: '12px/1.45 monospace', color: '#0ff', background: 'rgba(0,0,0,0.75)',
      padding: '8px 10px', borderRadius: '8px', whiteSpace: 'pre', pointerEvents: 'none',
      maxWidth: '90vw',
    });
    document.body.appendChild(hud);
    this._hud = hud;
    this.updateHud();
  }

  updateHud() {
    if (!this._hud) return;
    const s = this.state;
    this._hud.textContent =
      `secureContext : ${s.secure}\n` +
      `protocol      : ${location.protocol}\n` +
      `MindAR loaded : ${s.mindar}\n` +
      `target HTTP   : ${s.targetHttp}  (${config.targetSrc})\n` +
      `camera        : ${s.camera}\n` +
      `tracking      : ${s.tracking}  (found x${s.found})\n` +
      `frames / fps  : ${s.frames} / ${s.fps}\n` +
      `mode          : ${this.mode}`;
  }
}

// type="module" scripts are deferred, so the DOM is ready by the time this runs.
new ARArtApp();
