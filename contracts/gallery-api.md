# Gallery API contract — v1

Boundary between the static frontend (`src/`) and `services/gallery-api/`.
Both sides code against this file. Breaking changes bump the version and both
sides move in the same commit.

Base path: `/api` behind the reverse proxy (the service also answers without
the prefix when addressed directly). All responses carry
`Access-Control-Allow-Origin: *` — artworks are public by design; do not put
private data behind this API.

## GET /api/health

`200 {"ok": true, "version": 1}` — the frontend probes this once per page load;
share features stay hidden unless it answers.

## POST /api/artworks

`multipart/form-data`:

| field    | required | constraints                                              |
|----------|----------|----------------------------------------------------------|
| `target` | yes      | compiled MindAR `.mind`, 64 B – 12 MB                     |
| `image`  | yes      | PNG / JPEG / WebP by magic bytes (not extension), ≤ 15 MB |
| `video`  | no       | MP4 / WebM / Ogg by magic bytes, ≤ 50 MB (empty = absent) |
| `title`  | no       | text; control chars stripped, ≤ 120 chars                 |

Whole body ≤ 80 MB. The target is compiled **in the uploader's browser**; the
server never compiles images.

Responses:
- `201` `{"id", "title", "createdAt", "hasVideo"}` — `id` is 16 base64url chars
- `400` malformed multipart / missing or invalid target
- `413` a file or the body exceeds its cap
- `415` not multipart, or image/video of an unsupported real type
- `429` per-IP rate limit (burst 10, one token per 6 s)

## GET /api/artworks/:id

`200` same shape as the 201 body. `404` unknown id, `400` malformed id.
`Cache-Control: public, max-age=60`.

## GET /api/artworks/:id/target · /image · /video

The stored bytes. `Content-Type` is the sniffed type (`application/octet-stream`
for targets). Single-part `Range` requests are honoured (`206`, `416`) — iOS
Safari requires this to play video. `HEAD` supported.
`Cache-Control: public, max-age=31536000, immutable` — bytes never change for a
given id. `/video` is `404` when the artwork has none.

## Retention

Storage is bounded: beyond `MAX_ARTWORKS` (default 500) the oldest artworks are
deleted. Share links are durable within that budget, not forever.

## Frontend usage

- Share link shape: `<origin><path>?art=<id>` (`src/core/api.js` builds it).
- The viewer loads `imageTargetSrc` from `/artworks/:id/target` and the overlay
  video (when `hasVideo`) from `/artworks/:id/video`.
