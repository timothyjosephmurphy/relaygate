import * as cheerio from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from './http.js';

const ART_TYPES = ['VisualArtwork', 'Painting', 'Product', 'ImageObject', 'Photograph', 'Sculpture', 'Drawing'];
const JUNK = /(logo|icon|favicon|avatar|sprite|badge|banner|placeholder|spinner|social|payment|paypal|stripe|cart|arrow|button)/i;
const MIN_SIDE = 400;
const SKIP_PATH = /\/(play|cart|checkout|account|login|signin|admin|search|privacy|terms|shipping|contact|tag|category|feed)(\/|$)/i;

const clean = s => (s || '').replace(/\s+/g, ' ').trim();
const isFilenameish = s => !s || /\.(jpe?g|png|webp|gif|tiff?)$/i.test(s) || /^(img|dsc|image|screen ?shot|untitled)[\s_-]?\d*/i.test(s);
const fromFilename = u => { try { return clean(decodeURIComponent(new URL(u).pathname.split('/').pop()).replace(/\.[a-z0-9]+$/i, '').replace(/[+_-]+/g, ' ')); } catch { return ''; } };
export const slug = s => clean(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'work';

const isSquarespaceImg = u => /squarespace(-cdn)?\.com/.test(u);
function imgKey(u) { // normalize for dedupe
  try { const x = new URL(u); x.search = ''; x.protocol = 'https:'; return x.href.replace(/\/\d{10,}\//, '/'); } catch { return u; }
}
function largeVersion(u) {
  try { const x = new URL(u); if (isSquarespaceImg(u)) { x.search = '?format=2500w'; x.protocol = 'https:'; } return x.href; } catch { return u; }
}
function siteTitleStrip(t, siteName) {
  t = clean(t);
  for (const sep of [' — ', ' – ', ' | ', ' - ', ' &mdash; ']) { const i = t.lastIndexOf(sep); if (i > 0) { const tail = t.slice(i + sep.length); if (!siteName || tail.toLowerCase().includes(siteName.toLowerCase().slice(0, 8)) || tail === tail.toUpperCase()) t = t.slice(0, i); } }
  return clean(t);
}
const asArr = v => v == null ? [] : Array.isArray(v) ? v : [v];
const firstStr = v => { for (const x of asArr(v)) { if (typeof x === 'string') return x; if (x && (x.url || x.contentUrl)) return x.url || x.contentUrl; } return ''; };

function parseSize(node, desc) {
  const d = v => typeof v === 'object' && v ? (v.name || (v.value != null ? `${v.value} ${v.unitText || v.unitCode || ''}` : '')) : (v || '');
  const w = clean(d(node.width)), h = clean(d(node.height));
  if (w && h && !/^\d+$/.test(w)) return `${w} × ${h}`;
  const m = (desc || '').match(/(\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?(?:\s*[×x]\s*\d+(?:\.\d+)?)?\s*(?:in|inches|cm|mm|"|”))/i);
  return m ? clean(m[1]) : null;
}
function parseYear(node, desc) {
  const y = String(node.dateCreated || node.datePublished || '').match(/\b(1[89]|20)\d{2}\b/);
  if (y && node.dateCreated) return +y[0];
  const m = (desc || '').match(/\b(?:painted|created|made|completed)\s+(?:in\s+)?((?:19|20)\d{2})\b/i);
  return m ? +m[1] : null;
}
function parseMedium(node, desc) {
  const m = node.artMedium || node.material || (node.artform && node.artform !== 'Painting' ? node.artform : null);
  if (m) return clean(asArr(m).join(', '));
  const k = (desc || '').match(/\b(watercolou?r|oil|acrylic|gouache|ink|charcoal|pastel|mixed media|digital|graphite|spray ?paint|encaustic)\b(?:\s+on\s+\w+)?/i);
  return k ? clean(k[0]).toLowerCase() : null;
}
function availability(node) {
  for (const o of asArr(node.offers)) {
    if (!o || typeof o !== 'object') continue;
    const av = String(o.availability || '').split('/').pop() || null;
    return { status: av, price: o.price ? `${o.price} ${o.priceCurrency || ''}`.trim() : null, shopUrl: o.url || node.url || null };
  }
  return null;
}

function* walkLd(x) {
  if (Array.isArray(x)) { for (const i of x) yield* walkLd(i); return; }
  if (!x || typeof x !== 'object') return;
  yield x;
  for (const k of ['@graph', 'itemListElement', 'item', 'mainEntity', 'hasPart', 'workExample']) if (x[k]) yield* walkLd(x[k]);
}

export function extractFromHtml(html, pageUrl, ctx = {}) {
  const $ = cheerio.load(html);
  const abs = u => { try { return u ? new URL(u, pageUrl).href : ''; } catch { return ''; } };
  const og = p => $(`meta[property="og:${p}"]`).attr('content') || '';
  const siteName = og('site_name') || ctx.siteName || '';
  const pageTitle = siteTitleStrip(og('title') || $('title').text(), siteName);
  const works = [];
  // 1. JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    let data; try { data = JSON.parse($(el).contents().text()); } catch { return; }
    for (const n of walkLd(data)) {
      const types = asArr(n['@type']);
      if (!types.some(t => ART_TYPES.includes(t))) continue;
      const img = abs(types.includes('ImageObject') ? (n.contentUrl || n.url) : firstStr(n.image));
      if (!img) continue;
      const desc = clean(n.description);
      works.push({ title: clean(n.name || n.caption) || pageTitle, image: img, page: abs(types.includes('ImageObject') ? pageUrl : (n.url || pageUrl)),
        size: parseSize(n, desc), medium: parseMedium(n, desc), year: parseYear(n, desc), availability: availability(n), description: desc || null, source: 'json-ld:' + types.join('/') });
    }
  });
  const author = (() => { for (const el of $('script[type="application/ld+json"]').toArray()) { try { for (const n of walkLd(JSON.parse($(el).contents().text()))) { const c = n.creator || n.author; if (c?.name) return c.name; if (asArr(n['@type']).includes('Person') && n.name) return n.name; } } catch {} } return null; })();
  // 2. <img> fallback (only if page had no structured artworks)
  if (!works.length) {
    $('header img, footer img, nav img, [class*="logo"] img, img[class*="logo"]').attr('data-slipgate-skip', '1');
    $('img').each((_, el) => {
      const e = $(el);
      if (e.attr('data-slipgate-skip')) return;
      const src = abs(e.attr('data-image') || e.attr('data-src') || pickSrcset(e.attr('srcset')) || e.attr('src'));
      if (!src || src.startsWith('data:') || /\.svg(\?|$)/i.test(src)) return;
      const alt = clean(e.attr('alt'));
      if (JUNK.test(src.split('/').pop()) || JUNK.test(alt) || JUNK.test(e.attr('class') || '')) return;
      let w = +e.attr('width') || 0, h = +e.attr('height') || 0;
      const dims = e.attr('data-image-dimensions'); if (dims) [w, h] = dims.split('x').map(Number);
      if (!(w && h)) return; // unknown size: skip (avoids icons); see SPEC gaps
      if (Math.min(w, h) < MIN_SIDE) return;
      const link = e.closest('a').attr('href');
      const cap = clean(e.closest('figure').find('figcaption').first().text());
      let title = !isFilenameish(alt) ? alt : (cap || fromFilename(src));
      works.push({ title, image: src, page: link && !/\.(jpe?g|png|webp)$/i.test(link) ? abs(link) : pageUrl, project: pageTitle || null, pixelSize: `${w}x${h}`,
        size: null, medium: null, year: null, availability: null, description: null, source: 'img' });
    });
  }
  // og:image as last resort for a single-work page
  if (!works.length && og('image') && ctx.leaf) {
    const w = +og('image:width') || 0, h = +og('image:height') || 0;
    if (!(w && h && Math.min(w, h) < MIN_SIDE)) works.push({ title: pageTitle, image: abs(og('image')), page: pageUrl, size: null, medium: null, year: null, availability: null, description: clean(og('description')) || null, source: 'og' });
  }
  const links = $('a[href]').map((_, a) => abs($(a).attr('href'))).get();
  return { works, siteName, author, links, isSquarespace: /squarespace/i.test(html.slice(0, 20000)) };
}
function pickSrcset(s) { if (!s) return ''; let best = '', bw = 0; for (const p of s.split(',')) { const [u, d] = p.trim().split(/\s+/); const w = parseInt(d) || 1; if (w >= bw) { bw = w; best = u; } } return best; }

async function readSitemaps(client, origin, robots, log, depth = 0, urls = null) {
  const pages = new Map(); // url -> [imageUrls]
  const queue = urls || (robots.sitemaps.length ? robots.sitemaps : [origin + '/sitemap.xml']);
  for (const sm of queue) {
    const r = await client.text(sm); if (!r) continue;
    const $ = cheerio.load(r.text, { xmlMode: true });
    const subs = $('sitemap > loc').map((_, e) => $(e).text().trim()).get();
    if (subs.length && depth < 2) { for (const [k, v] of await readSitemaps(client, origin, robots, log, depth + 1, subs)) pages.set(k, v); continue; }
    $('url').each((_, u) => { const loc = $(u).children('loc').text().trim(); if (loc) pages.set(loc, $(u).find('image\\:loc, loc').slice(1).map((_, e) => $(e).text().trim()).get()); });
  }
  log(`sitemap: ${pages.size} pages`);
  return pages;
}

// Drop weaker candidates (img/og) whose page already has a structured work; tidy titles.
export function dedupeByPage(works, artist = '') {
  const structuredPages = new Set(works.filter(w => w.source.startsWith('json-ld')).map(w => w.page.replace(/\/$/, '')));
  const nStruct = works.filter(w => w.source.startsWith('json-ld')).length;
  const structuredOnly = nStruct >= 20 && nStruct >= 0.8 * works.length; // site has good markup: trust it alone
  return works.filter(w => w.source.startsWith('json-ld') || !structuredOnly &&  !structuredPages.has(w.page.replace(/\/$/, '')))
    .map(w => ({ ...w, title: clean(w.title.replace(/,\s*an? (painting|drawing|work|artwork) by .*$/i, '')) }));
}

export async function importSite(siteUrl, { out = 'gallery-out', name, maxPages = 600, delayMs = 1000, download = true, log = console.error } = {}) {
  const client = new Client({ delayMs, log });
  const start = new URL(siteUrl.match(/^https?:/) ? siteUrl : 'https://' + siteUrl);
  const home = await client.text(start.href);
  if (!home) throw new Error(`could not fetch ${start.href} (blocked by robots.txt or unreachable)`);
  const origin = new URL(home.url).origin;
  const sameSite = u => { try { const h = new URL(u).hostname.replace(/^www\./, ''); return h === new URL(origin).hostname.replace(/^www\./, ''); } catch { return false; } };
  const robots = await client.robotsFor(origin);
  const sm = await readSitemaps(client, origin, robots, log);
  const homeEx = extractFromHtml(home.text, home.url);
  let pages = [...sm.keys()].filter(sameSite);
  if (!pages.length) pages = [...new Set(homeEx.links.filter(sameSite).map(u => u.split('#')[0]))];
  pages = pages.filter(u => !SKIP_PATH.test(new URL(u).pathname));
  // Shallow pages (collections) last; leaf pages first so structured per-work data wins dedupe.
  const depthOf = u => new URL(u).pathname.split('/').filter(Boolean).length;
  pages.sort((a, b) => depthOf(b) - depthOf(a));
  if (pages.length > maxPages) { log(`limiting to ${maxPages} of ${pages.length} pages (--max-pages)`); pages = pages.slice(0, maxPages); }

  const all = []; let siteName = homeEx.siteName, author = homeEx.author;
  // Squarespace collection JSON (only where robots.txt allows; Squarespace's default robots disallows it)
  if (homeEx.isSquarespace) {
    const probe = origin + '/?format=json';
    if (await client.allowed(probe)) log('squarespace: ?format=json allowed, collection JSON could be used (TODO: see SPEC)');
    else log('squarespace: robots.txt disallows ?format=json; using HTML + sitemap instead');
  }
  let i = 0;
  for (const p of pages) {
    i++;
    const r = p === home.url ? home : await client.text(p);
    if (!r || !/html/.test(r.type || 'text/html')) continue;
    const ex = extractFromHtml(r.text, r.url, { siteName, leaf: depthOf(p) >= 2 });
    siteName ||= ex.siteName; author ||= ex.author;
    all.push(...ex.works);
    if (i % 25 === 0) log(`  ${i}/${pages.length} pages, ${all.length} candidates`);
  }
  // dedupe by image; prefer structured sources
  const rank = w => w.source.startsWith('json-ld') ? 0 : w.source === 'og' ? 1 : 2;
  all.sort((a, b) => rank(a) - rank(b));
  const seen = new Map();
  const seenName = new Set();
  for (const w of all) { const k = imgKey(w.image), nm = w.source === 'img' ? k.split('/').pop().toLowerCase() : k; if (!seen.has(k) && !seenName.has(nm)) { seen.set(k, w); seenName.add(nm); } }
  let works = dedupeByPage([...seen.values()]);
  const usedIds = new Set();
  works = works.map(w => { let id = slug(w.title), n = 2; while (usedIds.has(id)) id = `${slug(w.title)}-${n++}`; usedIds.add(id); return { id, ...w }; });

  await mkdir(path.join(out, 'images'), { recursive: true });
  if (download) {
    let k = 0; const hashes = new Map();
    for (const w of works) {
      const r = await client.buffer(largeVersion(w.image));
      if (!r || !/^image\//.test(r.type)) { w.localImage = null; continue; }
      const ext = (r.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z]/g, '');
      const h = createHash('sha1').update(r.buf).digest('hex');
      if (hashes.has(h)) { w.duplicateOf = hashes.get(h); continue; } // byte-identical re-upload
      hashes.set(h, w.id);
      w.localImage = `images/${w.id}.${ext}`;
      await writeFile(path.join(out, w.localImage), r.buf);
      if (++k % 25 === 0) log(`  downloaded ${k}/${works.length}`);
    }
  }
  works = works.filter(w => !w.duplicateOf);
  const gallery = {
    schema: 'slipgate-gallery/1', generatedAt: new Date().toISOString(),
    artist: { name: name || author || siteName || new URL(origin).hostname, siteUrl: origin },
    works: works.map(({ description, ...w }) => ({ ...w, description: description ? description.slice(0, 500) : null })),
  };
  await writeFile(path.join(out, 'gallery.json'), JSON.stringify(gallery, null, 2));
  return gallery;
}
