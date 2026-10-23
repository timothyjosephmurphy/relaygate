import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { certificateDrafts, createCertificateProofs, printProfile, sheetProfile } from '../src/certificate-proofs.js';

const sample = JSON.parse(await readFile(new URL('./fixtures/certificate-demo.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(sample);

test('proofs require explicit artist review and cannot issue signed records', () => {
  assert.throws(() => certificateDrafts({ ...copy(), mode: 'issued' }), /demo/);
  const unreviewed = copy(); unreviewed.artworks[0].reviewed = false;
  assert.throws(() => certificateDrafts(unreviewed), /reviewed/);
  const signed = copy(); signed.artworks[0].certificateEventId = 'a'.repeat(64);
  assert.throws(() => certificateDrafts(signed), /Issued/);
});

test('unknown physical size stays unknown; metadata and stable demo lookup survive repeat generation', () => {
  const input = copy(); input.artworks[1].pixelSize = '6000x4000'; input.artworks[1].ownerName = 'private owner';
  const drafts = certificateDrafts(input);
  assert.equal(drafts[1].artwork.dimensions, null); assert.equal(drafts[1].certificateEventId, null);
  assert.equal(drafts[1].issuedAt, null); assert.equal(drafts[1].masterCoordinate, null);
  assert.doesNotMatch(JSON.stringify(drafts), /private owner|6000x4000/);
  assert.deepEqual(drafts, certificateDrafts(input)); assert.match(drafts[0].qrPayload, /^https:\/\/example\.invalid\//);
  const changed = copy(); changed.artworks[0].title = 'Corrected title';
  assert.notEqual(certificateDrafts(changed)[0].draftHash, drafts[0].draftHash);
});

test('dimensions require explicit units, IDs are unique, and master references must use the artist key', () => {
  const dimensions = copy(); dimensions.artworks[0].dimensions.unit = 'pixels'; assert.throws(() => certificateDrafts(dimensions), /Physical units/);
  const duplicate = copy(); duplicate.artworks[1].id = duplicate.artworks[0].id; assert.throws(() => certificateDrafts(duplicate), /unique/);
  const input = copy(); input.artist.publicKey = 'a'.repeat(64); input.artworks[0].masterCoordinate = `37441:${'b'.repeat(64)}:blue-field`;
  assert.throws(() => certificateDrafts(input), /artist public key/);
  input.artworks[0].masterCoordinate = `37441:${input.artist.publicKey}:blue-field`;
  assert.equal(certificateDrafts(input)[0].masterReferenceVerification, 'not-verified');
});

test('invalid printer dimensions, fractional dots and impossible sheet offsets fail', () => {
  assert.throws(() => printProfile({ dpi: NaN }), /DPI/);
  assert.throws(() => printProfile({ moduleDots: 2.5 }), /dots/);
  assert.throws(() => printProfile({ widthMm: -10 }), /width/);
  assert.throws(() => printProfile({ widthMm: 300, heightMm: 300, dpi: 1200 }), /megapixel/);
  assert.throws(() => sheetProfile({ firstLabel: 8 }), /offset/);
});

test('generated raster labels decode to the exact demo payload and preserve the four-module quiet zone', async () => {
  const result = await createCertificateProofs(copy());
  for (const layout of result.layouts) {
    const png = PNG.sync.read(result.files.get(`${layout.workId}-${layout.type}.png`));
    assert.equal(png.width, layout.profile.widthPx); assert.equal(png.height, layout.profile.heightPx);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.equal(decoded?.data, layout.qr.payload);
    const q = layout.qr, margin = q.quietZoneModules * q.dotsPerModule;
    for (let y = q.y; y < q.y + q.pixels; y++) for (let x = q.x; x < q.x + q.pixels; x++) {
      if (x < q.x + margin || x >= q.x + q.pixels - margin || y < q.y + margin || y >= q.y + q.pixels - margin) assert.equal(png.data[(y * png.width + x) * 4], 255);
    }
    assert.match(result.files.get(`${layout.workId}-${layout.type}.svg`).toString(), /unsigned demo print proof/);
  }
  const manifest = JSON.parse(result.files.get('proof-manifest.json'));
  for (const entry of manifest.files) assert.equal(createHash('sha256').update(result.files.get(entry.name)).digest('hex'), entry.sha256);
});

test('PDF page dimensions, strip pages and partly-used sticker sheets are exact', async () => {
  const input = copy(); input.artworks = Array.from({ length: 9 }, (_, i) => ({ ...input.artworks[0], id: `edition-${i}`, edition: `${i + 1} / 9` }));
  const result = await createCertificateProofs(input, { sheet: { firstLabel: 7 } });
  const sheets = await PDFDocument.load(result.files.get('sticker-sheet-demo.pdf'));
  assert.equal(sheets.getPageCount(), 2);
  assert.ok(Math.abs(sheets.getPage(0).getWidth() - 210 * 72 / 25.4) < 0.00001);
  assert.ok(Math.abs(sheets.getPage(0).getHeight() - 297 * 72 / 25.4) < 0.00001);
  const strips = await PDFDocument.load(result.files.get('strip-labels-demo.pdf'));
  assert.equal(strips.getPageCount(), 9);
  assert.ok(Math.abs(strips.getPage(0).getHeight() - result.layouts[1].profile.heightPx * 72 / result.layouts[1].profile.dpi) < 0.00001);
  assert.equal(new Set(result.records.map(r => r.lookupCode)).size, 9);
});

test('long text and tiny printable heights fail without clipping or QR scaling', async () => {
  const input = copy(); input.artworks[0].title = 'Very long title '.repeat(16).trim();
  await assert.rejects(createCertificateProofs(input), /overflows/);
  await assert.rejects(createCertificateProofs(copy(), { strip: { heightMm: 12 } }), /quiet zone/);
  await assert.rejects(createCertificateProofs(copy(), { sheet: { columns: 3 } }), /grid exceeds/);
});

test('covered non-Latin names render as vector glyphs; unsupported glyphs fail explicitly', async () => {
  const input = copy(); input.artist.name = 'Мария Иванова'; input.artworks[0].title = 'Тихая вода';
  const result = await createCertificateProofs(input);
  const svg = result.files.get('blue-field-sheet.svg').toString();
  assert.match(svg, /<path d=/); assert.doesNotMatch(svg, /<text /); assert.match(svg, /Мария Иванова/);
  input.artist.name = '山田太郎'; await assert.rejects(createCertificateProofs(input), /font does not cover/);
});
