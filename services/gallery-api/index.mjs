// Production entry point. Config is env-only so the same code runs locally
// (`npm run api` at repo root) and in the VPS container (deploy/docker-compose.yml).

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGalleryServer } from './server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.PORT) || 8787;
const dataDir = process.env.DATA_DIR || path.join(here, 'data');
const maxArtworks = Number(process.env.MAX_ARTWORKS) || 500;
const trustProxy = process.env.TRUST_PROXY === '1';

const { server } = await createGalleryServer({ dataDir, maxArtworks, trustProxy });

server.listen(port, () => {
  console.log(`[gallery-api] listening on :${port} data=${dataDir} cap=${maxArtworks} trustProxy=${trustProxy}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
