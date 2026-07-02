import * as THREE from 'three';
import 'mindar-image-three'; // side-effect: defines window.MINDAR.IMAGE.MindARThree

import { config } from './config.js';
import { validateUpload } from './core/upload.js';
import { detectWebGL, WEBGL_HELP } from './core/webgl.js';
import { resolveApiBase, parseArtId, shareUrlFor, artworkUrls } from './core/api.js';
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
    // uploaded artwork (file + compiled target kept for the share upload)
    this.art = { image: null, file: null, targetUrl: null, targetBuffer: null, compiling: null };
    this.clip = { url: null, file: null }; // optional uploaded overlay video
    this._raf = 0;
    this._wakeLock = null;

    // Gallery backend: probed at boot; share/scan-link features only appear
    // when it answers. The app is fully usable without it.
    this.apiBase = resolveApiBase(location, config.apiBase);
    this.apiOk = false;
    this.shared = null; // { id, meta } when opened via ?art=<id>

    this.debug = new URLSearchParams(location.search).has('debug');
    this.webgl = detectWebGL();
    this.state = {
      secure: window.isSecureContext, mindar: !!MindARThree, webgl: this.webgl.ok ? `v${this.webgl.version}` : 'OFF',
      targetHttp: '-', camera: 'idle', tracking: 'idle', found: 0, frames: 0, fps: 0,
    };
    this._fpsAccum = 0; this._fpsFrames = 0; this._cameraStartedAt = 0; this._scanHintShown = false;

    this.buildHud();
    this.wireLanding();
    this.show('home');
    this.initBackend();
  }

  // ===== gallery backend =====
  async initBackend() {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch(`${this.apiBase}/health`, { signal: ctl.signal });
      clearTimeout(timer);
      this.apiOk = res.ok && (await res.json()).ok === true;
    } catch {
      this.apiOk = false;
    }
    this.updateShareUi();

    const artId = parseArtId(location.search);
    if (artId) await this.loadShared(artId);
  }

  // Opened via a share link: fetch the artwork and pin the landing to it.
  async loadShared(id) {
    const urls = artworkUrls(this.apiBase, id);
    try {
      const res = await fetch(urls.meta);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = await res.json();
      this.shared = { id, meta, urls };
      $('shared-thumb').src = urls.image;
      $('shared-hint').textContent = meta.title
        ? `“${meta.title}” — point your camera at this artwork after launch.`
        : 'Point your camera at this artwork after launch.';
      document.querySelector('.seg').classList.add('hidden');
      this.switchTab('shared');
    } catch (e) {
      console.warn('Shared artwork unavailable:', e);
      this.shared = null;
      this.switchTab('demo');
      document.querySelector('.tagline').textContent =
        'That shared artwork is gone or unreachable — try the demo instead.';
    }
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

    on('btn-share', () => this.saveAndShare());
    on('btn-copy', () => this.copyShareLink());
    on('btn-native-share', () => this.nativeShare());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseVideo(this.video);
      else if (this.video && videoShouldPlay(this.mode, this.isTracking)) playVideo(this.video);
      // Wake locks are auto-released when the page is hidden; re-acquire.
      if (!document.hidden && this.mindar) this.acquireWakeLock();
    });

    // MindAR resizes on `resize`, but iOS fires orientation events before the
    // new layout has settled — nudge it again once dimensions are final.
    const settle = () => setTimeout(() => { if (this.mindar) this.mindar.resize(); }, 350);
    window.addEventListener('orientationchange', settle);
    screen.orientation?.addEventListener?.('change', settle);
  }

  // Keep the screen on during an AR session (phones dim fast while the user
  // holds the camera still). Best-effort: unsupported browsers just dim.
  async acquireWakeLock() {
    try {
      this._wakeLock = await navigator.wakeLock?.request('screen');
    } catch { this._wakeLock = null; }
  }

  releaseWakeLock() {
    try { this._wakeLock?.release(); } catch { /* already released */ }
    this._wakeLock = null;
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
      this.art.file = file; // kept for the share upload
      this.hideShareResult(); // any previous link belongs to the previous artwork
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
    this.clip.file = file;
    this.hideShareResult(); // the link no longer matches what would be saved
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
    this.art.targetBuffer = null;
    this.updateShareUi();
    // The compiler's tfjs backend needs WebGL. Without it compileImageTargets
    // throws deep inside tfjs and never resolves — so fail fast with guidance.
    if (!this.webgl.ok) {
      this.setArtStatus(WEBGL_HELP, 'err');
      this.art.compiling = Promise.reject(new Error('WEBGL_OFF'));
      this.art.compiling.catch(() => {}); // pre-attach so it isn't an unhandled rejection
      return this.art.compiling;
    }
    this.setArtStatus('Preparing marker…', null);
    this.art.compiling = (async () => {
      const Compiler = await this.loadCompiler();
      const compiler = new Compiler();
      // Watchdog: if compile makes no forward progress for 45s, surface an error
      // instead of leaving the user staring at a frozen spinner.
      let lastProgress = Date.now();
      const compile = compiler.compileImageTargets([img], (p) => {
        lastProgress = Date.now();
        this.setArtStatus(`Preparing marker… ${Math.round(p)}%`, null);
      });
      await Promise.race([compile, this.stallGuard(() => lastProgress)]);
      const buffer = await compiler.exportData();
      if (this.art.targetUrl) URL.revokeObjectURL(this.art.targetUrl);
      this.art.targetBuffer = buffer; // kept for the share upload
      this.art.targetUrl = URL.createObjectURL(new Blob([buffer]));
      this.setArtStatus('✓ Marker ready', 'ok');
      this.updateShareUi();
      return this.art.targetUrl;
    })().catch((e) => {
      console.error('Compile failed:', e);
      this.setArtStatus(e?.message === 'COMPILE_STALLED'
        ? 'Marker prep stalled. Reload and try a smaller, high-contrast image.'
        : 'Compile failed. Try another image.', 'err');
      throw e;
    });
    return this.art.compiling;
  }

  // Rejects with COMPILE_STALLED if no progress callback fires for `ms`.
  stallGuard(getLastProgress, ms = 45000) {
    return new Promise((_, reject) => {
      const id = setInterval(() => {
        if (Date.now() - getLastProgress() > ms) {
          clearInterval(id);
          reject(new Error('COMPILE_STALLED'));
        }
      }, 1000);
      // Don't keep the loop alive once the winning promise settles.
      if (typeof id?.unref === 'function') id.unref();
    });
  }

  async loadCompiler() {
    await import('mindar-image'); // overwrites window.MINDAR.IMAGE (MindARThree already captured)
    const C = window.MINDAR?.IMAGE?.Compiler;
    if (typeof C !== 'function') throw new Error('Compiler failed to load.');
    return C;
  }

  // ===== save & share =====
  // The share button appears only when there is something to save (compiled
  // marker) and somewhere to save it (backend healthy).
  updateShareUi() {
    $('share-box')?.classList.toggle('hidden', !(this.apiOk && this.art.targetBuffer));
  }

  hideShareResult() {
    $('share-result')?.classList.add('hidden');
    this._shareUrl = null;
  }

  async saveAndShare() {
    const btn = $('btn-share');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const fd = new FormData();
      const title = (this.art.file?.name || '').replace(/\.[^.]+$/, '');
      fd.set('title', title);
      fd.set('target', new Blob([this.art.targetBuffer]), 'art.mind');
      fd.set('image', this.art.file, this.art.file.name);
      if (this.clip.file) fd.set('video', this.clip.file, this.clip.file.name);

      const res = await fetch(`${this.apiBase}/artworks`, { method: 'POST', body: fd });
      if (!res.ok) {
        const why = (await res.json().catch(() => ({}))).error;
        throw new Error(why || `Upload failed (HTTP ${res.status}).`);
      }
      const { id } = await res.json();
      this.showShareResult(shareUrlFor(id, location));
    } catch (e) {
      console.error('Share failed:', e);
      this.setArtStatus(`Could not save: ${e.message}`, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔗 Save & get share link';
    }
  }

  showShareResult(url) {
    this._shareUrl = url;
    const a = $('share-link');
    a.href = url;
    a.textContent = url.replace(/^https?:\/\//, '');
    $('btn-native-share').classList.toggle('hidden', !navigator.share);
    $('share-result').classList.remove('hidden');
    this.renderQr(url);
  }

  // QR is pure garnish on top of the link — if the CDN module fails (offline,
  // blocked), the link and copy/share buttons still work.
  async renderQr(url) {
    const canvas = $('share-qr');
    try {
      const { default: QRCode } = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
      await QRCode.toCanvas(canvas, url, {
        width: 180,
        margin: 1,
        color: { dark: '#0b0b16', light: '#f3f4f8' },
      });
      canvas.classList.remove('hidden');
    } catch (e) {
      console.warn('QR unavailable:', e);
      canvas.classList.add('hidden');
    }
  }

  async copyShareLink() {
    if (!this._shareUrl) return;
    const btn = $('btn-copy');
    try {
      await navigator.clipboard.writeText(this._shareUrl);
      btn.textContent = '✓ Copied';
    } catch {
      // Clipboard API can be denied; fall back to selecting the link text.
      const range = document.createRange();
      range.selectNodeContents($('share-link'));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = 'Press Ctrl/Cmd+C';
    }
    setTimeout(() => { btn.textContent = 'Copy link'; }, 2000);
  }

  async nativeShare() {
    if (!this._shareUrl || !navigator.share) return;
    try {
      await navigator.share({ title: 'AR Art Gallery', text: 'Scan my artwork in AR', url: this._shareUrl });
    } catch { /* user dismissed the sheet */ }
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
      } else if (this.tab === 'shared' && this.shared) {
        targetSrc = this.shared.urls.target;
        videoSrc = this.shared.meta.hasVideo ? this.shared.urls.video : null;
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
    if (!this.webgl.ok) {
      const e = new Error(WEBGL_HELP);
      e.name = 'WebGLError';
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

    // GPU context loss (memory pressure, app switching on mobile) would
    // otherwise freeze the canvas silently — surface it with a retry path.
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.teardown();
      const err = new Error('The graphics context was lost — this happens under memory pressure. Tap Try again.');
      err.name = 'WebGLContextLost';
      this.showLaunchError(err);
    });

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
    this.acquireWakeLock();

    const loop = () => { this.tick(); this._raf = requestAnimationFrame(loop); };
    this._raf = requestAnimationFrame(loop);
  }

  teardown() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this.releaseWakeLock();
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
    if (name === 'WebGLError') {
      title = 'WebGL is off';
      msg = WEBGL_HELP;
    } else if (name === 'WebGLContextLost') {
      title = 'Graphics stopped';
      // err.message already explains; keep it as-is
    } else if (name === 'NotAllowedError' || name === 'SecurityError') {
      title = 'Camera blocked';
      msg = 'Allow camera access for this site, then tap Try again. On a phone this also requires https://.';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      title = 'No camera found'; msg = 'Connect or enable a camera, then try again.';
    } else if (name === 'NotReadableError' || name === 'AbortError') {
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
      `WebGL         : ${s.webgl}\nMindAR        : ${s.mindar}\ncamera        : ${s.camera}\n` +
      `tracking      : ${s.tracking}  (found x${s.found})\nframes / fps  : ${s.frames} / ${s.fps}\n` +
      `mode          : ${this.mode}  tab: ${this.tab}`;
  }
}

new ARArtApp();
