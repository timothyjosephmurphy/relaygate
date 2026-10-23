import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { importSite, extractFromHtml, dedupeByPage } from '../src/importer.js';
import { physicalSize } from '../src/dimensions.js';
import { Client } from '../src/http.js';
const root = 'https://artist.test';
const xml = entries => '<urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' + entries + '</urlset>';
const res = (body, type = 'text/html', status = 200) => new Response(body, { status, headers: { 'content-type': type } });
async function output(t) { const out = await mkdtemp(path.join(tmpdir(), 'relaygate-')); t.after(() => rm(out, { recursive: true, force: true })); return out; }
function clientFor(routes, calls) { return new Client({ delayMs: 0, retries: 0, fetchImpl: async url => { calls.push(url); const route = routes[url]; return route ? route() : res('', 'text/plain', 404); } }); }

test('mixed structured, picture, lazy, and dimensionless images are retained without duplicates', async () => {
  const html = await readFile(new URL('./fixtures/mixed-artworks.html', import.meta.url), 'utf8');
  const { works, warnings } = extractFromHtml(html, root + '/works');
  assert.equal(works.length, 6); assert.equal(warnings.length, 1);
  assert.deepEqual(works.find(w => w.image.endsWith('id=1')).sizeIn, { w: 20, h: 30 });
  assert.equal(works.find(w => w.image.endsWith('id=1')).availability.price, '0 USD');
  assert.equal(works.find(w => w.image.endsWith('/pixels.jpg')).sizeIn, null);
  assert.deepEqual(works.find(w => w.image.endsWith('/large.jpg')).sizeIn, { w: 20, h: 30 }); assert.ok(works.find(w => w.image.endsWith('/retina.jpg')));
});
test('physical size handles units and rejects ambiguous orientation or pixel values', () => {
  assert.deepEqual(physicalSize({ width: { value: 508, unitCode: 'MMT' }, height: '30 in' }).sizeIn, { w: 20, h: 30 });
  assert.equal(physicalSize({ width: 1200, height: 800 }).sizeIn, null);
  assert.equal(physicalSize({}, '24 x 36 inches').sizeIn, null);
  assert.deepEqual(physicalSize({}, '30 in H x 20 in W').sizeIn, { w: 20, h: 30 });
  assert.equal(physicalSize({ width: '-2 in', height: '0 in' }).sizeIn, null);
});
test('query IDs and identical basenames in different directories remain distinct', () => {
  const works = ['/image?id=1', '/image?id=2', '/one/a.jpg', '/two/a.jpg'].map(image => ({ image: root + image, page: root, title: 'Same title', source: 'img' }));
  assert.equal(dedupeByPage(works).length, 4);
});
test('full import follows cyclic gzip sitemaps, retains homepage, discovers nested links, honors robots and downloads hashes', async t => {
  const out = await output(t), calls = [];
  const routes = {
    [root + '/robots.txt']: () => res('User-agent: *\nDisallow: /private\nSitemap: ' + root + '/index.xml', 'text/plain'),
    [root + '/']: () => res('<title>Ada</title><img src="/home.png" alt="Homepage work"><a href="/collection">Collection</a>'),
    [root + '/index.xml']: () => res('<sitemapindex><sitemap><loc>' + root + '/index.xml</loc></sitemap><sitemap><loc>' + root + '/works.xml.gz</loc></sitemap></sitemapindex>', 'application/xml'),
    [root + '/works.xml.gz']: () => res(gzipSync(xml('<url><loc>' + root + '/work</loc><image:image><image:loc>' + root + '/only-map.png</image:loc><image:title>Sitemap work</image:title></image:image><image:image><image:loc>' + root + '/skip.png</image:loc></image:image></url><url><loc>' + root + '/private</loc></url>')), 'application/gzip'),
    [root + '/work']: () => res('<img data-relaygate-skip src="/skip.png"><img src="https://cdn.test/blocked.png" alt="CDN work">'),
    [root + '/collection']: () => res('<a href="/collection/deeper">More</a><a href="https://other.test/art">Offsite</a>'),
    [root + '/collection/deeper']: () => res('<meta property="og:image" content="/deep.png"><meta property="og:title" content="Deep work">'),
    [root + '/home.png']: () => res('home image bytes', 'image/png'),
    [root + '/only-map.png']: () => res('map image bytes', 'image/png'),
    [root + '/deep.png']: () => res('deep image bytes', 'image/png'),
    ['https://cdn.test/robots.txt']: () => res('User-agent: *\nDisallow: /', 'text/plain'),
  };
  const gallery = await importSite(root, { out, client: clientFor(routes, calls), log: () => {} });
  assert.equal(gallery.schema, 'relaygate/gallery/1'); assert.equal(gallery.works.length, 4); assert.equal(gallery.stats.pagesFetched, 4);
  assert.equal(calls.filter(u => u === root + '/index.xml').length, 1);
  assert.ok(!calls.includes(root + '/private')); assert.ok(!calls.includes(root + '/skip.png')); assert.ok(!calls.includes('https://cdn.test/blocked.png')); assert.ok(!calls.includes('https://other.test/art'));
  assert.equal(gallery.works.filter(w => w.localImage).length, 3);
  for (const w of gallery.works.filter(w => w.localImage)) { assert.match(w.sha256, /^[a-f0-9]{64}$/); assert.ok((await readFile(path.join(out, w.localImage))).length); }
  assert.deepEqual(JSON.parse(await readFile(path.join(out, 'gallery.json'))), gallery);
  assert.ok(gallery.warnings.some(w => w.includes('Image unavailable')));
});
test('no-download makes no image requests, preserves gates and stable IDs across title edits', async t => {
  const out = await output(t), calls = []; let title = 'First title';
  const routes = { [root + '/']: () => res(`<img src="/a.jpg?id=1" alt="${title}"><img src="/a.jpg?id=2" alt="${title}">`) };
  const first = await importSite(root, { out, download: false, gateTo: ['https://friend.test/'], client: clientFor(routes, calls), log: () => {} });
  title = 'Edited title';
  const second = await importSite(root, { out, download: false, client: clientFor(routes, calls), log: () => {} });
  assert.deepEqual(first.works.map(w => w.id), second.works.map(w => w.id));
  assert.equal(first.works.length, 2); assert.deepEqual(first.gates, [{ url: 'https://friend.test/' }]);
  assert.ok(calls.every(u => !u.includes('a.jpg'))); assert.ok(first.works.every(w => w.sizeIn === null && w.localImage === null));
});
test('page budget includes home and empty results carry a review warning', async t => {
  const out = await output(t), calls = [];
  const routes = { [root + '/']: () => res('<a href="/a">a</a><a href="/b">b</a>') };
  const g = await importSite(root, { out, maxPages: 1, client: clientFor(routes, calls), log: () => {} });
  assert.equal(g.stats.pagesFetched, 1); assert.equal(g.works.length, 0); assert.ok(g.warnings.some(x => x.includes('Page limit'))); assert.ok(g.warnings.some(x => x.includes('No artwork')));
  assert.ok(!calls.includes(root + '/a'));
});
test('unavailable start and invalid options fail before producing misleading output', async t => {
  const out = await output(t);
  for (const options of [{ maxPages: 0 }, { delayMs: NaN }, { concurrency: 30 }, { gateTo: ['javascript:no'] }]) await assert.rejects(importSite(root, { out, ...options, log: () => {} }));
  await assert.rejects(importSite('file:///tmp/a', { out }));
  await assert.rejects(importSite(root, { out, client: clientFor({}, []), log: () => {} }), /Could not fetch/);
});
test('CLI rejects unsupported publish/unknown flags and prints help without network', () => {
  for (const args of [['--publish'], ['--bad'], ['--max-pages', '0', root]]) {
    const r = spawnSync(process.execPath, ['bin/cli.js', ...args], { encoding: 'utf8' }); assert.equal(r.status, 1);
  }
  const help = spawnSync(process.execPath, ['bin/cli.js', '--help'], { encoding: 'utf8' }); assert.equal(help.status, 0); assert.match(help.stdout, /unsigned gallery/);
});

test('page worker pool overlaps latency without exceeding its concurrency limit', async t => {
  const out = await output(t); let active = 0, peak = 0;
  const client = new Client({ delayMs: 0, fetchImpl: async url => {
    if (url === root + '/') return res('<a href="/a">a</a><a href="/b">b</a><a href="/c">c</a><a href="/d">d</a>');
    if (/\/[abcd]$/.test(url)) {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 15)); active--;
      return res('<p>art page</p>');
    }
    return res('', 'text/plain', 404);
  } });
  await importSite(root, { out, client, concurrency: 2, download: false, log: () => {} });
  assert.equal(peak, 2);
});

test('Squarespace filename alt text is marked as inferred, not an artwork title', async () => {
  const html = await readFile(new URL('./fixtures/squarespace-gallery.html', import.meta.url), 'utf8');
  const { works } = extractFromHtml(html, root + '/collection', { leaf: true });
  assert.equal(works.length, 2); assert.ok(works.every(w => w.titleSource === 'filename' && w.sizeIn === null));
  assert.deepEqual(works.map(w => w.title), ['IMG 9706', 'IMG 9634']);
});
test('merging duplicates retains every source page including the first observation', () => {
  const merged = dedupeByPage([{ title: 'A', image: root + '/a.jpg', page: root + '/', source: 'img' }, { title: 'A', image: root + '/a.jpg', page: root + '/collection', source: 'img', sourcePages: [root + '/third'] }]);
  assert.deepEqual(merged[0].sourcePages, [root + '/', root + '/collection', root + '/third']);
});
