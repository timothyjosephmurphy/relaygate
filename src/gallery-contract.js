// The consumer boundary is shared by Node exporters and browser integrations.
// It does not fetch URLs, verify Nostr signatures, or infer physical dimensions.
export const GALLERY_SCHEMA = 'relaygate/gallery/1';
export const MAX_GALLERY_BYTES = 8 * 1024 * 1024;
const fail = message => { throw new Error(message); };
const object = (v, name) => v && typeof v === 'object' && !Array.isArray(v) ? v : fail(`${name} must be an object`);
const text = (v, name, max = 4096) => v == null ? null : typeof v === 'string' && v.length <= max ? v : fail(`${name} must be text of at most ${max} characters`);
const positive = (v, name, max) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : fail(`${name} must be positive and at most ${max}`);

export function webUrl(value, name = 'URL') {
  text(value, name, 4096);
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) fail(`${name} must be an absolute HTTP(S) URL`);
  let url;
  try { url = new URL(value); } catch { fail(`${name} must be an absolute HTTP(S) URL`); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail(`${name} must be an HTTP(S) URL without credentials`);
  return url.href;
}

export function relativeFile(value) {
  if (typeof value !== 'string' || value.length > 240 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) || value.split('/').some(p => !p || p.startsWith('.'))) fail('Unsafe relative file path');
  return value;
}

export function validateGallery(input) {
  object(input, 'Gallery');
  if (input.schema !== GALLERY_SCHEMA) fail(`Unsupported gallery schema: expected ${GALLERY_SCHEMA}`);
  const artist = object(input.artist, 'Artist');
  const name = text(artist.name, 'Artist name', 300);
  if (!name?.trim()) fail('Artist name is required');
  if (!Array.isArray(input.works) || input.works.length > 3000) fail('Works must be an array of at most 3000 items');
  const ids = new Set();
  const works = input.works.map((value, index) => {
    const w = object(value, `Work ${index}`);
    if (typeof w.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(w.id) || ids.has(w.id)) fail(`Missing, invalid or duplicate work ID at ${index}`);
    ids.add(w.id);
    const title = text(w.title, 'Title', 1000);
    if (!title?.trim()) fail(`Work ${w.id} needs a title`);
    let sizeIn = null;
    if (w.sizeIn != null) {
      object(w.sizeIn, 'Physical size');
      sizeIn = { w: positive(w.sizeIn.w, 'Physical width in inches', 4000), h: positive(w.sizeIn.h, 'Physical height in inches', 4000) };
    }
    if (w.sha256 != null && !/^[a-f0-9]{64}$/.test(w.sha256)) fail('Invalid media SHA-256');
    const out = { id: w.id, title, image: w.image == null ? null : webUrl(w.image, 'Image'), page: w.page == null ? null : webUrl(w.page, 'Artwork page'), localImage: w.localImage == null ? null : relativeFile(w.localImage), sha256: w.sha256 ?? null, sizeIn };
    for (const key of ['titleSource', 'project', 'pixelSize', 'size', 'sizeSource', 'medium', 'description', 'source', 'alt', 'story', 'rights', 'license']) out[key] = text(w[key], key, ['story', 'description'].includes(key) ? 20000 : 4096);
    out.year = w.year == null ? null : text(String(w.year), 'Year', 50);
    out.availability = w.availability == null ? null : {
      status: text(object(w.availability, 'Availability').status, 'Availability status', 300),
      price: text(w.availability.price, 'Price as supplied by artist', 300),
      shopUrl: w.availability.shopUrl == null ? null : webUrl(w.availability.shopUrl, 'Shop URL'),
    };
    // Only an explicit artist review flag removes the candidate label.
    out.reviewed = w.reviewed === true;
    return out;
  });
  if (input.gates != null && (!Array.isArray(input.gates) || input.gates.length > 100)) fail('Gates must be an array of at most 100 items');
  const gates = (input.gates || []).map(gate => {
    object(gate, 'Gate');
    return { url: webUrl(gate.url, 'Gate URL'), label: text(gate.label, 'Gate label', 300) || 'Visit another gallery', identityStatus: 'unverified' };
  });
  if (input.warnings != null && (!Array.isArray(input.warnings) || input.warnings.length > 5000)) fail('Invalid warnings');
  return { schema: GALLERY_SCHEMA, generatedAt: text(input.generatedAt, 'Generated date', 100), artist: { name, siteUrl: artist.siteUrl == null ? null : webUrl(artist.siteUrl, 'Artist website') }, works, gates, warnings: (input.warnings || []).map(v => text(v, 'Warning')), identityStatus: 'unsigned' };
}

export function parseGallery(json) {
  if (typeof json !== 'string' || new TextEncoder().encode(json).length > MAX_GALLERY_BYTES) fail('Gallery exceeds the 8 MiB limit');
  return validateGallery(JSON.parse(json));
}
