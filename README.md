# 🎨 AR Art Gallery

A marker-based augmented reality web app that animates artwork. Point a phone (or
laptop webcam) at a tracked image and Three.js effects appear locked to it — no
QR codes, no app install. Tracking is natural-feature based via
[MindAR](https://github.com/hiukim/mind-ar-js); rendering is
[Three.js](https://threejs.org/).

Effects: floating **particles**, a procedural **3D butterfly**, a framed **video**
overlay, plus an always-on glow border that confirms detection.

## Run it locally

```bash
npm run serve
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

## Use your own artwork

1. `npm run serve`, then open <http://localhost:8080/tools/compile.html>.
2. Drop in your image (high-contrast, detailed, asymmetric works best). It compiles
   to a `.mind` file **in your browser** — nothing is uploaded.
3. Move the downloaded file into `targets/` and point `src/config.js` at it:
   ```js
   targetSrc: './targets/my-artwork.mind',
   ```

## Add a video or 3D model

- **Video:** drop a clip at `assets/video.mp4`. The 🎬 button plays it framed above
  the art. (Missing file → a labelled placeholder, app still runs.)
- **3D model:** put a `.glb` at `assets/model.glb` and set
  `modelSrc: './assets/model.glb'` in `src/config.js`. Embedded animation clips play
  automatically; otherwise the procedural butterfly is used.

## Project layout

```
index.html              entry point: importmap (three + mind-ar via CDN), UI shell
styles.css              UI overlay styling
src/
  app.js                orchestration: MindAR + Three glue, render loop, UI wiring
  config.js             target / video / model paths + MindAR tuning
  core/
    modeMachine.js      pure effect-switching state machine (unit-tested)
    particlePhysics.js  pure particle spawn/step math (unit-tested)
  effects/
    particles.js  model.js  video.js  frame.js
tools/
  serve.mjs             zero-dependency static dev server (MIME + range support)
  compile.html          in-browser artwork → .mind compiler
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

Deterministic, dependency-free, runs in well under a second. Covers the particle
physics (spawn bounds, deterministic seeding, upward recycle, array integrity) and
the mode state machine (valid/invalid modes, exactly-one-visible, video play gating).

There is no eval suite: the app has no LLM/latent-space component — it is entirely
deterministic rendering, fully covered by the gate tests above.

## Deploy

It is a static site. Any static host works (Netlify drag-and-drop, Vercel, GitHub
Pages). **HTTPS is required** in production for camera access. `three` and `mind-ar`
load from jsDelivr at runtime, so the deploy is just these files.

## Notes / gotchas

- `three` is pinned to **0.160.0**. MindAR 1.2.5 uses `sRGBEncoding`, removed in
  three ≥ 0.162 — newer three will break the bundle.
- One effect is visible at a time; the glow frame is always on while tracking.
- Effects render on an inner group, not MindAR's anchor group, so entrance/reset
  transforms don't fight MindAR's tracking matrix.
