import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMultipart, boundaryFrom, MultipartError } from '../lib/multipart.mjs';

const B = 'X-BOUNDARY';

function body(...parts) {
  const chunks = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${B}\r\n${p.headers}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${B}--\r\n`));
  return Buffer.concat(chunks);
}

test('boundaryFrom extracts plain and quoted boundaries', () => {
  assert.equal(boundaryFrom('multipart/form-data; boundary=abc123'), 'abc123');
  assert.equal(boundaryFrom('multipart/form-data; boundary="a b"'), 'a b');
  assert.equal(boundaryFrom('multipart/form-data; charset=utf-8; boundary=zz'), 'zz');
  assert.equal(boundaryFrom('application/json'), null);
  assert.equal(boundaryFrom(undefined), null);
});

test('parses a simple text field', () => {
  const parts = parseMultipart(
    body({ headers: 'Content-Disposition: form-data; name="title"', data: 'Sunset' }),
    B,
  );
  assert.equal(parts.length, 1);
  assert.equal(parts[0].name, 'title');
  assert.equal(parts[0].filename, null);
  assert.equal(parts[0].data.toString(), 'Sunset');
});

test('parses multiple parts including a binary file', () => {
  // Binary payload that contains CRLFs and fake boundary-ish bytes.
  const bin = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('\r\n--not-the-boundary\r\n'),
    Buffer.from([0, 1, 2, 253, 254, 255]),
  ]);
  const parts = parseMultipart(
    body(
      { headers: 'Content-Disposition: form-data; name="title"', data: 'Two' },
      {
        headers:
          'Content-Disposition: form-data; name="image"; filename="a.png"\r\nContent-Type: image/png',
        data: bin,
      },
    ),
    B,
  );
  assert.equal(parts.length, 2);
  assert.equal(parts[1].name, 'image');
  assert.equal(parts[1].filename, 'a.png');
  assert.equal(parts[1].contentType, 'image/png');
  assert.deepEqual(parts[1].data, bin);
});

test('empty part body is preserved as empty buffer', () => {
  const parts = parseMultipart(
    body({ headers: 'Content-Disposition: form-data; name="video"; filename=""', data: '' }),
    B,
  );
  assert.equal(parts[0].data.length, 0);
  assert.equal(parts[0].filename, '');
});

test('tolerates preamble and epilogue', () => {
  const core = body({ headers: 'Content-Disposition: form-data; name="t"', data: 'v' });
  const withNoise = Buffer.concat([Buffer.from('ignored preamble'), Buffer.from('\r\n'), core, Buffer.from('trailing junk')]);
  const parts = parseMultipart(withNoise, B);
  assert.equal(parts[0].data.toString(), 'v');
});

test('throws MultipartError on missing or unterminated boundary', () => {
  assert.throws(() => parseMultipart(Buffer.from('no boundaries here'), B), MultipartError);
  const truncated = body({ headers: 'Content-Disposition: form-data; name="t"', data: 'v' }).subarray(0, 30);
  assert.throws(() => parseMultipart(truncated, B), MultipartError);
  assert.throws(() => parseMultipart(Buffer.from('x'), ''), MultipartError);
});

test('round-trips a real FormData encoding', async () => {
  // Encode with the platform's own FormData to prove we parse what browsers send.
  const fd = new FormData();
  fd.set('title', 'Real Encoder');
  fd.set('image', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' }), 'p.jpg');
  const req = new Request('http://x', { method: 'POST', body: fd });
  const raw = Buffer.from(await req.arrayBuffer());
  const boundary = boundaryFrom(req.headers.get('content-type'));

  const parts = parseMultipart(raw, boundary);
  const byName = Object.fromEntries(parts.map((p) => [p.name, p]));
  assert.equal(byName.title.data.toString(), 'Real Encoder');
  assert.equal(byName.image.filename, 'p.jpg');
  assert.equal(byName.image.contentType, 'image/jpeg');
  assert.deepEqual(byName.image.data, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
});
