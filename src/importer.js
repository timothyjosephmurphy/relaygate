import * as cheerio from 'cheerio';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { Client, httpUrl } from './http.js';
import { physicalSize } from './dimensions.js';

const ART_TYPES = new Set(['VisualArtwork', 'Painting', 'Product', 'ImageObject', 'Photograph', 'Sculpture', 'Drawing']);
const SKIP = '[data-relaygate-skip], [data-slipgate-skip], header, footer, nav';
const JUNK = /(?:^|[\s_./-])(logo|icon|favicon|avatar|sprite|badge|placeholder|spinner|paypal|stripe|button)(?:[\s_.-]|$)/i;
const SKIP_PATH = /\/(cart|checkout|account|login|signin|admin|search|privacy|terms|feed)(\/|$)/i;
const clean = s => typeof s === 'string' || typeof s === 'number' ? String(s).replace(/\s+/g, ' ').trim() : '';
const asArr = x => x == null ? [] : Array.isArray(x) ? x : [x];
const digest = x => createHash('sha256').update(x).digest('hex');
export const slug = s => clean(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').slice(0, 60) || 'work';
const filename = value => { try { return clean(decodeURIComponent(new URL(value).pathname.split('/').pop()).replace(/\.[a-z0-9]+$/i, '').replace(/[_+-]/g, ' ')); } catch { return ''; } };
const filenameLike = value => !value || /\.(?:jpe?g|png|webp|gif|avif)$/i.test(value) || /^(?:img|dsc)[_ -]?\d/i.test(value);
const imageValue = x => typeof x === 'string' ? x : x?.contentUrl || x?.url;
// Keep query-based image identities. Only known Squarespace resize parameters are equivalent.
function imageKey(value) {
  const u = new URL(value);
  if (/(^|\.)squarespace(?:-cdn)?\.com$/.test(u.hostname)) u.searchParams.delete('format');
  return u.href;
}
function* walkLd(value, depth = 0) {
  if (depth > 30 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const n of value) yield* walkLd(n, depth + 1); return; }
  yield value;
  for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity', 'hasPart', 'workExample']) yield* walkLd(value[key], depth + 1);
}
function metadata(node, description) {
  const year = clean(node.dateCreated).match(/\b(?:18|19|20)\d{2}\b/) || description.match(/\b(?:painted|created|made)\s+(?:in\s+)?((?:19|20)\d{2})\b/i);
  const medium = clean(asArr(node.artMedium || node.material).join(', ')) || description.match(/\b(?:watercolou?r|oil|acrylic|gouache|ink|charcoal|pastel|mixed media|graphite)\b(?:\s+on\s+\w+)?/i)?.[0] || null;
  const offer = asArr(node.offers).find(o => o && typeof o === 'object');
  return { ...physicalSize(node, description), medium, year: year ? Number(year[1] || year[0]) : null,
    availability: offer ? { status: clean(offer.availability).split('/').pop() || null, price: offer.price != null ? `${clean(offer.price)} ${clean(offer.priceCurrency)}`.trim() : null, shopUrl: httpUrl(offer.url || node.url) } : null };
}
function pickSrcset(value) {
  return (value || '').split(',').map(s => s.trim().split(/\s+/)).sort((a, b) => (parseFloat(b[1]) || 1) - (parseFloat(a[1]) || 1))[0]?.[0];
}

/** Merge by image identity, never discard different images merely sharing a page. */
export function dedupeByPage(works) {
  const rank = w => w.source?.startsWith('json-ld') ? 0 : w.source === 'img' ? 1 : w.source === 'og' ? 2 : 3;
  const found = new Map();
  for (const work of [...works].sort((a, b) => rank(a) - rank(b))) {
    const key = work.image ? imageKey(work.image) : `${work.page}|${work.title}`;
    const current = found.get(key);
    if (!current) found.set(key, { ...work, title: clean(work.title) });
    else {
      for (const [k, v] of Object.entries(work)) if (k !== 'sourcePages' && current[k] == null && v != null) current[k] = v;
      current.sourcePages = [...new Set([current.page, ...(current.sourcePages || []), work.page, ...(work.sourcePages || [])])];
    }
  }
  return [...found.values()];
}

export function extractFromHtml(html, pageUrl, ctx = {}) {
  const $ = cheerio.load(html);
  const base = httpUrl($('base[href]').first().attr('href'), pageUrl) || pageUrl;
  const abs = value => value ? httpUrl(value, base) : null;
  const meta = name => $('meta').toArray().find(el => ($(el).attr('property') || $(el).attr('name') || '').toLowerCase() === name);
  const val = name => clean($(meta(name)).attr('content'));
  const siteName = val('og:site_name') || ctx.siteName || '';
  let title = val('og:title') || clean($('title').text());
  if (siteName) for (const sep of [' — ', ' – ', ' | ', ' - ']) if (title.endsWith(sep + siteName)) title = title.slice(0, -(sep + siteName).length);
  const works = [], warnings = []; let author = null;
  const excluded = new Set();
  $('img').each((_, el) => {
    const e = $(el);
    if (e.closest(SKIP).length) for (const s of [e.attr('src'), e.attr('data-src'), e.attr('data-image'), pickSrcset(e.attr('srcset')), pickSrcset(e.attr('data-srcset')), pickSrcset(e.closest('picture').find('source').first().attr('srcset'))]) { const u = abs(s); if (u) excluded.add(imageKey(u)); }
  });
  $('script[type="application/ld+json"]').each((_, el) => {
    if ($(el).closest(SKIP).length) return;
    let data;
    try { data = JSON.parse($(el).text()); } catch { warnings.push(`Invalid JSON-LD on ${pageUrl}`); return; }
    for (const node of walkLd(data)) {
      const types = asArr(node['@type']).map(t => clean(t).split(/[\/#]/).pop());
      const creator = asArr(node.creator || node.author)[0];
      author ||= clean(creator?.name || creator) || (types.includes('Person') ? clean(node.name) : '') || null;
      if (!types.some(t => ART_TYPES.has(t))) continue;
      const images = types.includes('ImageObject') ? [node.contentUrl || node.url] : asArr(node.image);
      const description = clean(node.description);
      for (const item of images) {
        const image = abs(imageValue(item));
        if (!image || excluded.has(imageKey(image))) continue;
        works.push({ title: clean(node.name || node.caption) || title || filename(image), titleSource: node.name || node.caption ? 'metadata' : title ? 'page-title' : 'filename', image,
          page: types.includes('ImageObject') ? pageUrl : abs(node.url) || pageUrl, ...metadata(types.includes('ImageObject') ? {} : node, description), description: description || null,
          source: 'json-ld:' + types.join('/') });
      }
    }
  });
  $('img').each((_, el) => {
    const e = $(el);
    if (e.closest(SKIP).length) return;
    const picture = e.closest('picture');
    const source = e.attr('data-image') || pickSrcset(e.attr('data-srcset')) || e.attr('data-src') || pickSrcset(e.attr('srcset')) || pickSrcset(picture.find('source').first().attr('srcset')) || e.attr('src');
    const image = abs(source), alt = clean(e.attr('alt'));
    if (!image || /\.svg(?:\?|$)/i.test(image) || JUNK.test(new URL(image).pathname) || JUNK.test(e.attr('class') || '') || JUNK.test(alt)) return;
    let w = Number(e.attr('width')), h = Number(e.attr('height'));
    if (e.attr('data-image-dimensions')) [w, h] = e.attr('data-image-dimensions').split('x').map(Number);
    if ((w > 0 && w < 100) || (h > 0 && h < 100)) return;
    const caption = clean(e.closest('figure').find('figcaption').first().text());
    const usableAlt = filenameLike(alt) ? '' : alt;
    const pageFallback = ctx.leaf && $('img').length === 1 ? title : '';
    const name = clean(e.attr('data-title')) || usableAlt || caption || pageFallback || filename(image);
    const link = abs(e.closest('a').attr('href'));
    works.push({ title: name, titleSource: e.attr('data-title') ? 'data-title' : usableAlt ? 'alt' : caption ? 'caption' : pageFallback ? 'page-title' : 'filename',
      image, page: link && !/\.(jpe?g|png|webp|gif)(?:\?|$)/i.test(link) ? link : pageUrl, project: title || null,
      pixelSize: w > 0 && h > 0 ? `${w}x${h}` : null, ...metadata({ width: e.attr('data-art-width'), height: e.attr('data-art-height') }, caption),
      description: caption || null, source: 'img' });
  });
  const ogImage = abs(val('og:image') || val('twitter:image'));
  if (ogImage && !excluded.has(imageKey(ogImage)) && !works.length && ctx.leaf) {
    const description = val('og:description') || val('description');
    works.push({ title: title || filename(ogImage), titleSource: title ? 'page-title' : 'filename', image: ogImage, page: pageUrl, ...metadata({}, description), description: description || null, source: 'og' });
  }
  const links = $('a[href]').map((_, a) => abs($(a).attr('href'))).get().filter(Boolean);
  return { works: dedupeByPage(works), siteName, author, links, warnings, excludedImages: [...excluded] };
}

/** Handles namespaces without assuming a particular image namespace prefix. */
export function parseSitemapXml(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const local = el => (el.name || '').split(':').pop();
  const children = (el, name) => $(el).children().toArray().filter(n => local(n) === name);
  const text = el => clean($(el).text());
  const indexLocs = [], pages = new Map(), imageMetadata = new Map();
  $('*').each((_, el) => {
    if (local(el) === 'sitemap') indexLocs.push(...children(el, 'loc').map(text));
    if (local(el) !== 'url') return;
    const page = text(children(el, 'loc')[0]);
    if (!page) return;
    const images = children(el, 'image').map(img => ({ image: text(children(img, 'loc')[0]), title: text(children(img, 'title')[0]), description: text(children(img, 'caption')[0]) })).filter(img => img.image);
    pages.set(page, images.map(i => i.image)); imageMetadata.set(page, images);
  });
  return { indexLocs: indexLocs.filter(Boolean), pages, imageMetadata };
}

async function mapLimit(items, limit, fn) {
  let index = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) { const i = index++; results[i] = await fn(items[i], i); }
  }));
  return results;
}
function integer(name, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
}

export async function importSite(siteUrl, { out = 'gallery-out', name, maxPages = 600, delayMs = 1000, download = true, concurrency = 3, maxSitemaps = 30, maxWorks = 3000, gateTo = [], log = console.error, client: suppliedClient } = {}) {
  integer('maxPages', maxPages, 1, 10000); integer('delayMs', delayMs, 0, 60000); integer('concurrency', concurrency, 1, 8); integer('maxSitemaps', maxSitemaps, 1, 100); integer('maxWorks', maxWorks, 1, 10000);
  if (typeof siteUrl !== 'string' || !siteUrl.trim()) throw new Error('An artist website URL is required');
  const start = httpUrl(/^[a-z][a-z\d+.-]*:/i.test(siteUrl) ? siteUrl : 'https://' + siteUrl);
  if (!start) throw new Error('Use an HTTP(S) URL without embedded credentials');
  const gates = gateTo.map(value => { const url = httpUrl(value); if (!url) throw new Error('Gate destinations must be HTTP(S) URLs'); return { url }; });
  const warnings = [], report = message => { warnings.push(message); log(message); };
  const client = suppliedClient || new Client({ delayMs, log: report });
  const home = await client.text(start, { accept: 'text/html,application/xhtml+xml' });
  if (!home || (home.type && !/html/i.test(home.type))) throw new Error('Could not fetch an HTML starting page (robots, network, or content type)');
  const origin = new URL(home.url).origin;
  const sameSite = value => { const url = httpUrl(value, home.url); return url && new URL(url).origin === origin ? url : null; };
  const homeEx = extractFromHtml(home.text, home.url, { leaf: new URL(home.url).pathname !== '/' });
  warnings.push(...homeEx.warnings);
  let siteName = homeEx.siteName, author = homeEx.author;
  const all = [...homeEx.works], pages = [], queued = new Set([home.url]), fetched = new Set([home.url]), sitemapImages = new Map();
  let pageLimitReported = false;
  const enqueue = value => {
    const url = sameSite(value);
    if (!url || queued.has(url) || SKIP_PATH.test(new URL(url).pathname) || /\.(?:pdf|zip|xml|jpe?g|png|gif|webp|avif|mp4|mp3)$/i.test(new URL(url).pathname)) return;
    if (queued.size >= maxPages) { if (!pageLimitReported) report(`Page limit ${maxPages} reached; output may be incomplete`); pageLimitReported = true; return; }
    queued.add(url); pages.push(url);
  };
  const robots = await client.robotsFor(origin);
  const maps = [...new Set([...robots.sitemaps, origin + '/sitemap.xml'])], seenMaps = new Set();
  for (let i = 0; i < maps.length && seenMaps.size < maxSitemaps; i++) {
    const url = httpUrl(maps[i], home.url);
    if (!url || seenMaps.has(url)) continue;
    seenMaps.add(url);
    const result = await client.buffer(url);
    if (!result) continue;
    let xml;
    try { xml = (result.buf[0] === 0x1f && result.buf[1] === 0x8b ? gunzipSync(result.buf, { maxOutputLength: 5 * 1024 * 1024 }) : result.buf).toString('utf8'); }
    catch { report(`Invalid or oversized compressed sitemap: ${url}`); continue; }
    if (!/<(?:\w+:)?(?:urlset|sitemapindex)[\s>]/i.test(xml)) continue;
    const parsed = parseSitemapXml(xml);
    for (const loc of parsed.indexLocs) { const child = httpUrl(loc, result.url); if (child && !seenMaps.has(child) && maps.length < maxSitemaps * 10) maps.push(child); }
    for (const [page, images] of parsed.imageMetadata) {
      const u = sameSite(httpUrl(page, result.url));
      if (!u) continue;
      enqueue(u);
      if (queued.has(u)) sitemapImages.set(u, images);
    }
  }
  if (maps.some(u => !seenMaps.has(httpUrl(u, home.url)))) report(`Sitemap limit ${maxSitemaps} reached; output may be incomplete`);
  homeEx.links.forEach(enqueue);
  const addSitemapImages = (page, excludedImages = []) => {
    for (const item of sitemapImages.get(page) || []) {
      const image = httpUrl(item.image, page);
      if (image && !excludedImages.includes(imageKey(image))) all.push({ title: item.title || filename(image), titleSource: item.title ? 'sitemap' : 'filename', image, page, ...metadata({}, item.description), description: item.description || null, source: 'sitemap' });
    }
  };
  addSitemapImages(home.url, homeEx.excludedImages);
  for (let cursor = 0; cursor < pages.length; cursor += concurrency) {
    const batch = pages.slice(cursor, cursor + concurrency);
    const results = await mapLimit(batch, concurrency, async page => {
      if (!(await client.allowed(page))) { report(`robots.txt disallows ${page}`); return null; }
      const r = await client.text(page, { allowedOrigin: origin, accept: 'text/html,application/xhtml+xml' });
      if (!r) { report(`Page unavailable: ${page}`); return { page, ex: null }; }
      if (r.type && !/html/i.test(r.type)) return null;
      return { page, url: r.url, ex: extractFromHtml(r.text, r.url, { siteName, leaf: new URL(r.url).pathname !== '/' }) };
    });
    for (const result of results) {
      if (!result) continue;
      addSitemapImages(result.page, result.ex?.excludedImages);
      if (!result.ex || fetched.has(result.url)) continue;
      fetched.add(result.url);
      const ex = result.ex;
      siteName ||= ex.siteName; author ||= ex.author; warnings.push(...ex.warnings); all.push(...ex.works); ex.links.forEach(enqueue);
    }
    log(`Read ${Math.min(cursor + concurrency, pages.length) + 1} pages; ${all.length} image candidates`);
    if (all.length >= maxWorks * 5) { report('Candidate limit reached; output may be incomplete'); break; }
  }
  let works = dedupeByPage(all).sort((a, b) => imageKey(a.image).localeCompare(imageKey(b.image)));
  if (works.length > maxWorks) { report(`Work limit ${maxWorks} reached; output may be incomplete`); works = works.slice(0, maxWorks); }
  works = works.map(w => ({ id: 'work-' + digest(imageKey(w.image)).slice(0, 24), ...w, localImage: null, sha256: null }));
  await mkdir(out, { recursive: true });
  if (download) {
    await mkdir(path.join(out, 'images'), { recursive: true });
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/apng': 'png' };
    await mapLimit(works, concurrency, async work => {
      const r = await client.buffer(work.image, { maxBytes: 25 * 1024 * 1024, accept: 'image/*' });
      const ext = r && extensions[r.type.split(';')[0].trim().toLowerCase()];
      if (!ext || !r.buf.length) { report(`Image unavailable or unsupported: ${work.image}`); return; }
      work.sha256 = digest(r.buf);
      work.localImage = `images/${work.sha256}.${ext}`;
      await writeFile(path.join(out, work.localImage), r.buf);
    });
  }
  if (!works.length) report('No artwork candidates found; the site may require scripts or manual additions');
  const gallery = { schema: 'relaygate/gallery/1', generatedAt: new Date().toISOString(), artist: { name: name || author || siteName || new URL(origin).hostname, siteUrl: home.url }, works, gates, warnings: [...new Set(warnings)], stats: { pagesFetched: fetched.size, sitemapsFetched: seenMaps.size, works: works.length } };
  const tmp = path.join(out, `.gallery-${process.pid}-${Date.now()}.tmp`);
  await writeFile(tmp, JSON.stringify(gallery, null, 2) + '\n');
  await rename(tmp, path.join(out, 'gallery.json'));
  return gallery;
}
