import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveApiBase, parseArtId, shareUrlFor, artworkUrls, DEFAULT_REMOTE_API,
} from '../src/core/api.js';

test('resolveApiBase: override > github.io remote > same-origin /api', () => {
  assert.equal(resolveApiBase({ hostname: 'example.com' }, 'https://api.x.com/api/'), 'https://api.x.com/api');
  assert.equal(resolveApiBase({ hostname: 'miyuppie.github.io' }), DEFAULT_REMOTE_API);
  assert.equal(resolveApiBase({ hostname: 'MIYUPPIE.GITHUB.IO' }), DEFAULT_REMOTE_API);
  assert.equal(resolveApiBase({ hostname: 'mqtt.okhubtech.com' }), '/api');
  assert.equal(resolveApiBase({ hostname: 'localhost' }), '/api');
  assert.equal(resolveApiBase(null), '/api');
});

test('parseArtId: only well-formed ids pass', () => {
  assert.equal(parseArtId('?art=AbC123-_AbC123-_'), 'AbC123-_AbC123-_');
  assert.equal(parseArtId('?foo=1&art=AbC123-_AbC123-_&bar=2'), 'AbC123-_AbC123-_');
  assert.equal(parseArtId('?art=short'), null);
  assert.equal(parseArtId('?art=../../etc/passwd'), null);
  assert.equal(parseArtId('?other=x'), null);
  assert.equal(parseArtId(''), null);
  assert.equal(parseArtId(undefined), null);
});

test('shareUrlFor keeps the deploy path and strips index.html', () => {
  const id = 'AbC123-_AbC123-_';
  assert.equal(
    shareUrlFor(id, { origin: 'https://miyuppie.github.io', pathname: '/art/' }),
    `https://miyuppie.github.io/art/?art=${id}`,
  );
  assert.equal(
    shareUrlFor(id, { origin: 'https://mqtt.okhubtech.com', pathname: '/index.html' }),
    `https://mqtt.okhubtech.com/?art=${id}`,
  );
  assert.equal(
    shareUrlFor(id, { origin: 'http://localhost:8080', pathname: '/' }),
    `http://localhost:8080/?art=${id}`,
  );
});

test('artworkUrls builds the documented routes', () => {
  const u = artworkUrls('/api', 'AbC123-_AbC123-_');
  assert.equal(u.meta, '/api/artworks/AbC123-_AbC123-_');
  assert.equal(u.target, '/api/artworks/AbC123-_AbC123-_/target');
  assert.equal(u.image, '/api/artworks/AbC123-_AbC123-_/image');
  assert.equal(u.video, '/api/artworks/AbC123-_AbC123-_/video');
});
