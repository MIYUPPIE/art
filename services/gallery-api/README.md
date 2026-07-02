# gallery-api

Stores scannable artworks — the artwork image, its compiled MindAR `.mind`
target, and an optional overlay video — and serves them back to any device via
share links. The heavy work (target compilation) happens in the uploader's
browser; this service only validates, stores, and streams bytes.

Zero npm dependencies. Wire contract: [`contracts/gallery-api.md`](../../contracts/gallery-api.md).

## Run

```bash
npm start                 # listens on :8787
```

Env config:

| var            | default   | meaning                                        |
|----------------|-----------|------------------------------------------------|
| `PORT`         | `8787`    | listen port                                    |
| `DATA_DIR`     | `./data`  | artwork storage root (one directory per id)    |
| `MAX_ARTWORKS` | `500`     | oldest artworks are evicted beyond this        |
| `TRUST_PROXY`  | unset     | `1` = rate-limit by `X-Forwarded-For` client   |

During frontend development you don't run this directly — `npm run serve` at
the repo root starts the static server **and** proxies `/api/*` here.

## Test

```bash
npm test
```

Gate tests only (deterministic, no network beyond loopback, < 1 s): multipart
parsing against real `FormData` encodings, magic-byte sniffing, atomic store +
eviction, token-bucket refill, and full HTTP round-trips including Range
requests (the iOS Safari video path) and oversized-upload rejection. There is
no eval suite: the service has no LLM component.

## Design notes

- **Buffered multipart, not streaming.** Bodies are capped at 80 MB before
  parsing, so buffering is safe and keeps the parser a pure, unit-testable
  function (`lib/multipart.mjs`).
- **Atomic writes.** Uploads land in `data/.tmp/<id>` and are renamed into
  place; a crash never leaves a half-readable artwork.
- **Ids are capability URLs.** 96 bits of randomness, validated by one shared
  pattern before any filesystem path is built.
- **Range support is not optional.** iOS Safari refuses to play media from
  servers that ignore byte ranges.
