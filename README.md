# 🎨 AR Art Gallery

A marker-based augmented reality web app that animates artwork. Point a phone (or
laptop webcam) at a tracked image and Three.js effects appear locked to it — no
QR codes, no app install. Tracking is natural-feature based via
[MindAR](https://github.com/hiukim/mind-ar-js); rendering is
[Three.js](https://threejs.org/).

Effects: floating **particles**, a procedural **3D butterfly**, a framed **video**
overlay, plus an always-on glow border that confirms detection.

The app opens on a landing screen with two paths — **Demo** (the bundled card) or
**My artwork** (upload your own). The camera is only requested when you tap
**Launch AR**, never on page load.

With the optional **gallery-api** backend running, an uploaded artwork can be
saved and shared: the app posts the image + compiled target (+ optional video)
to the backend and hands back a `?art=<id>` link with a QR code. Anyone opening
that link on any phone gets a landing pinned to that artwork and can scan it.
Without the backend the app is unchanged — share features hide themselves.

## Run it locally

```bash
npm run serve            # static app on :8080 (also proxies /api → :8787)
npm run api              # optional: gallery-api backend on :8787
```

Then open <http://localhost:8080> and allow camera access (localhost counts as a
secure context, so no HTTPS needed locally). Point the camera at the bundled
target image: `assets/example-card.png` (print it or show it on another screen).

> The example card ships compiled in `targets/example-card.mind`, so the app works
> the moment you start it.

## Test it on your phone

Cameras need a **secure context**, which on a phone means HTTPS. Easiest path:

```bash
npm run serve            # in one terminal
npx --yes localtunnel --port 8080   # or: ngrok http 8080
```

Open the HTTPS URL it prints on your phone, allow the camera, point at the card.

## Use your own artwork (in-app, recommended)

On the landing screen pick **My artwork**:
1. Upload an image (high-contrast, detailed, matte). It compiles to a MindAR target
   **in your browser** — nothing is uploaded to a server.
2. Optionally add a video that plays on your artwork via the 🎬 effect.
3. Tap **Launch AR** and point the camera at your (printed/displayed) artwork.

The compiled target is held as an in-memory blob for the session. To bake a target
in permanently instead, use the standalone compiler at
<http://localhost:8080/tools/compile.html>, drop the `.mind` in `targets/`, and set
`targetSrc` in `src/config.js`.

## Add a default video or 3D model

- **Video:** the in-app upload sets it per session. For a baked-in default, drop a
  clip at `assets/video.mp4`. (Missing file → a labelled placeholder, app still runs.)
- **3D model:** put a `.glb` at `assets/model.glb` and set
  `modelSrc: './assets/model.glb'` in `src/config.js`. Embedded animation clips play
  automatically; otherwise the procedural butterfly is used.

## Project layout

```
index.html              entry point: importmap (three + mind-ar via CDN), UI shell
styles.css              UI overlay styling
manifest.webmanifest    PWA manifest (Android install banner, icons)
src/
  app.js                orchestration: MindAR + Three glue, render loop, UI wiring
  config.js             target / video / model paths, apiBase, MindAR tuning
  core/                 pure logic, zero DOM/THREE deps, unit-tested
    modeMachine.js      effect-switching state machine
    particlePhysics.js  particle spawn/step math
    upload.js           upload validation rules
    webgl.js            WebGL capability probe
    api.js              gallery API URL building / share links / ?art= parsing
    videoControls.js    video play/pause/texture guards
  effects/
    particles.js  model.js  video.js  frame.js
services/
  gallery-api/          zero-dep Node backend: stores scannable artworks
contracts/
  gallery-api.md        the wire contract both sides code against
deploy/
  docker-compose.yml    VPS: nginx (static + /api proxy) + node api
  nginx.conf  deploy.sh  Caddyfile
tools/
  serve.mjs             zero-dependency dev server (MIME, ranges, /api proxy)
  compile.html          in-browser artwork → .mind compiler
  gen-icons.sh          regenerates assets/icon-*.png (ffmpeg)
tests/                  node --test gate tests for the pure core
targets/example-card.mind   bundled trackable target
assets/example-card.png     the image that target tracks
```

The deterministic logic (particle motion, mode switching) is isolated in `src/core/`
with **zero Three.js/DOM dependencies**, so it runs and is tested in plain Node.

## Tests

```bash
npm test
```

Deterministic, dependency-free, runs in well under a second, and covers both
suites: the frontend core (particle physics, mode machine, upload rules, WebGL
probe, API URL/share-link logic, video control guards) and the whole gallery-api
(multipart parsing against real FormData encodings, magic-byte sniffing, atomic
store + eviction, rate limiting, and live HTTP round-trips including Range
requests — the path iOS Safari needs for video).

There is no eval suite: the app has no LLM/latent-space component — it is entirely
deterministic rendering and byte shuffling, fully covered by the gate tests above.

## Deploy

The frontend is a static site — any static host works (GitHub Pages is wired up
via `.github/workflows/pages.yml`). **HTTPS is required** in production for
camera access. `three` and `mind-ar` load from jsDelivr at runtime.

Share links need the **gallery-api** backend somewhere. The production VPS runs
both containers; `./deploy/deploy.sh` ships everything (see `DEPLOY.md`). On a
static-only host the frontend points at the production API
(`src/core/api.js`), and if that's unreachable it degrades to the
frontend-only experience.

## Notes / gotchas

- `three` is pinned to **0.160.0**. MindAR 1.2.5 uses `sRGBEncoding`, removed in
  three ≥ 0.162 — newer three will break the bundle.
- One effect is visible at a time; the glow frame is always on while tracking.
- Effects render on an inner group, not MindAR's anchor group, so entrance/reset
  transforms don't fight MindAR's tracking matrix.
- Mobile hardening: `100dvh` (iOS URL-bar), screen wake lock during AR, WebGL
  context-loss → error screen with retry, orientation-change resize nudge,
  `touch-action: manipulation` on controls, PWA manifest + apple-touch-icon.
- The API serves media with byte-range support — iOS Safari refuses to play
  video without it.
