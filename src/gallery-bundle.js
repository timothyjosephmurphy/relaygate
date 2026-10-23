import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MAX_GALLERY_BYTES, parseGallery, relativeFile, validateGallery } from './gallery-contract.js';
import { renderGallery } from './static-gallery.js';

const MAX_FILE = 25 * 1024 * 1024;
const MAX_BUNDLE = 256 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

async function readRegular(root, relative, limit = MAX_FILE) {
  relativeFile(relative);
  let current = path.resolve(root);
  const rootStat = await lstat(current);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Bundle root must be a directory, not a symlink');
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink refused: ${relative}`);
  }
  const file = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error(`File is not regular or is too large: ${relative}`);
    const bytes = await file.readFile();
    if (bytes.length > limit) throw new Error(`File grew beyond limit: ${relative}`);
    return bytes;
  } finally { await file.close(); }
}

function addFile(files, name, bytes) {
  relativeFile(name);
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length > MAX_FILE) throw new Error(`File too large: ${name}`);
  files.set(name, bytes);
  if ([...files.values()].reduce((n, b) => n + b.length, 0) > MAX_BUNDLE) throw new Error('Bundle exceeds 256 MiB limit');
}

// Raster extensions only. Imported SVG/HTML must never become executable pages.
function mediaExtension(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) throw new Error('Only raster image files may be bundled');
  return ext === 'jpeg' ? 'jpg' : ext;
}

function checkRaster(bytes, ext) {
  const hex = bytes.subarray(0, 12).toString('hex');
  const valid = ext === 'png' ? hex.startsWith('89504e470d0a1a0a')
    : ext === 'jpg' ? hex.startsWith('ffd8ff')
    : ext === 'gif' ? /^GIF8[79]a/.test(bytes.subarray(0, 6).toString('ascii'))
    : ext === 'webp' ? bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
    : ext === 'avif' ? bytes.subarray(4, 8).toString() === 'ftyp' && ['avif', 'avis'].includes(bytes.subarray(8, 12).toString()) : false;
  if (!valid) throw new Error('Media does not match its raster file type');
}

function eventRecord(bytes, name) {
  const event = JSON.parse(bytes.toString('utf8'));
  if (!event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).some(k => !['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig'].includes(k)) || !/^[a-f0-9]{64}$/.test(event.id) || !/^[a-f0-9]{64}$/.test(event.pubkey) || !/^[a-f0-9]{128}$/.test(event.sig) || !Number.isSafeInteger(event.created_at) || event.created_at < 0 || !Number.isSafeInteger(event.kind) || event.kind < 0 || event.kind > 65535 || typeof event.content !== 'string' || !Array.isArray(event.tags) || event.tags.length > 2000 || event.tags.some(tag => !Array.isArray(tag) || tag.length > 100 || tag.some(v => typeof v !== 'string'))) throw new Error(`Invalid public event envelope: ${name}`);
  const d = event.tags.find(tag => tag[0] === 'd')?.[1];
  return { file: `events/${event.id}.json`, id: event.id, coordinate: event.kind >= 30000 && event.kind < 40000 && d != null ? `${event.kind}:${event.pubkey}:${d}` : null, verification: 'not-verified' };
}

export async function createBundle(input, { sourceDir, eventFiles = [] } = {}) {
  const gallery = validateGallery(input), files = new Map(), missingMedia = [], events = [];
  if (!sourceDir) throw new Error('sourceDir is required');
  if (!Array.isArray(eventFiles) || eventFiles.length > 1000) throw new Error('Too many event files');
  for (const work of gallery.works) {
    if (!work.localImage) { missingMedia.push({ workId: work.id, url: work.image, reason: work.image ? 'remote-only' : 'no-image' }); continue; }
    let bytes;
    try { bytes = await readRegular(sourceDir, work.localImage); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missingMedia.push({ workId: work.id, url: work.image, reason: 'local-file-missing' });
      work.localImage = null;
      continue;
    }
    const hash = digest(bytes);
    if (work.sha256 && work.sha256 !== hash) throw new Error(`Media checksum mismatch: ${work.id}`);
    const ext = mediaExtension(work.localImage);
    checkRaster(bytes, ext);
    const name = `media/${hash}.${ext}`;
    addFile(files, name, bytes);
    work.localImage = name; work.sha256 = hash;
  }
  for (const name of eventFiles) {
    const bytes = await readRegular(sourceDir, name, MAX_GALLERY_BYTES);
    // Archive only the exact public event envelope; signatures are not certified here.
    const record = eventRecord(bytes, name), file = record.file;
    if (files.has(file) && !files.get(file).equals(bytes)) throw new Error(`Conflicting exact event archive: ${record.id}`);
    addFile(files, file, bytes);
    if (!events.some(e => e.id === record.id)) events.push(record);
  }
  addFile(files, 'gallery.json', json(gallery));
  addFile(files, 'index.html', Buffer.from(renderGallery(gallery)));
  const manifest = { schema: 'relaygate/backup/1', identityStatus: 'unsigned', eventVerification: 'not-verified', missingMedia, events, files: [...files].map(([file, bytes]) => ({ file, bytes: bytes.length, sha256: digest(bytes) })) };
  addFile(files, 'manifest.json', json(manifest));
  return { files, manifest, gallery };
}

async function writeNewDirectory(files, destination) {
  const target = path.resolve(destination);
  // Reserve the name first. Existing directories are never overwritten.
  await mkdir(target);
  const staging = path.join(path.dirname(target), `.relaygate-${randomUUID()}`);
  try {
    await mkdir(staging);
    for (const [name, bytes] of files) {
      relativeFile(name);
      await mkdir(path.dirname(path.join(staging, name)), { recursive: true });
      await writeFile(path.join(staging, name), bytes, { flag: 'wx' });
    }
    // Renaming over our empty reserved directory is atomic on supported local FS.
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    // Only remove the empty directory reserved above, never someone else's files.
    const { rmdir } = await import('node:fs/promises');
    await rmdir(target).catch(() => {});
    throw error;
  }
}

export async function exportGallery(galleryFile, destination, options = {}) {
  const sourceDir = path.dirname(path.resolve(galleryFile));
  const bytes = await readRegular(sourceDir, path.basename(galleryFile), MAX_GALLERY_BYTES);
  const bundle = await createBundle(parseGallery(bytes.toString('utf8')), { ...options, sourceDir });
  await writeNewDirectory(bundle.files, destination);
  return bundle.manifest;
}

export async function verifyBundle(sourceDir) {
  const manifestBytes = await readRegular(sourceDir, 'manifest.json', MAX_GALLERY_BYTES);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema !== 'relaygate/backup/1' || !Array.isArray(manifest.files) || manifest.files.length < 2 || manifest.files.length > 5000) throw new Error('Unsupported or invalid backup manifest');
  const files = new Map(), events = [];
  for (const entry of manifest.files) {
    if (!entry || files.has(entry.file) || entry.file === 'manifest.json') throw new Error('Duplicate or reserved backup file');
    relativeFile(entry.file);
    if (!['gallery.json', 'index.html'].includes(entry.file) && !/^media\/[a-f0-9]{64}\.(jpg|png|webp|gif|avif)$/.test(entry.file) && !/^events\/[a-f0-9]{64}\.json$/.test(entry.file)) throw new Error('Unexpected backup file');
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > MAX_FILE || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid backup checksum or size');
    const bytes = await readRegular(sourceDir, entry.file);
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error(`Backup checksum mismatch: ${entry.file}`);
    if (entry.file.startsWith('media/')) {
      checkRaster(bytes, mediaExtension(entry.file));
      if (!entry.file.includes(digest(bytes))) throw new Error('Media filename does not match its content hash');
    }
    if (entry.file.startsWith('events/')) {
      const record = eventRecord(bytes, entry.file);
      if (record.file !== entry.file) throw new Error('Event filename does not match its ID');
      events.push(record);
    }
    addFile(files, entry.file, bytes);
  }
  if (!files.has('gallery.json') || !files.has('index.html')) throw new Error('Backup must contain gallery.json and index.html');
  const gallery = parseGallery(files.get('gallery.json').toString('utf8'));
  for (const work of gallery.works) {
    if (work.localImage && (!files.has(work.localImage) || work.sha256 !== digest(files.get(work.localImage)))) throw new Error(`Gallery references missing or changed media: ${work.id}`);
  }
  // A checksum is not authentication. Re-render HTML rather than trusting an
  // imported page whose attacker could also have replaced the manifest hash.
  addFile(files, 'index.html', Buffer.from(renderGallery(gallery)));
  const restoredManifest = { schema: 'relaygate/backup/1', identityStatus: 'unsigned', eventVerification: 'not-verified', events, missingMedia: gallery.works.filter(w => !w.localImage).map(w => ({ workId: w.id, url: w.image, reason: w.image ? 'remote-only' : 'no-image' })), files: [...files].map(([file, bytes]) => ({ file, bytes: bytes.length, sha256: digest(bytes) })) };
  addFile(files, 'manifest.json', json(restoredManifest));
  return { files, manifest: restoredManifest, gallery };
}

export async function restoreBundle(sourceDir, destination) {
  const bundle = await verifyBundle(sourceDir);
  await writeNewDirectory(bundle.files, destination);
  return bundle.manifest;
}
