import * as THREE from 'three';
import 'mindar-image-three'; // side-effect: defines window.MINDAR.IMAGE.MindARThree

import { config } from './config.js';
import { validateUpload } from './core/upload.js';
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

// Capture MindARThree NOW. The compiler bundle (mindar-image) is lazy-imported
// on upload and overwrites window.MINDAR.IMAGE, so the global ref would vanish —
// this captured reference survives.
const MindARThree = window.MINDAR?.IMAGE?.MindARThree;

const $ = (id) => document.getElementById(id);

class ARArtApp {
  constructor() {
    this.clock = new THREE.Clock();
    this.mode = DEFAULT_MODE;
    this.isTracking = false;
    this.entrance = { scale: 0, active: false };

    this.tab = 'demo';
    this.art = { image: null, targetUrl: null, compiling: null }; // uploaded artwork
    this.clip = { url: null }; // optional uploaded overlay video
    this._raf = 0;

    this.debug = new URLSearchParams(location.search).has('debug');
    this.state = {
      secure: window.isSecureContext, mindar: !!MindARThree, targetHttp: '-',
      camera: 'idle', tracking: 'idle', found: 0, frames: 0, fps: 0,
    };
    this._fpsAccum = 0; this._fpsFrames = 0; this._cameraStartedAt = 0; this._scanHintShown = false;

    this.buildHud();
    this.wireLanding();
    this.show('home');
  }

  // ===== screen routing =====
  show(screen) {
    $('screen-home').classList.toggle('hidden', screen !== 'home');
    $('screen-compiling').classList.toggle('hidden', screen !== 'compiling');
    $('screen-error').classList.toggle('hidden', screen !== 'error');
    $('ui-layer').classList.toggle('hidden', screen !== 'ar');
  }

  // ===== landing wiring =====
  wireLanding() {
    document.querySelectorAll('.seg-btn').forEach((b) =>
      b.addEventListener('click', () => this.switchTab(b.dataset.tab)),
    );

    this.wireDrop('art-drop', 'art-input', (f) => this.onArtFile(f));
    this.wireDrop('vid-drop', 'vid-input', (f) => this.onClipFile(f));

    $('launch').addEventListener('click', () => this.launch());
    $('btn-change').addEventListener('click', () => this.backToHome());
    $('err-retry').addEventListener('click', () => this.launch());
    $('err-home').addEventListener('click', () => this.backToHome());

    const on = (id, fn) => $(id)?.addEventListener('click', fn);
    on('btn-particles', () => this.applyMode('particles'));
    on('btn-3d', () => this.applyMode('3d'));
    on('btn-video', () => this.applyMode('video'));
    on('btn-reset', () => { this.content?.rotation.set(0, 0, 0); this.applyMode('particles'); });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseVideo(this.video);
      else if (this.video && videoShouldPlay(this.mode, this.isTracking)) playVideo(this.video);
    });
  }

  wireDrop(dropId, inputId, onFile) {
    const drop = $(dropId);
    const input = $(inputId);
    // drop is a <label> wrapping the hidden input, so a click opens the picker
    // natively — no manual input.click() (that would open it twice).
    input.addEventListener('change', (e) => e.target.files[0] && onFile(e.target.files[0]));
    ['dragenter', 'dragover'].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]));
  }

  switchTab(tab) {
    this.tab = tab;
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  }

  // ===== uploads =====
  async onArtFile(file) {
    const v = validateUpload(file, 'image');
    const status = $('art-status');
    if (!v.ok) { this.setArtStatus(v.error, 'err'); return; }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      $('art-empty').classList.add('hidden');
      const prev = $('art-preview');
      prev.src = url; prev.classList.remove('hidden');
      status.classList.remove('hidden');
      // Compile immediately so the gesture -> camera path at Launch stays short.
      this.compileArt(img);
    };
    img.onerror = () => this.setArtStatus('Could not read that image.', 'err');
    img.src = url;
  }

  onClipFile(file) {
    const v = validateUpload(file, 'video');
    if (!v.ok) { $('vid-label').textContent = v.error; return; }
    if (this.clip.url) URL.revokeObjectURL(this.clip.url);
    this.clip.url = URL.createObjectURL(file);
    $('vid-label').textContent = `✓ ${file.name}`;
  }

  setArtStatus(text, kind) {
    const el = $('art-status');
    el.classList.remove('hidden', 'ok', 'err');
    if (kind) el.classList.add(kind);
    el.textContent = text;
  }

  // Compile the uploaded image to a .mind target, entirely in-browser.
  compileArt(img) {
    this.art.image = img;
    this.art.targetUrl = null;
    this.setArtStatus('Preparing marker…', null);
    this.art.compiling = (async () => {
      const Compiler = await this.loadCompiler();
      const compiler = new Compiler();
      await compiler.compileImageTargets([img], (p) => this.setArtStatus(`Preparing marker… ${Math.round(p)}%`, null));
      const buffer = await compiler.exportData();
      if (this.art.targetUrl) URL.revokeObjectURL(this.art.targetUrl);
      this.art.targetUrl = URL.createObjectURL(new Blob([buffer]));
      this.setArtStatus('✓ Marker ready', 'ok');
      return this.art.targetUrl;
    })().catch((e) => {
      console.error('Compile failed:', e);
      this.setArtStatus('Compile failed. Try another image.', 'err');
      throw e;
    });
    return this.art.compiling;
  }

  async loadCompiler() {
    await import('mindar-image'); // overwrites window.MINDAR.IMAGE (MindARThree already captured)
    const C = window.MINDAR?.IMAGE?.Compiler;
    if (typeof C !== 'function') throw new Error('Compiler failed to load.');
    return C;
  }

  // ===== launch =====
  async launch() {
    const btn = $('launch');
    btn.disabled = true;
    try {
      let targetSrc = config.targetSrc;
      let videoSrc = config.videoSrc;

      if (this.tab === 'custom') {
        if (!this.art.image) { this.setArtStatus('Upload an image first.', 'err'); return; }
        this.show('compiling');
        targetSrc = this.art.targetUrl || (await this.art.compiling);
        videoSrc = this.clip.url || null;
      }

      await this.setupAR(targetSrc, videoSrc); // <- camera requested here, on the tap
      this.show('ar');
    } catch (err) {
      console.error('Launch failed:', err);
      this.showLaunchError(err);
    } finally {
      btn.disabled = false;
    }
  }

  backToHome() {
    this.teardown();
    this.show('home');
  }

  // ===== AR engine =====
  async setupAR(targetSrc, videoSrc) {
    if (!window.isSecureContext) {
      const e = new Error('This page must be served over https:// for the camera to work.');
      e.name = 'SecurityError';
      throw e;
    }
    if (!MindARThree) throw new Error('MindAR failed to load (check your connection).');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera not supported in this browser.');

    this.teardown(); // safe to call repeatedly

    this.mindar = new MindARThree({
      container: $('ar-container'),
      imageTargetSrc: targetSrc,
      ...config.mindar,
    });

    const { renderer, scene, camera } = this.mindar;
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const anchor = this.mindar.addAnchor(0);
    this.anchor = anchor;
    this.content = new THREE.Group();
    anchor.group.add(this.content);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    this.particles = buildParticles();
    this.model = buildModel();
    this.video = buildVideo(videoSrc);
    this.frame = buildFrame();
    this.content.add(this.frame, this.particles, this.model, this.video);

    if (config.modelSrc) {
      loadGltf(this.model, config.modelSrc).catch((e) => console.warn('Model load failed:', e));
    }

    this.mode = DEFAULT_MODE;
    this.applyMode(this.mode);

    anchor.onTargetFound = () => { this.isTracking = true; this.onTargetFound(); };
    anchor.onTargetLost = () => { this.isTracking = false; this.onTargetLost(); };

    this.state.camera = 'starting'; this.updateHud();
    await this.mindar.start(); // resolves once the camera stream is live
    this.state.camera = 'live'; this._cameraStartedAt = performance.now();
    this._scanHintShown = false; this.updateHud();

    const loop = () => { this.tick(); this._raf = requestAnimationFrame(loop); };
    this._raf = requestAnimationFrame(loop);
  }

  teardown() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    if (this.video) pauseVideo(this.video);
    if (this.mindar) {
      try { this.mindar.stop(); } catch { /* not started */ }
      this.mindar = null;
    }
    const c = $('ar-container');
    while (c.firstChild) c.removeChild(c.firstChild); // drop MindAR's <video>/<canvas>
    this.isTracking = false;
    this.state.camera = 'idle'; this.state.tracking = 'idle';
    this.setStatus('Scanning…', false);
  }

  tick() {
    const dt = this.clock.getDelta();
    const t = this.clock.getElapsedTime();

    this.state.frames++; this._fpsFrames++; this._fpsAccum += dt;
    if (this._fpsAccum >= 0.5) {
      this.state.fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0; this._fpsFrames = 0; this.updateHud();
    }

    if (!this.isTracking && !this._scanHintShown && this._cameraStartedAt &&
        performance.now() - this._cameraStartedAt > 6000) {
      this._scanHintShown = true;
      this.setInstructions('Still scanning. Get the marker flat, well-lit, and filling most of the frame.');
    }

    if (this.entrance.active) {
      this.entrance.scale += (1 - this.entrance.scale) * Math.min(1, dt * 8);
      if (this.entrance.scale > 0.999) { this.entrance.scale = 1; this.entrance.active = false; }
      this.content.scale.setScalar(this.entrance.scale);
    }

    updateFrame(this.frame, t);
    if (this.particles.visible) updateParticles(this.particles, dt, t);
    if (this.model.visible) updateModel(this.model, dt, t);
    if (this.video.visible) updateVideo(this.video);

    this.renderer.render(this.scene, this.camera);
  }

  applyMode(requested) {
    if (!this.particles) return;
    this.mode = resolveMode(requested);
    const vis = visibilityFor(this.mode);
    this.particles.visible = vis.particles;
    this.model.visible = vis.model;
    this.video.visible = vis.video;
    if (videoShouldPlay(this.mode, this.isTracking)) playVideo(this.video);
    else pauseVideo(this.video);
    this.syncButtons();
  }

  onTargetFound() {
    this.state.tracking = 'FOUND'; this.state.found++; this.updateHud();
    this.setStatus('Artwork detected', true);
    this.setInstructions('Tap a control to switch effects');
    this.entrance = { scale: 0, active: true };
    if (videoShouldPlay(this.mode, true)) playVideo(this.video);
  }

  onTargetLost() {
    this.state.tracking = 'scanning'; this.updateHud();
    this.setStatus('Scanning…', false);
    this.setInstructions('Point your camera at the artwork');
    pauseVideo(this.video);
  }

  // ===== UI helpers =====
  syncButtons() {
    const map = { particles: 'btn-particles', '3d': 'btn-3d', video: 'btn-video' };
    for (const [mode, id] of Object.entries(map)) {
      $(id)?.classList.toggle('active', this.mode === mode);
    }
  }
  setStatus(text, tracking) {
    const pill = $('tracker-status');
    if (!pill) return;
    pill.classList.toggle('tracking', tracking);
    pill.querySelector('span').textContent = text;
  }
  setInstructions(text) { const el = $('instructions'); if (el) el.textContent = text; }

  showLaunchError(err) {
    const name = err?.name;
    let title = 'Something went wrong';
    let msg = err?.message || String(err);
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      title = 'Camera blocked';
      msg = 'Allow camera access for this site, then tap Try again. On a phone this also requires https://.';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      title = 'No camera found'; msg = 'Connect or enable a camera, then try again.';
    } else if (name === 'NotReadableError') {
      title = 'Camera in use'; msg = 'Another app is using the camera. Close it and try again.';
    }
    $('err-title').textContent = title;
    $('err-msg').textContent = msg;
    this.show('error');
  }

  // ===== compile progress overlay =====
  // (compileArt updates the dropzone; this overlay shows during Launch if needed)
  setCompileProgress(p) {
    $('compile-bar').style.width = p + '%';
    $('compile-pct').textContent = Math.round(p) + '%';
  }

  // ===== debug HUD =====
  buildHud() {
    if (!this.debug) return;
    window.__arApp = this;
    const hud = document.createElement('div');
    hud.id = 'debug-hud';
    Object.assign(hud.style, {
      position: 'fixed', left: '8px', bottom: '8px', zIndex: '9999',
      font: '12px/1.45 monospace', color: '#0ff', background: 'rgba(0,0,0,0.75)',
      padding: '8px 10px', borderRadius: '8px', whiteSpace: 'pre', pointerEvents: 'none', maxWidth: '92vw',
    });
    document.body.appendChild(hud);
    this._hud = hud;
    this.updateHud();
  }
  updateHud() {
    if (!this._hud) return;
    const s = this.state;
    this._hud.textContent =
      `secureContext : ${s.secure}\nprotocol      : ${location.protocol}\n` +
      `MindAR        : ${s.mindar}\ncamera        : ${s.camera}\n` +
      `tracking      : ${s.tracking}  (found x${s.found})\nframes / fps  : ${s.frames} / ${s.fps}\n` +
      `mode          : ${this.mode}  tab: ${this.tab}`;
  }
}

new ARArtApp();
