import { validateGallery, webUrl, relativeFile } from './gallery-contract.js';

// A clean data adapter for the shared Three.js engine's painting fields.
// Museum geometry, collisions, gates and engine assets remain engine-owned.
export function toEnginePaintings(input, slots, { baseUrl } = {}) {
  const gallery = validateGallery(input);
  const base = new URL(webUrl(baseUrl, 'Gallery base URL'));
  if (!base.pathname.endsWith('/') || base.search || base.hash) throw new Error('Gallery base URL must name a directory without query or fragment');
  if (!Array.isArray(slots) || slots.length < gallery.works.length) throw new Error('Not enough wall slots; no artwork was silently dropped');
  const placements = gallery.works.map((work, i) => {
    const slot = slots[i];
    for (const key of ['x', 'y', 'z', 'ix', 'iz', 'fy', 'maxWidth', 'maxHeight']) {
      if (!Number.isFinite(slot?.[key]) || Math.abs(slot[key]) > 10000) throw new Error(`Invalid ${key} in wall slot ${i}`);
    }
    if (slot.maxWidth <= 0.04 || slot.maxHeight <= 0.04 || Math.hypot(slot.ix, slot.iz) < 0.001) throw new Error(`Invalid dimensions or normal in wall slot ${i}`);
    if (typeof slot.room !== 'string' || !slot.room || slot.room.length > 100) throw new Error(`Invalid room in wall slot ${i}`);
    const pixels = work.pixelSize?.match(/^(\d{1,6})x(\d{1,6})$/);
    const pixelRatio = pixels && +pixels[1] > 0 && +pixels[2] > 0 ? +pixels[1] / +pixels[2] : 1;
    // Unknown sizes are display estimates. Pixels only inform aspect ratio.
    const rawW = work.sizeIn ? work.sizeIn.w * 0.0254 : Math.min(4, Math.max(0.1, pixelRatio));
    const rawH = work.sizeIn ? work.sizeIn.h * 0.0254 : 1;
    const scale = Math.min(1, (slot.maxWidth - 0.04) / rawW, (slot.maxHeight - 0.04) / rawH);
    const w = rawW * scale, h = rawH * scale, normal = Math.hypot(slot.ix, slot.iz);
    const img = work.localImage ? new URL(relativeFile(work.localImage), base).href : work.image;
    return { id: work.id, title: work.title, sub: [work.medium, work.size || 'Physical size unknown'].filter(Boolean).join(' · '), url: work.page || gallery.artist.siteUrl, img, mid: img, hi: img, thumb: img, x: slot.x, y: slot.y, z: slot.z, ix: slot.ix / normal, iz: slot.iz / normal, fy: slot.fy, room: slot.room, w, h, fw: w + 0.04, fh: h + 0.04, physicalSizeIn: work.sizeIn, displayScale: scale, estimatedDisplaySize: !work.sizeIn, missingMedia: !img, needsReview: !work.reviewed };
  });
  return { schema: 'relaygate/engine-paintings/1', paintings: placements, gates: gallery.gates, warnings: ['Painting data only: the engine must supply layout, collision geometry and assets.', 'Unsigned web gates are not verified Nostr artist relationships.'] };
}
