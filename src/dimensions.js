// Physical dimensions only. Bare numbers and image pixels are not physical size.
const unitFactor = unit => ({ in: 1, inch: 1, inches: 1, '"': 1, '”': 1, inh: 1, cm: 1 / 2.54, cmt: 1 / 2.54, mm: 1 / 25.4, mmt: 1 / 25.4, m: 1 / 0.0254, mtr: 1 / 0.0254 })[String(unit).toLowerCase()];
const round = n => Math.round(n * 1000000) / 1000000;
function quantity(value) {
  if (value && typeof value === 'object') {
    const factor = unitFactor(value.unitCode || value.unitText);
    const n = Number(value.value);
    return factor && Number.isFinite(n) && n > 0 ? { inches: round(n * factor), raw: `${n} ${value.unitText || value.unitCode}` } : null;
  }
  const m = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(inches|inch|in|cm|mm|m|"|”)$/i);
  return m && +m[1] > 0 ? { inches: round(+m[1] * unitFactor(m[2])), raw: String(value) } : null;
}
export function physicalSize(node = {}, description = '') {
  const w = quantity(node.width), h = quantity(node.height);
  if (w && h) return { size: `${w.raw} × ${h.raw}`, sizeIn: { w: w.inches, h: h.inches }, sizeSource: 'structured-width-height' };
  const text = String(description || '').replace(/(\d+(?:\.\d+)?)\s*([wh])\s*(inches|inch|in|cm|mm|m|"|”)(?![a-z])/gi, '$1 $3 $2');
  const labeled = text.match(/(\d+(?:\.\d+)?)\s*(inches|inch|in|cm|mm|m|"|”)?\s*([wh])\s*[×x]\s*(\d+(?:\.\d+)?)\s*(inches|inch|in|cm|mm|m|"|”)?\s*([wh])\b/i);
  const pair = labeled || text.match(/(\d+(?:\.\d+)?)\s*(inches|inch|in|cm|mm|m|"|”)?\s*[×x]\s*(\d+(?:\.\d+)?)\s*(inches|inch|in|cm|mm|m|"|”)(?![a-z])/i);
  if (!pair) return { size: null, sizeIn: null, sizeSource: null };
  if (labeled && pair[3].toLowerCase() !== pair[6].toLowerCase()) {
    const first = quantity(`${pair[1]} ${pair[2] || pair[5]}`), second = quantity(`${pair[4]} ${pair[5] || pair[2]}`);
    if (first && second) return { size: pair[0], sizeIn: pair[3].toLowerCase() === 'w' ? { w: first.inches, h: second.inches } : { w: second.inches, h: first.inches }, sizeSource: 'labeled-text' };
  }
  // Order in unlabelled art captions differs by site. Preserve text for review.
  return { size: pair[0], sizeIn: null, sizeSource: 'text-order-unknown' };
}
