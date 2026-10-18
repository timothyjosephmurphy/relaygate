import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { extractFromHtml, parseSitemapXml, dedupeByPage } from '../src/importer.js';
import { parseRobots, UA } from '../src/http.js';

const fix = (...p) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', ...p), 'utf8');

describe('User-Agent', () => {
  it('identifies as RelayGateImporter', () => {
    assert.match(UA, /^RelayGateImporter\//);
    assert.doesNotMatch(UA, /slipgate/i);
  });
});

describe('parseRobots', () => {
  const rb = parseRobots(fix('robots.txt'));

  it('reads sitemap URLs', () => {
    assert.deepEqual(rb.sitemaps, ['https://studio.example/sitemap.xml']);
  });

  it('applies User-agent specific disallow for our token', () => {
    assert.equal(rb.allows('/private/secret'), false);
    assert.equal(rb.allows('/work/blue-field'), true);
  });

  it('allows paths with no matching disallow', () => {
    assert.equal(rb.allows('/'), true);
  });

  it('empty robots allows everything', () => {
    const empty = parseRobots('');
    assert.equal(empty.allows('/anything'), true);
    assert.deepEqual(empty.sitemaps, []);
  });
});

describe('parseSitemapXml', () => {
  it('parses urlset with image locs', () => {
    const { indexLocs, pages } = parseSitemapXml(fix('sitemap.xml'));
    assert.deepEqual(indexLocs, []);
    assert.equal(pages.size, 2);
    assert.deepEqual(pages.get('https://studio.example/work/blue-field'), [
      'https://studio.example/images/blue-field.jpg',
    ]);
    assert.deepEqual(pages.get('https://studio.example/work/red-horizon'), []);
  });

  it('parses sitemap index locs', () => {
    const { indexLocs, pages } = parseSitemapXml(fix('sitemap-index.xml'));
    assert.deepEqual(indexLocs, ['https://studio.example/sitemap-works.xml']);
    assert.equal(pages.size, 0);
  });
});

describe('extractFromHtml JSON-LD', () => {
  const page = 'https://studio.example/work/blue-field';
  const { works, author, siteName } = extractFromHtml(fix('artwork-page.html'), page);

  it('extracts Painting from JSON-LD', () => {
    assert.equal(works.length, 1);
    const w = works[0];
    assert.equal(w.title, 'Blue Field');
    assert.equal(w.image, 'https://studio.example/images/blue-field.jpg');
    assert.equal(w.page, 'https://studio.example/work/blue-field');
    assert.equal(w.medium, 'acrylic on canvas');
    assert.equal(w.year, 2021);
    assert.equal(w.size, '36 in × 24 in');
    assert.equal(w.availability?.price, '1200 USD');
    assert.match(w.source, /^json-ld:/);
  });

  it('reads author and site name', () => {
    assert.equal(author, 'Ada Artist');
    assert.equal(siteName, 'Studio Example');
  });
});

describe('extractFromHtml img fallback + skip attrs', () => {
  const page = 'https://studio.example/works';
  const { works } = extractFromHtml(fix('img-only-page.html'), page);

  it('keeps large non-junk images and skips logos/small/explicit skips', () => {
    const titles = works.map(w => w.title).sort();
    assert.deepEqual(titles, ['Red Horizon']);
    assert.equal(works[0].source, 'img');
  });
});

describe('dedupeByPage', () => {
  it('drops img candidates when the page already has json-ld', () => {
    const works = [
      { title: 'A', page: 'https://ex/a', source: 'json-ld:Painting' },
      { title: 'A img', page: 'https://ex/a', source: 'img' },
      { title: 'B', page: 'https://ex/b', source: 'img' },
    ];
    const out = dedupeByPage(works);
    assert.deepEqual(out.map(w => w.title), ['A', 'B']);
  });
});
