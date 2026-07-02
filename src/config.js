// App configuration. Swap these to point at your own content.
export const config = {
  // Compiled image target. Ships with the MindAR example card so the app works
  // immediately. Compile your own at tools/compile.html, drop it in targets/,
  // and point this here.
  targetSrc: './targets/example-card.mind',

  // Optional overlay content. The app degrades gracefully if these are absent.
  videoSrc: './assets/video.mp4',
  modelSrc: null, // e.g. './assets/model.glb' to load a real 3D model

  // Gallery API override. null = auto: same-origin /api, or the production API
  // when the frontend is on a static host (see src/core/api.js).
  apiBase: null,

  // MindAR tracking tuning. Lower filterMinCF = smoother but laggier.
  mindar: {
    maxTrack: 1,
    filterMinCF: 0.001,
    filterBeta: 0.01,
    missTolerance: 5,
  },
};
