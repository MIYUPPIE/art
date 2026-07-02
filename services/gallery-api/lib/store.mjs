// Filesystem-backed artwork store. One directory per artwork:
//
//   <dataDir>/<id>/meta.json      { id, title, createdAt, files: {...} }
//   <dataDir>/<id>/target.mind
//   <dataDir>/<id>/image.<ext>
//   <dataDir>/<id>/video.<ext>    (optional)
//
// Writes are atomic: everything lands in <dataDir>/.tmp/<id> first and the
// directory is renamed into place, so a crash mid-upload never leaves a
// half-readable artwork. Ids come from crypto randomness and are validated by
// the shared ID_PATTERN before any path is built, so ids can't traverse paths.

import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { validId, EXT_FOR } from './validate.mjs';

export class ArtworkStore {
  constructor(dataDir, { maxArtworks = 500 } = {}) {
    this.dataDir = dataDir;
    this.tmpDir = path.join(dataDir, '.tmp');
    this.maxArtworks = maxArtworks;
  }

  async init() {
    await mkdir(this.tmpDir, { recursive: true });
    // Leftover temp dirs are aborted uploads from a previous run; discard them.
    await rm(this.tmpDir, { recursive: true, force: true });
    await mkdir(this.tmpDir, { recursive: true });
  }

  newId() {
    return randomBytes(12).toString('base64url').slice(0, 16);
  }

  dirFor(id) {
    if (!validId(id)) throw new StoreError('invalid id', 400);
    return path.join(this.dataDir, id);
  }

  // files: { target: Buffer, image: { data, type }, video?: { data, type } }
  async create({ title = '', target, image, video = null }) {
    const id = this.newId();
    const createdAt = new Date().toISOString();

    const files = { target: 'target.mind', image: `image.${EXT_FOR[image.type]}` };
    if (video) files.video = `video.${EXT_FOR[video.type]}`;

    const meta = {
      id,
      title,
      createdAt,
      files,
      types: { image: image.type, ...(video ? { video: video.type } : {}) },
    };

    const tmp = path.join(this.tmpDir, id);
    await mkdir(tmp, { recursive: true });
    await writeFile(path.join(tmp, files.target), target);
    await writeFile(path.join(tmp, files.image), image.data);
    if (video) await writeFile(path.join(tmp, files.video), video.data);
    await writeFile(path.join(tmp, 'meta.json'), JSON.stringify(meta, null, 2));
    await rename(tmp, this.dirFor(id));

    await this.evictOverCap();
    return meta;
  }

  async get(id) {
    const dir = this.dirFor(id);
    let raw;
    try {
      raw = await readFile(path.join(dir, 'meta.json'), 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') throw new StoreError('artwork not found', 404);
      throw e;
    }
    return JSON.parse(raw);
  }

  // Resolve a stored file for streaming: absolute path + size + MIME type.
  async filePath(id, kind) {
    const meta = await this.get(id);
    const name = meta.files[kind];
    if (!name) throw new StoreError(`no ${kind} for this artwork`, 404);
    const abs = path.join(this.dirFor(id), name);
    const s = await stat(abs);
    const type = kind === 'target' ? 'application/octet-stream' : meta.types[kind];
    return { path: abs, size: s.size, type };
  }

  async list() {
    const entries = await readdir(this.dataDir, { withFileTypes: true });
    const ids = entries.filter((e) => e.isDirectory() && validId(e.name)).map((e) => e.name);
    const metas = [];
    for (const id of ids) {
      try {
        metas.push(await this.get(id));
      } catch {
        // Unreadable entry (interrupted delete): skip, don't take the API down.
      }
    }
    return metas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async remove(id) {
    await rm(this.dirFor(id), { recursive: true, force: true });
  }

  // Disk is bounded: beyond maxArtworks, the oldest artworks are dropped.
  async evictOverCap() {
    const metas = await this.list();
    const excess = metas.length - this.maxArtworks;
    for (let i = 0; i < excess; i++) await this.remove(metas[i].id);
  }
}

export class StoreError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'StoreError';
    this.status = status;
  }
}
