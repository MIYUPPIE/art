// Buffered multipart/form-data parser (RFC 7578 subset). Pure: Buffer in,
// parts out. No streams, no deps — uploads are capped well below memory limits
// by the server before this runs, so buffering the whole body is safe and keeps
// the parser deterministic and unit-testable.

const CRLF = Buffer.from('\r\n');
const HEADER_END = Buffer.from('\r\n\r\n');

// Pull the boundary out of a Content-Type header value.
// Returns null when the header is not multipart/form-data or lacks a boundary.
export function boundaryFrom(contentType) {
  if (typeof contentType !== 'string') return null;
  const m = /^multipart\/form-data\s*;.*?boundary=(?:"([^"]+)"|([^\s;]+))/i.exec(contentType);
  return m ? (m[1] ?? m[2]) : null;
}

// Parse a complete multipart body. Returns [{ name, filename, contentType, data }].
// Throws on structural errors (missing/unterminated boundary) so the caller can
// respond 400 instead of silently accepting a truncated upload.
export function parseMultipart(body, boundary) {
  if (!Buffer.isBuffer(body)) throw new MultipartError('body must be a Buffer');
  if (!boundary) throw new MultipartError('missing boundary');

  const delim = Buffer.from(`\r\n--${boundary}`);
  // The first delimiter has no leading CRLF; prepend one so a single delimiter
  // pattern matches every boundary, including the first.
  const buf = Buffer.concat([CRLF, body]);

  let pos = buf.indexOf(delim);
  if (pos === -1) throw new MultipartError('opening boundary not found');
  pos += delim.length;

  const parts = [];
  for (;;) {
    if (buf.subarray(pos, pos + 2).toString('latin1') === '--') break; // closing delimiter

    const headerStart = buf.indexOf(CRLF, pos);
    if (headerStart === -1) throw new MultipartError('malformed boundary line');
    const headerEnd = buf.indexOf(HEADER_END, headerStart + 2);
    if (headerEnd === -1) throw new MultipartError('part headers not terminated');

    const headers = parseHeaders(buf.subarray(headerStart + 2, headerEnd).toString('latin1'));
    const bodyStart = headerEnd + HEADER_END.length;
    const next = buf.indexOf(delim, bodyStart);
    if (next === -1) throw new MultipartError('part not terminated by boundary');

    const disposition = headers['content-disposition'] || '';
    parts.push({
      name: dispositionParam(disposition, 'name'),
      filename: dispositionParam(disposition, 'filename'),
      contentType: headers['content-type'] || null,
      data: buf.subarray(bodyStart, next),
    });
    pos = next + delim.length;
  }
  return parts;
}

export class MultipartError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MultipartError';
  }
}

function parseHeaders(block) {
  const headers = {};
  for (const line of block.split('\r\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return headers;
}

// Extract a Content-Disposition parameter. Browsers percent-encode quotes and
// CR/LF inside filenames, so a quoted-string regex without escape handling is
// spec-adequate for form-data from real user agents.
function dispositionParam(value, param) {
  const m = new RegExp(`(?:^|;)\\s*${param}\\s*=\\s*(?:"([^"]*)"|([^\\s;]+))`, 'i').exec(value);
  return m ? (m[1] ?? m[2]) : null;
}
