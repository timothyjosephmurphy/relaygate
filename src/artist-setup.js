// Browser-compatible setup state. No network, signer, server or UI dependency.
export const SETUP_SCHEMA = 'relaygate/artist-draft/1';
export const TJ_IDENTITY = Object.freeze({ name: 'TJ Murphy', npub: 'npub10m0uf224v7tly6k6h8gl6kkmuhmx7969gmudmmhqj5pv65e03r9sxsumee', pubkey: '7edfc4a9556797f26adab9d1fd5adbe5f66f174546f8ddeee09502cd532f88cb', nip05: 'tj@tjm.art' });
export const SETUP_LIMITS = Object.freeze({ works: 500, imageBytes: 8 * 1024 * 1024, mediaBytes: 40 * 1024 * 1024, draftBytes: 60 * 1024 * 1024 });
const enc = new TextEncoder();
const fail = message => { throw new Error(message); };
const text = (value, name, max = 4000) => value == null ? '' : typeof value === 'string' && value.length <= max ? value : fail(`${name} must be text, up to ${max} characters.`);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = bytes => crypto.subtle.digest('SHA-256', bytes).then(hex);
const base64Size = value => typeof value !== 'string' || value.length % 4 || /[^A-Za-z0-9+/]/.test(value.replace(/={1,2}$/, '')) ? null : value.length * 3 / 4 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);

export function setupUrl(value, { optional = true, https = false } = {}) {
  if ((value == null || value === '') && optional) return null;
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value)) fail('Use a complete website address, such as https://artist.example/gallery/.');
  let url; try { url = new URL(value); } catch { fail('Use a complete HTTP(S) website address.'); }
  if (!(https ? ['https:'] : ['https:', 'http:']).includes(url.protocol) || url.username || url.password) fail(https ? 'Use an HTTPS address without a username or password.' : 'Use an HTTP(S) address without a username or password.');
  return url.href;
}

export function newArtistDraft() {
  return { schema: SETUP_SCHEMA, artist: { name: '', siteUrl: null }, works: [], media: {}, gate: null, installation: { method: 'folder', galleryUrl: null }, revision: 0 };
}

function normalizeWork(value, index, imported = false) {
  if (!value || typeof value !== 'object') fail(`Artwork ${index + 1} is not a record.`);
  const id = text(value.id, 'Artwork ID', 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) fail(`Artwork ${index + 1} needs a stable ID.`);
  let sizeIn = null;
  if (value.sizeIn != null) {
    if (!['w', 'h'].every(k => Number.isFinite(value.sizeIn[k]) && value.sizeIn[k] > 0 && value.sizeIn[k] <= 4000)) fail('Physical width and height must be positive numbers in inches.');
    sizeIn = { w: value.sizeIn.w, h: value.sizeIn.h };
  }
  const localImage = value.localImage == null ? null : text(value.localImage, 'Media filename', 100);
  if (localImage && !/^media\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(localImage)) {
    // Importer downloads use another directory. Retain the remote source and
    // ask for image files instead of assuming a local path exists in a browser.
    if (!imported) fail('Local images must be content-addressed media files.');
  }
  return { id, title: text(value.title, 'Title', 500) || 'Untitled candidate', image: setupUrl(value.image), page: setupUrl(value.page), localImage: /^media\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(localImage || '') ? localImage : null, sha256: /^[a-f0-9]{64}$/.test(value.sha256) ? value.sha256 : null, titleSource: text(value.titleSource, 'Title source', 100), source: text(value.source, 'Source', 200), size: text(value.size, 'Size text', 300), sizeIn, sizeSource: text(value.sizeSource, 'Size source', 100), medium: text(value.medium, 'Medium', 300), year: value.year == null ? '' : text(String(value.year), 'Year', 50), alt: text(value.alt, 'Image description', 2000), description: text(value.description, 'Description', 10000), story: text(value.story, 'Artist story', 20000), rights: text(value.rights, 'Image permission note', 2000), included: value.included !== false, reviewed: !imported && value.reviewed === true, rightsConfirmed: !imported && value.rightsConfirmed === true };
}

export function normalizeDraft(value, { imported = false } = {}) {
  if (!value || ![SETUP_SCHEMA, 'relaygate/gallery/1'].includes(value.schema)) fail('Choose a Relay Gate draft or version 1 gallery JSON file.');
  if (!Array.isArray(value.works) || value.works.length > SETUP_LIMITS.works) fail(`This editor supports up to ${SETUP_LIMITS.works} candidates. Split a larger collection first.`);
  const isImport = imported || value.schema === 'relaygate/gallery/1';
  const works = value.works.map((work, i) => normalizeWork(work, i, isImport));
  if (new Set(works.map(w => w.id)).size !== works.length) fail('Artwork IDs are duplicated. No records were replaced.');
  const media = {};
  if (!isImport && value.media != null) {
    if (typeof value.media !== 'object' || Array.isArray(value.media) || Object.keys(value.media).length > SETUP_LIMITS.works) fail('Invalid media collection.');
    let total = 0;
    for (const [name, asset] of Object.entries(value.media)) {
      if (!/^media\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(name) || !asset || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(asset.mime) || base64Size(asset.base64) == null) fail('Invalid or unsupported saved image.');
      const estimated = base64Size(asset.base64);
      if (estimated > SETUP_LIMITS.imageBytes || (total += estimated) > SETUP_LIMITS.mediaBytes) fail('Saved images exceed the editor size limit.');
      media[name] = { mime: asset.mime, base64: asset.base64, originalName: text(asset.originalName, 'Original filename', 300) };
    }
  }
  // A saved file can never restore a claim that a network identity was verified.
  let gate = null;
  const savedGate = value.gate || (isImport ? value.gates?.[0] : null);
  if (savedGate?.url) gate = { url: setupUrl(savedGate.url, { optional: false, https: true }), label: text(savedGate.label, 'Gate label', 300) || 'Visit another gallery', status: 'unverified', target: savedGate.target === `37440:${TJ_IDENTITY.pubkey}:main` ? savedGate.target : null };
  return { schema: SETUP_SCHEMA, artist: { name: text(value.artist?.name, 'Artist name', 300), siteUrl: setupUrl(value.artist?.siteUrl) }, works, media, gate, installation: { method: ['folder', 'embed', 'link', 'managed'].includes(value.installation?.method) ? value.installation.method : 'folder', galleryUrl: setupUrl(value.installation?.galleryUrl, { https: true }) }, revision: Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0 };
}

export function parseDraft(json) {
  if (typeof json !== 'string' || enc.encode(json).length > SETUP_LIMITS.draftBytes) fail('Draft exceeds 60 MiB. Use a smaller collection.');
  return normalizeDraft(JSON.parse(json));
}

export function saveCheckpoint(draft, history = []) {
  const checked = normalizeDraft(draft), snapshot = structuredClone(checked);
  checked.revision += 1;
  // Keep metadata snapshots only; media bytes are shared in the current draft.
  snapshot.media = {};
  return { draft: checked, history: [...history, snapshot].slice(-5) };
}

export function restoreCheckpoint(draft, history, index) {
  if (!Number.isInteger(index) || index < 0 || index >= history.length) fail('Choose an available prior version.');
  return normalizeDraft({ ...history[index], media: draft.media, revision: draft.revision + 1 });
}

function rasterType(bytes) {
  const prefix = hex(bytes.subarray(0, 12));
  if (prefix.startsWith('89504e470d0a1a0a')) return ['image/png', 'png'];
  if (prefix.startsWith('ffd8ff')) return ['image/jpeg', 'jpg'];
  if (prefix.startsWith('474946383761') || prefix.startsWith('474946383961')) return ['image/gif', 'gif'];
  if (prefix.startsWith('52494646') && prefix.slice(16) === '57454250') return ['image/webp', 'webp'];
  fail('Choose a PNG, JPEG, GIF or WebP image. SVG and other active formats are not accepted.');
}

export async function addManualImage(draft, bytes, filename) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > SETUP_LIMITS.imageBytes) fail('Each image must be no larger than 8 MiB.');
  const next = normalizeDraft(draft), [mime, ext] = rasterType(bytes), sha256 = await digest(bytes), id = `work-${sha256.slice(0, 24)}`, localImage = `media/${sha256}.${ext}`;
  if (next.works.some(w => w.id === id || w.localImage === localImage)) fail('This image is already in the draft.');
  if (next.works.length >= SETUP_LIMITS.works) fail('The draft already has 500 candidates.');
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  next.media[localImage] = { mime, base64: btoa(binary), originalName: text(filename, 'Filename', 300) };
  next.works.push(normalizeWork({ id, title: filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), localImage, sha256, source: 'manual-file', titleSource: 'filename', included: true }, next.works.length));
  return normalizeDraft(next);
}

export async function attachImageToWork(draft, workId, bytes, filename) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > SETUP_LIMITS.imageBytes) fail('Each image must be no larger than 8 MiB.');
  const next = normalizeDraft(draft), work = next.works.find(w => w.id === workId);
  if (!work) fail('Select an artwork before attaching an image.');
  const [mime, ext] = rasterType(bytes), sha256 = await digest(bytes), localImage = `media/${sha256}.${ext}`;
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  next.media[localImage] = { mime, base64: btoa(binary), originalName: text(filename, 'Filename', 300) };
  Object.assign(work, { localImage, sha256, source: 'artist-attached-file', reviewed: false, rightsConfirmed: false });
  return normalizeDraft(next);
}

export function readiness(draft) {
  const checked = normalizeDraft(draft), included = checked.works.filter(w => w.included), problems = [];
  if (!checked.artist.name.trim()) problems.push('Add the artist name.');
  if (!included.length) problems.push('Include at least one artwork.');
  for (const work of included) {
    if (!work.reviewed) problems.push(`${work.title}: review the title, size and image description.`);
    if (!work.rightsConfirmed) problems.push(`${work.title}: confirm permission to publish this image.`);
    if (!work.image && !checked.media[work.localImage]) problems.push(`${work.title}: add its image file or a public image address.`);
  }
  return { ready: problems.length === 0, included: included.length, problems };
}

// This callback is trusted application code supplied by the Nostr integration,
// not a flag accepted from a draft file or a user-pasted JSON response.
export async function connectToTj(resolveSignedGallery, { now = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof resolveSignedGallery !== 'function') fail('Signed-gallery lookup is not connected in this local editor. You can keep working and add an explicitly unverified web link.');
  const result = await resolveSignedGallery({ ...TJ_IDENTITY, identifier: 'main' });
  if (result?.status !== 'verified' || result.pubkey !== TJ_IDENTITY.pubkey || !/^[a-f0-9]{64}$/.test(result.eventId || '') || result.coordinate !== `37440:${TJ_IDENTITY.pubkey}:main` || result.location?.assertion !== 'artist-signed') fail('The resolver did not verify a gallery location under TJ’s supplied public key. No connection was changed.');
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(result.checkedAt) || result.checkedAt > now + 60 || now - result.checkedAt > 300) fail('The lookup result is stale. Refresh it before connecting.');
  return { url: setupUrl(result.location.url, { optional: false, https: true }), label: 'Visit TJ Murphy’s gallery', status: 'verified-key', target: result.coordinate, eventId: result.eventId, checkedAt: result.checkedAt, reachability: 'not-checked' };
}

export function installationSnippet(method, url) {
  const address = escapeHtml(setupUrl(url, { optional: false, https: true }));
  const link = `<a href="${address}">Visit my gallery</a>`;
  if (method === 'link') return link;
  if (method === 'embed') return `<iframe src="${address}" title="Artwork gallery" width="100%" height="700" loading="lazy" sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" style="border:0"></iframe>\n<p>${link}</p>`;
  if (method === 'folder') return `Upload every file from the gallery ZIP into the same new folder. Then add this link to your website:\n${link}`;
  if (method === 'managed') return 'Managed hosting is not provisioned by this editor. Agree ownership, price, export and cancellation terms before choosing a provider. Keep a copy of the complete gallery ZIP.';
  fail('Choose a supported installation method.');
}

export function previewHtml(draft, { embeddedMedia = true } = {}) {
  const checked = normalizeDraft(draft), link = (url, label) => url ? `<a href="${escapeHtml(url)}" target="_top" rel="noreferrer">${escapeHtml(label)}</a>` : '';
  const cards = checked.works.filter(w => w.included).map(work => {
    const asset = checked.media[work.localImage];
    const image = asset ? embeddedMedia ? `data:${asset.mime};base64,${asset.base64}` : work.localImage : work.image;
    return `<article id="${work.id}"><h2>${escapeHtml(work.title)}</h2>${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(work.alt || work.title)}" loading="lazy" referrerpolicy="no-referrer">` : '<p>Image not yet added.</p>'}<p>${escapeHtml([work.year, work.medium].filter(Boolean).join(' · '))}</p><p>${escapeHtml(work.sizeIn ? `${work.sizeIn.w} × ${work.sizeIn.h} inches (width × height)` : work.size || 'Physical size unknown')}</p>${work.description ? `<p>${escapeHtml(work.description)}</p>` : ''}${work.story ? `<h3>Artist story</h3><p class="story">${escapeHtml(work.story)}</p>` : ''}<p>${escapeHtml(work.rights || 'Contact the artist before reusing images.')}</p>${link(work.page, 'Artwork source')}<p>${work.reviewed ? 'Artist-reviewed metadata' : 'Candidate: review required'}</p></article>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: https: http:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(checked.artist.name || 'Artwork gallery')}</title><style>body{font:18px/1.55 system-ui,sans-serif;color:#242825;background:#faf9f4;max-width:70rem;margin:auto;padding:1.4rem}a{color:#174975}a:focus-visible{outline:3px solid #874500;outline-offset:4px}h1,h2{line-height:1.2}.skip{position:absolute;left:-10000px}.skip:focus{position:static}.works{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:1rem}article{border:1px solid #b6bab4;padding:1rem}img{width:100%;height:17rem;object-fit:contain}p{overflow-wrap:anywhere}.story{white-space:pre-wrap}footer{border-top:1px solid;padding-top:1rem;margin-top:2rem}</style></head><body><a class="skip" href="#works">Skip to artworks</a><header><h1>${escapeHtml(checked.artist.name || 'Artwork gallery')}</h1><p>Unsigned web gallery. No Nostr account or wallet is needed to visit.</p>${link(checked.artist.siteUrl, 'Visit or contact the artist')}</header><main id="works" tabindex="-1"><div class="works">${cards || '<p>No artworks included.</p>'}</div>${checked.gate ? `<nav aria-label="Other galleries"><h2>Another gallery</h2>${link(checked.gate.url, checked.gate.label)}<p>Web link; verify the destination before visiting. A reciprocal gate requires the other artist’s agreement.</p></nav>` : ''}</main><footer><p>Artwork information and this gallery can be moved to another host.</p>${link('gallery.json', 'Gallery metadata')}</footer></body></html>`;
}

export async function exportArtistGallery(draft) {
  const checked = normalizeDraft(draft), result = readiness(checked);
  if (!result.ready) fail(result.problems.join('\n'));
  const works = checked.works.filter(w => w.included), media = {}, files = new Map();
  for (const work of works) {
    const asset = checked.media[work.localImage];
    if (!asset) { work.localImage = null; work.sha256 = null; continue; }
    const bytes = Uint8Array.from(atob(asset.base64), c => c.charCodeAt(0)), [, ext] = rasterType(bytes), sha256 = await digest(bytes);
    if (work.localImage !== `media/${sha256}.${ext}` || work.sha256 && work.sha256 !== sha256) fail(`${work.title}: the saved image checksum does not match.`);
    work.sha256 = sha256; media[work.localImage] = asset; files.set(work.localImage, bytes);
  }
  const publicDraft = { ...checked, works, media, revision: 0 };
  const config = { schema: 'relaygate/gallery/1', artist: checked.artist, works: works.map(({ included, rightsConfirmed, ...work }) => ({ ...work, titleSource: 'artist-review', sizeSource: work.sizeIn ? 'artist-reviewed' : work.sizeSource || null })), gates: checked.gate ? [{ url: checked.gate.url, label: checked.gate.label }] : [], warnings: ['Unsigned web gallery. A signed network gallery requires external-signer onboarding.'] };
  const missingMedia = works.filter(w => !w.localImage).map(w => ({ workId: w.id, url: w.image, reason: 'remote-only' }));
  files.set('index.html', enc.encode(previewHtml(publicDraft, { embeddedMedia: false })));
  files.set('gallery.json', enc.encode(JSON.stringify(config, null, 2) + '\n'));
  files.set('gallery-editor.json', enc.encode(JSON.stringify(publicDraft) + '\n'));
  files.set('media-inventory.json', enc.encode(JSON.stringify({ schema: 'relaygate/media-inventory/1', bundled: works.filter(w => w.localImage).map(w => ({ workId: w.id, path: w.localImage, sha256: w.sha256 })), missingMedia }, null, 2) + '\n'));
  files.set('RESTORE.txt', enc.encode('Keep this entire folder. To edit, open the Relay Gate artist setup tool and choose Open draft or gallery, then select gallery-editor.json. Only included, reviewed works and their permitted media are in this export. Keep the separate private draft if you need excluded candidates. Upload all files into a NEW folder on your own host; add a link or supported iframe. To roll back, restore the old website link or folder. Remote images are not included and can disappear. This is an unsigned 2D gallery; no deployment, signer or payment service is included.\n'));
  return { files, config, missingMedia };
}

// Small ZIP writer using the standard stored method: no compression or readers.
// Files are controlled export names; CRC and central directory enable ordinary unzip.
export function storedZip(files) {
  const chunks = [], central = []; let offset = 0;
  const crc32 = data => { let crc = 0xffffffff; for (const b of data) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
  const header = size => { const bytes = new Uint8Array(size); return [bytes, new DataView(bytes.buffer)]; };
  if (!(files instanceof Map) || files.size > 1000) fail('Too many export files.');
  for (const [name, value] of files) {
    if (!/^(media\/[a-f0-9]{64}\.(png|jpg|webp|gif)|index\.html|gallery\.json|gallery-editor\.json|media-inventory\.json|RESTORE\.txt)$/.test(name)) fail('Unexpected export filename.');
    const data = value instanceof Uint8Array ? value : enc.encode(value), filename = enc.encode(name), crc = crc32(data);
    const [local, l] = header(30 + filename.length); l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, filename.length, true); local.set(filename, 30);
    const [entry, c] = header(46 + filename.length); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, filename.length, true); c.setUint32(42, offset, true); entry.set(filename, 46);
    chunks.push(local, data); central.push(entry); offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0), [end, e] = header(22);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.size, true); e.setUint16(10, files.size, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  const all = [...chunks, ...central, end], output = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
  for (const bytes of all) { output.set(bytes, cursor); cursor += bytes.length; }
  return output;
}
