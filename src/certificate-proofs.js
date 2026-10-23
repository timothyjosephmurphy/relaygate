// Offline, unsigned DEMO proofs only. Issuance requires a separate external
// signer and verified event archive; this module cannot issue a certificate.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { PDFDocument, rgb } from 'pdf-lib';

const mmToPt = mm => mm * 72 / 25.4;
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const string = (value, name, max = 300) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${name} must be non-empty text of at most ${max} characters`);
  return value.trim();
};
const number = (value, name, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
};
const integer = (value, name, min, max) => {
  number(value, name, min, max); if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`); return value;
};

export function certificateDrafts(input) {
  if (input?.schema !== 'relaygate/certificate-proofs/1' || input.mode !== 'demo') throw new Error('Only relaygate/certificate-proofs/1 in demo mode is supported; no certificate can be issued');
  const artist = { name: string(input.artist?.name, 'Artist name'), publicKey: input.artist?.publicKey ?? null };
  if (artist.publicKey != null && !/^[a-f0-9]{64}$/.test(artist.publicKey)) throw new Error('Artist public key must be lowercase hex');
  if (!Array.isArray(input.artworks) || !input.artworks.length || input.artworks.length > 100) throw new Error('Provide 1 to 100 reviewed artworks');
  const ids = new Set();
  return input.artworks.map(work => {
    if (work?.reviewed !== true) throw new Error('Each artwork must be explicitly reviewed before making a print proof');
    const id = string(work.id, 'Artwork ID', 100);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id) || ids.has(id)) throw new Error('Artwork IDs must be unique safe identifiers');
    ids.add(id);
    if (work.certificateEventId != null || work.signature != null || work.sig != null) throw new Error('Issued records are not accepted by the DEMO proof tool');
    let dimensions = null;
    if (work.dimensions != null) {
      if (!['mm', 'cm', 'in'].includes(work.dimensions.unit)) throw new Error('Physical units must be mm, cm or in');
      dimensions = { width: number(work.dimensions.width, 'Physical width', 0.01, 100000), height: number(work.dimensions.height, 'Physical height', 0.01, 100000), unit: work.dimensions.unit };
    }
    const masterCoordinate = work.masterCoordinate == null ? null : string(work.masterCoordinate, 'Master coordinate', 600);
    if (masterCoordinate) {
      const match = masterCoordinate.match(/^(3\d{4}):([a-f0-9]{64}):(.+)$/);
      if (!match || !artist.publicKey || match[2] !== artist.publicKey) throw new Error('Master coordinate must reference an addressable event under the supplied artist public key');
    }
    const record = { schema: 'relaygate/certificate-draft/1', status: 'unsigned-demo', artist, artwork: { id, title: string(work.title, 'Artwork title'), year: work.year == null ? null : string(String(work.year), 'Year', 40), medium: work.medium == null ? null : string(work.medium, 'Medium', 150), dimensions, edition: work.edition == null ? null : string(work.edition, 'Edition', 100) }, masterCoordinate, masterReferenceVerification: 'not-verified', certificateEventId: null, issuedAt: null };
    const digest = hash(JSON.stringify(record));
    return { ...record, draftHash: digest, lookupCode: `DEMO-${digest.slice(0, 12).toUpperCase()}`, qrPayload: `https://example.invalid/relaygate-demo/${digest.slice(0, 24)}` };
  });
}

export function printProfile(input = {}) {
  const profile = { dpi: 300, moduleDots: 4, widthMm: 90, heightMm: 55, marginMm: 3, fontPt: 9, ...input };
  integer(profile.dpi, 'DPI', 150, 1200); integer(profile.moduleDots, 'QR dots per module', 3, 20);
  number(profile.widthMm, 'Label width', 20, 300); number(profile.heightMm, 'Label height', 12, 300);
  number(profile.marginMm, 'Printable margin', 1, 30); number(profile.fontPt, 'Font size', 6, 18);
  const widthPx = Math.round(profile.widthMm * profile.dpi / 25.4), heightPx = Math.round(profile.heightMm * profile.dpi / 25.4);
  if (widthPx * heightPx > 12_000_000) throw new Error('Label raster exceeds the 12 megapixel limit');
  return { ...profile, widthPx, heightPx, actualWidthMm: widthPx * 25.4 / profile.dpi, actualHeightMm: heightPx * 25.4 / profile.dpi, marginPx: Math.ceil(profile.marginMm * profile.dpi / 25.4) };
}

export function sheetProfile(input = {}) {
  const sheet = { widthMm: 210, heightMm: 297, columns: 2, rows: 4, marginLeftMm: 12, marginTopMm: 12, gapXMm: 5, gapYMm: 5, firstLabel: 0, ...input };
  number(sheet.widthMm, 'Sheet width', 50, 1000); number(sheet.heightMm, 'Sheet height', 50, 1000);
  integer(sheet.columns, 'Columns', 1, 10); integer(sheet.rows, 'Rows', 1, 20); integer(sheet.firstLabel, 'First label offset', 0, sheet.rows * sheet.columns - 1);
  for (const key of ['marginLeftMm', 'marginTopMm', 'gapXMm', 'gapYMm']) number(sheet[key], key, 0, 100);
  return sheet;
}

function textWidth(font, text, pixels) {
  return font.layout(text).positions.reduce((sum, position) => sum + position.xAdvance, 0) * pixels / font.unitsPerEm;
}

function wrap(font, text, width, pixels) {
  const lines = []; let line = '';
  const segments = [...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(text)].map(s => s.segment);
  for (const grapheme of segments) {
    if (line && textWidth(font, line + grapheme, pixels) > width) { lines.push(line.trimEnd()); line = ''; }
    if (textWidth(font, grapheme, pixels) > width) throw new Error('Label text column is too narrow');
    line += grapheme;
  }
  if (line) lines.push(line.trim());
  return lines;
}

function glyphPaths(font, text, x, baseline, pixels) {
  const run = font.layout(text), scale = pixels / font.unitsPerEm; let cursor = x;
  return run.glyphs.map((glyph, i) => {
    if (glyph.id === 0) throw new Error(`Selected font does not cover all characters in: ${text}`);
    const position = run.positions[i];
    const path = `<path d="${glyph.path.toSVG()}" transform="translate(${cursor + position.xOffset * scale} ${baseline - position.yOffset * scale}) scale(${scale} ${-scale})"/>`;
    cursor += position.xAdvance * scale;
    return path;
  }).join('');
}

export function labelSvg(record, profileInput, font) {
  const profile = printProfile(profileInput), qr = QRCode.create(record.qrPayload, { errorCorrectionLevel: 'M' });
  const quiet = 4, module = profile.moduleDots, qrPixels = (qr.modules.size + quiet * 2) * module;
  const availableHeight = profile.heightPx - 2 * profile.marginPx;
  if (qrPixels > availableHeight) throw new Error(`QR including its four-module quiet zone needs ${(qrPixels * 25.4 / profile.dpi).toFixed(2)} mm of printable height; change the profile`);
  const qrX = profile.marginPx, qrY = Math.floor((profile.heightPx - qrPixels) / 2);
  const textX = qrX + qrPixels + profile.marginPx, textWidthPx = profile.widthPx - profile.marginPx - textX;
  if (textWidthPx < profile.dpi / 2) throw new Error('Label needs at least 12.7 mm for text beside the QR');
  const size = profile.fontPt * profile.dpi / 72, lineHeight = size * 1.25;
  const dims = record.artwork.dimensions;
  const dimensionText = dims ? `${dims.width} x ${dims.height} ${dims.unit} (W x H)` : 'Physical size unknown';
  const sizeLines = profile.compact ? [[dimensionText, record.artwork.edition].filter(Boolean).join(' | ')] : [dimensionText, record.artwork.edition];
  const sections = ['DEMO - NOT ISSUED', record.artist.name, record.artwork.title, [record.artwork.year, record.artwork.medium].filter(Boolean).join(' | '), ...sizeLines, record.lookupCode].filter(Boolean);
  const lines = sections.flatMap(text => wrap(font, text, textWidthPx, size));
  if (lines.length * lineHeight > availableHeight) throw new Error(`Label text overflows (${lines.length} lines). Increase label length/height, reduce font size, or use a shorter artist-approved title; nothing was truncated`);
  const top = Math.max(profile.marginPx, (profile.heightPx - lines.length * lineHeight) / 2);
  const squares = [];
  for (let y = 0; y < qr.modules.size; y++) for (let x = 0; x < qr.modules.size; x++) if (qr.modules.get(y, x)) squares.push(`<rect x="${qrX + (x + quiet) * module}" y="${qrY + (y + quiet) * module}" width="${module}" height="${module}"/>`);
  const textPaths = lines.map((line, i) => glyphPaths(font, line, textX, top + i * lineHeight + size, size)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.actualWidthMm}mm" height="${profile.actualHeightMm}mm" viewBox="0 0 ${profile.widthPx} ${profile.heightPx}" role="img"><title>${esc(record.artwork.title)} - unsigned demo print proof</title><desc>${esc(sections.join('; '))}. QR is a demo address, not a live verification record.</desc><rect width="100%" height="100%" fill="white"/><g fill="black">${squares.join('')}${textPaths}</g></svg>`;
  return { svg, profile, qr: { payload: record.qrPayload, modules: qr.modules.size, quietZoneModules: quiet, dotsPerModule: module, x: qrX, y: qrY, pixels: qrPixels }, lines };
}

function monochromePng(svg, profile) {
  const rgba = PNG.sync.read(new Resvg(svg, { fitTo: { mode: 'width', value: profile.widthPx }, font: { loadSystemFonts: false } }).render().asPng());
  for (let i = 0; i < rgba.data.length; i += 4) {
    const value = rgba.data[i] < 128 ? 0 : 255; rgba.data[i] = value; rgba.data[i + 1] = value; rgba.data[i + 2] = value; rgba.data[i + 3] = 255;
  }
  return PNG.sync.write(rgba);
}

async function labelsPdf(labels, sheetInput) {
  const pdf = await PDFDocument.create(); pdf.setTitle('Relay Gate - unsigned DEMO label proofs'); pdf.setSubject('Not issued; print at 100% actual size');
  if (!sheetInput) {
    for (const label of labels) {
      const width = mmToPt(label.profile.actualWidthMm), height = mmToPt(label.profile.actualHeightMm);
      const page = pdf.addPage([width, height]); page.drawImage(await pdf.embedPng(label.png), { x: 0, y: 0, width, height });
    }
  } else {
    const sheet = sheetProfile(sheetInput), first = labels[0].profile, w = first.actualWidthMm, h = first.actualHeightMm;
    if (sheet.marginLeftMm + sheet.columns * w + (sheet.columns - 1) * sheet.gapXMm > sheet.widthMm || sheet.marginTopMm + sheet.rows * h + (sheet.rows - 1) * sheet.gapYMm > sheet.heightMm) throw new Error('Label grid exceeds the sheet dimensions');
    let page, pageIndex = -1;
    for (let i = 0; i < labels.length; i++) {
      const slot = i + sheet.firstLabel, nextPage = Math.floor(slot / (sheet.columns * sheet.rows)), inPage = slot % (sheet.columns * sheet.rows);
      if (nextPage !== pageIndex) { page = pdf.addPage([mmToPt(sheet.widthMm), mmToPt(sheet.heightMm)]); pageIndex = nextPage; }
      const x = sheet.marginLeftMm + (inPage % sheet.columns) * (w + sheet.gapXMm);
      const top = sheet.marginTopMm + Math.floor(inPage / sheet.columns) * (h + sheet.gapYMm);
      page.drawImage(await pdf.embedPng(labels[i].png), { x: mmToPt(x), y: mmToPt(sheet.heightMm - top - h), width: mmToPt(w), height: mmToPt(h) });
    }
  }
  return Buffer.from(await pdf.save());
}

async function calibrationPdf(fontBytes) {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const page = pdf.addPage([mmToPt(210), mmToPt(297)]), font = await pdf.embedFont(fontBytes, { subset: true });
  page.drawText('Relay Gate print calibration - DEMO', { x: mmToPt(20), y: mmToPt(270), font, size: 16 });
  page.drawText('Print at 100% / actual size. Disable fit-to-page.', { x: mmToPt(20), y: mmToPt(255), font, size: 11 });
  page.drawText('The ruler below must measure exactly 100 mm.', { x: mmToPt(20), y: mmToPt(245), font, size: 11 });
  page.drawLine({ start: { x: mmToPt(20), y: mmToPt(220) }, end: { x: mmToPt(120), y: mmToPt(220) }, thickness: 0.5, color: rgb(0, 0, 0) });
  for (let i = 0; i <= 100; i++) page.drawLine({ start: { x: mmToPt(20 + i), y: mmToPt(220) }, end: { x: mmToPt(20 + i), y: mmToPt(220 - (i % 10 === 0 ? 5 : 2)) }, thickness: 0.4 });
  page.drawText('0', { x: mmToPt(19), y: mmToPt(208), font, size: 10 }); page.drawText('100 mm', { x: mmToPt(116), y: mmToPt(208), font, size: 10 });
  page.drawText('Check sheet alignment on plain paper before using labels.', { x: mmToPt(20), y: mmToPt(185), font, size: 11 });
  page.drawText('Test scans on two phones. Do not attach demo proofs to artwork.', { x: mmToPt(20), y: mmToPt(175), font, size: 11 });
  return Buffer.from(await pdf.save());
}

export async function createCertificateProofs(input, { label = {}, sheet = {}, strip = {}, fontBytes } = {}) {
  const records = certificateDrafts(input), bytes = fontBytes || await readFile(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url));
  const font = fontkit.create(bytes), files = new Map(), sheetLabels = [], stripLabels = [], layouts = [];
  for (const record of records) {
    const sheetLayout = labelSvg(record, label, font);
    const stripLayout = labelSvg(record, { widthMm: 120, heightMm: 24, marginMm: 2, fontPt: 7, compact: true, ...strip }, font);
    for (const [type, layout, collection] of [['sheet', sheetLayout, sheetLabels], ['strip', stripLayout, stripLabels]]) {
      const png = monochromePng(layout.svg, layout.profile), base = `${record.artwork.id}-${type}`;
      files.set(`${base}.svg`, Buffer.from(layout.svg)); files.set(`${base}.png`, png); collection.push({ ...layout, png });
      layouts.push({ workId: record.artwork.id, type, profile: layout.profile, qr: layout.qr, lines: layout.lines });
    }
    files.set(`${record.artwork.id}-draft.json`, json(record));
  }
  files.set('sticker-sheet-demo.pdf', await labelsPdf(sheetLabels, sheet));
  files.set('strip-labels-demo.pdf', await labelsPdf(stripLabels));
  files.set('print-calibration.pdf', await calibrationPdf(bytes));
  files.set('proof-manifest.json', json({ schema: 'relaygate/print-proofs/1', status: 'unsigned-demo', warning: 'No certificate was issued. QR addresses use reserved example.invalid and do not verify a painting.', layouts, files: [...files].map(([name, data]) => ({ name, bytes: data.length, sha256: hash(data) })) }));
  return { files, records, layouts };
}
