import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { load } from 'cheerio';
import { parseGallery, relativeFile, validateGallery, webUrl } from '../src/gallery-contract.js';
import { toEnginePaintings } from '../src/engine-adapter.js';
import { renderGallery } from '../src/static-gallery.js';
import { createBundle, exportGallery, restoreBundle, verifyBundle } from '../src/gallery-bundle.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sample = () => ({ schema: 'relaygate/gallery/1', artist: { name: 'Ada Artist', siteUrl: 'https://artist.example/' }, works: [{ id: 'blue-field', title: 'Blue Field', image: 'https://artist.example/blue.png', page: 'https://artist.example/blue', sizeIn: null, pixelSize: '2000x1000', story: 'Painted beside the sea.', rights: 'Artist retains copyright.' }], gates: [{ url: 'https://other.example/gallery/' }] });
const slot = () => ({ x: 2, y: 1.5, z: -4, ix: 0, iz: 1, fy: 0, room: 'main', maxWidth: 3, maxHeight: 2 });
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'relaygate-kit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); await mkdir(source);
  const gallery = sample();
  return { root, source, gallery };
}

test('consumer retains IDs, physical unknowns, attribution, and price without claiming verification', () => {
  const input = sample(); input.works[0].availability = { price: '500 USD', status: 'InStock', shopUrl: 'https://artist.example/shop' };
  input.identityStatus = 'verified'; input.gates[0].identityStatus = 'verified';
  const value = validateGallery(input);
  assert.equal(value.works[0].id, 'blue-field'); assert.equal(value.works[0].sizeIn, null);
  assert.equal(value.works[0].availability.price, '500 USD');
  assert.equal(value.identityStatus, 'unsigned'); assert.equal(value.gates[0].identityStatus, 'unverified');
});

test('contract rejects unsupported schemas, duplicates, invalid dimensions and bounded text', () => {
  assert.throws(() => validateGallery({ ...sample(), schema: 'unknown/2' }), /schema/);
  const duplicate = sample(); duplicate.works.push({ ...duplicate.works[0] }); assert.throws(() => validateGallery(duplicate), /duplicate/);
  for (const invalid of [0, -1, Infinity, NaN, '20']) {
    const input = sample(); input.works[0].sizeIn = { w: invalid, h: 20 }; assert.throws(() => validateGallery(input), /Physical width/);
  }
  const input = sample(); input.works[0].story = 'x'.repeat(20001); assert.throws(() => validateGallery(input), /story/);
  assert.throws(() => parseGallery(' '.repeat(8 * 1024 * 1024 + 1)), /limit/);
});

test('URLs reject scripts, data, credentials and control characters; paths cannot escape', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/a', 'https://user:pass@example.com', 'https://example.com/\na']) assert.throws(() => webUrl(value));
  for (const value of ['../x', '/tmp/x', 'a/../../b', 'a//b', '.hidden', 'a/.hidden', 'a\\b', 'a/%2e%2e/b', 'a/']) assert.throws(() => relativeFile(value));
  assert.equal(relativeFile('images/a-b_1.png'), 'images/a-b_1.png');
});

test('engine adapter preserves real size separately from scaled display placement', () => {
  const input = sample(); input.works[0].sizeIn = { w: 200, h: 100 };
  const { paintings: [p] } = toEnginePaintings(input, [slot()], { baseUrl: 'https://host.example/gallery/' });
  assert.deepEqual(p.physicalSizeIn, { w: 200, h: 100 });
  assert.equal(p.estimatedDisplaySize, false); assert.ok(p.displayScale < 1);
  assert.ok(p.fw <= 3); assert.ok(p.fh <= 2); assert.equal(p.id, 'blue-field');
});

test('engine estimates display aspect only, resolves local media under a moved host', () => {
  const input = sample(); input.works[0].localImage = 'images/blue.png';
  const { paintings: [p] } = toEnginePaintings(input, [slot()], { baseUrl: 'https://new.example/art/' });
  assert.equal(p.img, 'https://new.example/art/images/blue.png');
  assert.equal(p.estimatedDisplaySize, true); assert.equal(p.physicalSizeIn, null); assert.equal(p.w / p.h, 2);
  assert.equal(p.needsReview, true);
});

test('engine refuses missing slots, non-finite geometry and invalid normals', () => {
  const options = { baseUrl: 'https://host.example/gallery/' };
  assert.throws(() => toEnginePaintings(sample(), [], options), /slots/);
  assert.throws(() => toEnginePaintings(sample(), [{ ...slot(), x: Infinity }], options), /Invalid x/);
  assert.throws(() => toEnginePaintings(sample(), [{ ...slot(), ix: 0, iz: 0 }], options), /normal/);
  assert.throws(() => toEnginePaintings(sample(), [slot()], { baseUrl: 'https://host.example/art' }), /directory/);
});

test('static visitor page escapes hostile text and provides a complete script-free reading order', () => {
  const input = sample(); input.artist.name = '<img src=x onerror=alert(1)>'; input.works[0].title = '</h2><script>alert(1)</script>';
  input.works[0].story = '<iframe src="https://bad.example"></iframe>'; input.works[0].alt = '" onerror="alert(1)';
  const html = renderGallery(input), $ = load(html);
  assert.equal($('script, iframe, [onerror]').length, 0); assert.equal($('h1').text(), input.artist.name);
  assert.equal($('article h2').text(), input.works[0].title); assert.equal($('.story').text(), input.works[0].story);
  assert.equal($('img').attr('loading'), 'lazy'); assert.equal($('main').attr('tabindex'), '-1');
  assert.equal($('article').length, 1); assert.match($('body').text(), /Physical size unknown/);
  assert.match($('body').text(), /unverified web link/); assert.match($('body').text(), /review needed/);
  assert.equal($('a.skip').attr('href'), '#artworks');
  const styleHash = createHash('sha256').update($('style').text()).digest('base64');
  assert.ok($('meta[http-equiv="Content-Security-Policy"]').attr('content').includes(`'sha256-${styleHash}'`));
});

test('missing media and empty galleries retain usable text', () => {
  const input = sample(); input.works[0].image = null;
  assert.match(renderGallery(input), /Image unavailable/);
  input.works = []; assert.match(renderGallery(input), /No artworks have been added/);
});

test('export, checksum verification and restoration work without any original host or account', async t => {
  const { root, source, gallery } = await fixture(t);
  gallery.works[0].localImage = 'blue.png'; gallery.works[0].sha256 = hash(png);
  await writeFile(path.join(source, 'blue.png'), png); await writeFile(path.join(source, 'gallery.json'), JSON.stringify(gallery));
  const exported = path.join(root, 'export'), restored = path.join(root, 'restored');
  const manifest = await exportGallery(path.join(source, 'gallery.json'), exported);
  assert.equal(manifest.missingMedia.length, 0); await rm(source, { recursive: true });
  await restoreBundle(exported, restored);
  const verified = await verifyBundle(restored);
  assert.equal(verified.gallery.works[0].id, 'blue-field'); assert.equal(verified.gallery.works[0].story, gallery.works[0].story);
  assert.ok(verified.files.get(`media/${hash(png)}.png`).equals(png));
  assert.equal(verified.gallery.works[0].rights, gallery.works[0].rights);
  await assert.rejects(restoreBundle(exported, restored), /EEXIST/);
});

test('remote-only and missing local media are explicit; exporter makes no fetches', async t => {
  const { source, gallery } = await fixture(t);
  gallery.works.push({ ...gallery.works[0], id: 'missing', localImage: 'missing.png' });
  const bundle = await createBundle(gallery, { sourceDir: source });
  assert.deepEqual(bundle.manifest.missingMedia.map(m => m.reason), ['remote-only', 'local-file-missing']);
  assert.equal(bundle.gallery.works[1].localImage, null);
  assert.equal(bundle.files.size, 3);
});

test('media hash mismatches, disguised HTML, and symlink escapes are refused', async t => {
  const { root, source, gallery } = await fixture(t);
  gallery.works[0].localImage = 'blue.png'; gallery.works[0].sha256 = '0'.repeat(64);
  await writeFile(path.join(source, 'blue.png'), png);
  await assert.rejects(createBundle(gallery, { sourceDir: source }), /checksum/);
  gallery.works[0].sha256 = null; await writeFile(path.join(source, 'blue.png'), '<html><script>bad()</script>');
  await assert.rejects(createBundle(gallery, { sourceDir: source }), /raster/);
  await writeFile(path.join(root, 'outside.png'), png); await symlink(path.join(root, 'outside.png'), path.join(source, 'link.png'));
  gallery.works[0].localImage = 'link.png'; await assert.rejects(createBundle(gallery, { sourceDir: source }), /Symlink/);
});

test('backups detect changed files and cannot restore files outside destination', async t => {
  const { root, source, gallery } = await fixture(t); await writeFile(path.join(source, 'gallery.json'), JSON.stringify(gallery));
  const out = path.join(root, 'out'); await exportGallery(path.join(source, 'gallery.json'), out);
  const mf = path.join(out, 'manifest.json'), manifest = JSON.parse(await readFile(mf, 'utf8'));
  await writeFile(path.join(out, 'gallery.json'), '{}'); await assert.rejects(verifyBundle(out), /checksum/);
  manifest.files[0].file = '../outside.txt'; await writeFile(mf, JSON.stringify(manifest));
  await assert.rejects(restoreBundle(out, path.join(root, 'new')), /Unsafe/);
});

test('restore never trusts HTML even when a malicious replacement has a matching checksum', async t => {
  const { root, source, gallery } = await fixture(t); await writeFile(path.join(source, 'gallery.json'), JSON.stringify(gallery));
  const out = path.join(root, 'out'); await exportGallery(path.join(source, 'gallery.json'), out);
  const bytes = Buffer.from('<script>alert(1)</script>'), manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
  const entry = manifest.files.find(f => f.file === 'index.html'); entry.bytes = bytes.length; entry.sha256 = hash(bytes);
  await writeFile(path.join(out, 'index.html'), bytes); await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest));
  const result = await verifyBundle(out); assert.doesNotMatch(result.files.get('index.html').toString(), /<script>/);
});

test('exact public event revisions are preserved without asserting signature validity', async t => {
  const { source, gallery } = await fixture(t);
  const event = { id: 'a'.repeat(64), pubkey: 'b'.repeat(64), sig: 'c'.repeat(128), created_at: 123, kind: 37441, tags: [['d', 'blue-field']], content: '{"title":"Blue Field"}' };
  const exact = Buffer.from(JSON.stringify(event, null, 4) + '\n'); await writeFile(path.join(source, 'event.json'), exact);
  const bundle = await createBundle(gallery, { sourceDir: source, eventFiles: ['event.json'] });
  assert.ok(bundle.files.get(`events/${event.id}.json`).equals(exact));
  assert.equal(bundle.manifest.events[0].coordinate, `37441:${event.pubkey}:blue-field`);
  assert.equal(bundle.manifest.events[0].verification, 'not-verified');
  await writeFile(path.join(source, 'event.json'), JSON.stringify({ ...event, extra: 'not a public event field' }));
  await assert.rejects(createBundle(gallery, { sourceDir: source, eventFiles: ['event.json'] }), /envelope/);
});

test('kit CLI provides actionable usage and a failing exit status', () => {
  const result = spawnSync(process.execPath, ['bin/gallery-kit.js', 'build'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /Usage:/);
});
