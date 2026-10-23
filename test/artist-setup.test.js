import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { load } from 'cheerio';
import { TJ_IDENTITY, newArtistDraft, normalizeDraft, parseDraft, addManualImage, attachImageToWork, readiness, exportArtistGallery, saveCheckpoint, restoreCheckpoint, connectToTj, installationSnippet, previewHtml, setupUrl, storedZip } from '../src/artist-setup.js';

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64'));
const imported = () => ({ schema: 'relaygate/gallery/1', artist: { name: 'Ada Artist', siteUrl: 'https://artist.example/' }, works: [{ id: 'stable-1', title: 'IMG 1234', image: 'https://artist.example/a.jpg', pixelSize: '1000x2000', sizeIn: null, reviewed: true, titleSource: 'filename' }], gates: [] });
async function readyDraft() {
  const draft = await addManualImage(newArtistDraft(), png, 'blue-field.png');
  draft.artist = { name: 'Ada Artist', siteUrl: 'https://artist.example/' };
  Object.assign(draft.works[0], { reviewed: true, rightsConfirmed: true, rights: 'Image owned by the artist.', alt: 'Blue field with a pale horizon.' });
  return draft;
}

test('import candidates retain stable IDs, require fresh review, and never infer physical size from pixels', () => {
  const draft = normalizeDraft(imported());
  assert.equal(draft.works[0].id, 'stable-1'); assert.equal(draft.works[0].reviewed, false);
  assert.equal(draft.works[0].rightsConfirmed, false); assert.equal(draft.works[0].sizeIn, null);
  assert.match(readiness(draft).problems.join(' '), /review.*permission/);
  const broken = imported(); broken.works.push(broken.works[0]); assert.throws(() => normalizeDraft(broken), /duplicated/);
});

test('invalid URLs, schemas, media paths and physical dimensions fail without mutating the input', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,bad', 'file:///secret', 'https://user:pass@host.example', 'https://host.example/\nx']) assert.throws(() => setupUrl(value));
  const bad = newArtistDraft(); bad.schema = 'future/2'; assert.throws(() => normalizeDraft(bad), /version 1/);
  const input = imported(); input.works[0].sizeIn = { w: 0, h: 4 }; const before = JSON.stringify(input);
  assert.throws(() => normalizeDraft(input), /Physical/); assert.equal(JSON.stringify(input), before);
  const draft = normalizeDraft(imported()); draft.works[0].localImage = '../x'; assert.throws(() => normalizeDraft(draft), /content-addressed/);
  assert.throws(() => parseDraft('x'.repeat(60 * 1024 * 1024 + 1)), /60 MiB/);
});

test('local images are bounded, checked as raster files and added with content-stable IDs', async () => {
  const a = await addManualImage(newArtistDraft(), png, 'a.png'), b = await addManualImage(newArtistDraft(), png, 'renamed.png');
  assert.equal(a.works[0].id, b.works[0].id); assert.equal(a.works[0].localImage, b.works[0].localImage);
  await assert.rejects(addManualImage(a, png, 'copy.png'), /already/);
  await assert.rejects(addManualImage(newArtistDraft(), new TextEncoder().encode('<svg onload="bad()"/>'), 'image.svg'), /active formats/);
  await assert.rejects(addManualImage(newArtistDraft(), new Uint8Array(8 * 1024 * 1024 + 1), 'large.png'), /8 MiB/);
});

test('attaching a file to an imported work preserves its identity and resets image approval', async () => {
  const draft = normalizeDraft(imported()); draft.works[0].reviewed = true; draft.works[0].rightsConfirmed = true;
  const attached = await attachImageToWork(draft, 'stable-1', png, 'image.png');
  assert.equal(attached.works.length, 1); assert.equal(attached.works[0].id, 'stable-1');
  assert.equal(attached.works[0].reviewed, false); assert.equal(attached.works[0].rightsConfirmed, false);
  assert.match(attached.works[0].localImage, /^media\/[a-f0-9]{64}\.png$/);
});

test('export rejects unreviewed or unpermitted works and does not expose excluded candidates', async () => {
  await assert.rejects(exportArtistGallery(normalizeDraft(imported())), /review/);
  const draft = await readyDraft(); draft.works.push({ ...draft.works[0], id: 'private-candidate', title: 'Private excluded title', included: false, story: 'Unapproved recording transcript' });
  const result = await exportArtistGallery(draft);
  assert.equal(result.config.works.length, 1); assert.equal(result.missingMedia.length, 0);
  for (const [name, bytes] of result.files) if (!name.startsWith('media/')) assert.doesNotMatch(new TextDecoder().decode(bytes), /Private excluded title|Unapproved recording transcript/);
  const restored = parseDraft(new TextDecoder().decode(result.files.get('gallery-editor.json')));
  assert.equal(restored.works[0].id, draft.works[0].id); assert.equal(restored.works[0].rightsConfirmed, true);
  assert.equal(Object.keys(restored.media).length, 1); assert.equal(readiness(restored).ready, true);
});

test('tampered saved image bytes cannot enter an export under a trusted filename', async () => {
  const draft = await readyDraft(), asset = draft.media[draft.works[0].localImage];
  const changed = Uint8Array.from(png); changed[changed.length - 1] ^= 1; asset.base64 = Buffer.from(changed).toString('base64');
  await assert.rejects(exportArtistGallery(draft), /checksum/);
});

test('remote-only media and missing local import files have explicit recovery', async () => {
  const input = imported(); input.works[0].localImage = 'images/a.jpg';
  const draft = normalizeDraft(input); Object.assign(draft.works[0], { reviewed: true, rightsConfirmed: true });
  assert.equal(draft.works[0].localImage, null);
  const result = await exportArtistGallery(draft); assert.equal(result.missingMedia[0].reason, 'remote-only');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(result.files.get('media-inventory.json'))).missingMedia, result.missingMedia);
  assert.equal(result.config.works[0].sha256, null);
});

test('checkpoint restore retains earlier metadata and available media; history stays bounded', async () => {
  let draft = await readyDraft(), history = [];
  for (let i = 0; i < 7; i++) { ({ draft, history } = saveCheckpoint(draft, history)); draft.works[0].title = `Title ${i}`; }
  assert.equal(history.length, 5); assert.equal(Object.keys(history[0].media).length, 0);
  const restored = restoreCheckpoint(draft, history, 0);
  assert.notEqual(restored.works[0].title, draft.works[0].title); assert.equal(Object.keys(restored.media).length, 1);
  assert.throws(() => restoreCheckpoint(draft, history, 99), /available/);
});

test('trusted resolver must verify TJ key, exact coordinate, fresh result and signed HTTPS location', async () => {
  const now = 1792460000;
  const result = { status: 'verified', pubkey: TJ_IDENTITY.pubkey, eventId: 'a'.repeat(64), coordinate: `37440:${TJ_IDENTITY.pubkey}:main`, checkedAt: now, location: { url: 'https://tj-gallery.example/current/', assertion: 'artist-signed' } };
  const gate = await connectToTj(async request => { assert.equal(request.npub, TJ_IDENTITY.npub); return result; }, { now });
  assert.equal(gate.status, 'verified-key'); assert.equal(gate.reachability, 'not-checked');
  await assert.rejects(connectToTj(null), /not connected/);
  await assert.rejects(connectToTj(async () => ({ ...result, pubkey: 'b'.repeat(64) }), { now }), /did not verify/);
  await assert.rejects(connectToTj(async () => ({ ...result, checkedAt: now - 301 }), { now }), /stale/);
  await assert.rejects(connectToTj(async () => ({ ...result, checkedAt: now + 61 }), { now }), /stale/);
  await assert.rejects(connectToTj(async () => ({ ...result, status: 'withdrawn' }), { now }), /did not verify/);
  await assert.rejects(connectToTj(async () => ({ ...result, location: { ...result.location, url: 'javascript:alert(1)' } }), { now }), /HTTPS/);
  const draft = newArtistDraft(); draft.gate = gate;
  assert.equal(parseDraft(JSON.stringify(draft)).gate.status, 'unverified');
});

test('preview escapes hostile text, keeps accessible headings and does not execute imported content', () => {
  const draft = normalizeDraft(imported()); draft.artist.name = '<script>bad()</script>'; draft.works[0].title = '<img onerror="bad()">'; draft.works[0].story = '<iframe src="x"></iframe>';
  const $ = load(previewHtml(draft));
  assert.equal($('script, iframe, [onerror]').length, 0); assert.equal($('h1').text(), draft.artist.name); assert.equal($('article h2').text(), draft.works[0].title);
  assert.equal($('main').attr('tabindex'), '-1'); assert.equal($('.skip').attr('href'), '#works'); assert.match($('body').text(), /Unsigned/);
});

test('install snippets distinguish ordinary links from script-free embeds and reject injected URLs', () => {
  const snippet = installationSnippet('embed', 'https://artist.example/gallery/?a="hello"');
  const $ = load(snippet); assert.equal($('iframe').length, 1); assert.equal($('script').length, 0);
  assert.ok(!$('iframe').attr('sandbox').includes('allow-scripts')); assert.equal($('a').length, 1);
  assert.match(installationSnippet('managed', 'https://artist.example/'), /not provisioned/);
  assert.throws(() => installationSnippet('link', 'javascript:alert(1)'));
});

test('stored ZIP contains complete exported bytes and valid central directory offsets', async () => {
  const { files } = await exportArtistGallery(await readyDraft()), zip = storedZip(files), view = new DataView(zip.buffer);
  let cursor = 0; const names = [];
  while (view.getUint32(cursor, true) === 0x04034b50) {
    const size = view.getUint32(cursor + 18, true), nameSize = view.getUint16(cursor + 26, true), name = new TextDecoder().decode(zip.subarray(cursor + 30, cursor + 30 + nameSize));
    assert.deepEqual(zip.slice(cursor + 30 + nameSize, cursor + 30 + nameSize + size), files.get(name)); names.push(name); cursor += 30 + nameSize + size;
  }
  assert.deepEqual(names, [...files.keys()]); assert.equal(view.getUint32(cursor, true), 0x02014b50);
  const end = zip.length - 22; assert.equal(view.getUint32(end, true), 0x06054b50); assert.equal(view.getUint16(end + 10, true), files.size); assert.equal(view.getUint32(end + 16, true), cursor);
  assert.throws(() => storedZip(new Map([['../outside', new Uint8Array(1)]])), /Unexpected/);
});

test('single-file artist tool is reproducible, self-contained, labelled and syntactically valid', async () => {
  const [core, ui, shell, built] = await Promise.all(['src/artist-setup.js', 'src/artist-setup-ui.js', 'src/artist-setup-shell.html', 'tools/artist-setup.html'].map(file => readFile(file, 'utf8')));
  const script = core.replace(/^export /gm, '') + '\n' + ui;
  assert.equal(built, shell.replace('<!-- SETUP_SCRIPT -->', `<script>\n'use strict';\n(() => {\n${script}\n})();\n</script>`));
  const $ = load(built); assert.equal($('script[src], link[rel=stylesheet]').length, 0); assert.equal($('iframe').attr('sandbox'), '');
  new vm.Script($('script').text());
  for (const id of ['artist-name', 'site-url', 'open-draft', 'add-images', 'work-list', 'title', 'alt', 'gate-url', 'gallery-url', 'snippet']) assert.equal($(`label[for="${id}"]`).length, 1);
  assert.equal($('input[type=password]').length, 0); assert.equal($('#status').attr('aria-live'), 'polite');
});

// Control-logic unit harness only. It does not emulate layout, browser security,
// downloads, focus, accessibility APIs, or a real file/hosting installation.
async function setupControls(initialDraft) {
  const [core, ui, shell] = await Promise.all(['src/artist-setup.js', 'src/artist-setup-ui.js', 'src/artist-setup-shell.html'].map(file => readFile(file, 'utf8')));
  const $ = load(shell), controls = new Map();
  const node = () => ({ value: '', checked: false, files: [], listeners: {}, children: [],
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
    setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; }, click() {}
  });
  $('[id]').each((_index, el) => controls.set($(el).attr('id'), node()));
  const context = vm.createContext({ document: { getElementById: id => controls.get(id), createElement: node, body: node() }, window: { addEventListener() {} }, crypto, TextEncoder, TextDecoder, URL, Blob, Uint8Array, DataView, atob, btoa, structuredClone, setTimeout, initialDraft });
  vm.runInContext(core.replace(/^export /gm, '') + '\n' + ui + '\ndraft = normalizeDraft(initialDraft); render();', context);
  return { controls, state: () => JSON.parse(vm.runInContext('JSON.stringify(draft)', context)),
    async event(id, type) { const target = controls.get(id); for (const action of target.listeners[type] || []) await action({ target }); }
  };
}

test('form saves retain concurrent artist edits and unparsed imported size provenance', async () => {
  const data = imported(); data.works[0].size = '12 inches wide; height not supplied'; data.works[0].sizeSource = 'page-metadata';
  const h = await setupControls(data);
  h.controls.get('artist-name').value = 'Artist name correction';
  h.controls.get('title').value = 'Corrected title'; await h.event('title', 'input');
  h.controls.get('reviewed').checked = true; h.controls.get('rightsConfirmed').checked = true;
  await h.event('save-work', 'click');
  const saved = h.state();
  assert.equal(saved.artist.name, 'Artist name correction'); assert.equal(saved.works[0].title, 'Corrected title');
  assert.equal(saved.works[0].sizeIn, null); assert.equal(saved.works[0].size, data.works[0].size); assert.equal(saved.works[0].sizeSource, 'page-metadata');
  assert.equal(saved.works[0].reviewed, true);
});

test('editing metadata and replacing an image address require fresh reviews in the form', async () => {
  const h = await setupControls(await readyDraft());
  h.controls.get('title').value = 'Edited title'; await h.event('title', 'input');
  assert.equal(h.controls.get('reviewed').checked, false); assert.equal(h.controls.get('rightsConfirmed').checked, true);
  h.controls.get('reviewed').checked = true;
  h.controls.get('image-url').value = 'https://artist.example/replacement.png'; await h.event('image-url', 'input');
  assert.equal(h.controls.get('reviewed').checked, false); assert.equal(h.controls.get('rightsConfirmed').checked, false);
  await h.event('save-work', 'click');
  assert.equal(readiness(h.state()).ready, false);
});

test('manual image address additions keep increasing checkpoint revisions', async () => {
  const h = await setupControls(await readyDraft()), before = h.state().revision;
  h.controls.get('new-image-url').value = 'https://artist.example/second.png'; await h.event('add-url', 'click');
  assert.equal(h.state().works.length, 2); assert.ok(h.state().revision > before);
  assert.equal(h.controls.get('status').className, '');
});
