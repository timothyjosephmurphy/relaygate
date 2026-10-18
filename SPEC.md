# Slipgate Gallery — SPEC (v0.1 draft)

Turn an artist's own website into a self-hosted 3D "dungeon" gallery, linked to other artists' galleries through slip gates.

## 1. CLI
```
npx slipgate-gallery <url> [--out dir] [--name "Artist Name"] [--gate-to <url>]...
  --out        output folder (default ./slipgate-out)
  --name       artist name override (else JSON-LD creator / og:site_name / hostname)
  --gate-to    add an outbound gate to another gallery's URL (repeatable)
  --max-pages  crawl cap (default 600)   --delay ms between requests (default 1000)
  --no-download  write gallery.json with remote image URLs only
```

## 2. Pipeline
1. **Import** (`src/importer.js`, built): robots.txt → sitemap.xml (+ image sitemap) → per-page JSON-LD (VisualArtwork/Painting/Product/ImageObject) → Open Graph → Squarespace `?format=json` *only if robots.txt allows it* → `<img>` fallback with size/logo filters. Dedupe by normalized image URL, preferring structured data. Download images at a large size (Squarespace `?format=2500w`). Write `gallery.json`.
2. **Build** (placeholder): `const core = await import('@slipgate/engine-core'); core.build({ gallery, gates, outDir })`. See §8.
3. **Output**: a static folder:
```
out/ index.html  gallery.json  slipgate.json  images/*  engine/* (copied from core)  embed.html
```

## 3. gallery.json
```jsonc
{
  "schema": "slipgate-gallery/1",
  "generatedAt": "ISO-8601",
  "artist": { "name": "TJ Murphy", "siteUrl": "https://tjm.art" },
  "works": [{
    "id": "symbiosis-1",                 // slug, unique in gallery
    "title": "Symbiosis #1",
    "image": "https://…/IMG_1643.jpg",   // original remote URL
    "localImage": "images/symbiosis-1.jpg",
    "page": "https://tjm.art/products/archived-painting-15/",  // the work's own page
    "size": "44.5 in × 24 in",           // human string, as found
    "sizeIn": { "w": 44.5, "h": 24 },    // REQUIRED for room splats (§11); null until known, artist fills in
    "medium": "watercolor", "year": 2021,  // null if unknown — never guessed
    "availability": { "status": "InStock", "price": "1000.00 USD", "shopUrl": "https://…" },
    "project": "Behaviour: Dead by Daylight", // optional, for portfolio-style sites
    "source": "json-ld:VisualArtwork"    // how it was found (debug/QA)
  }]
}
```
Importer emits `size` today; parsing to `sizeIn` + an artist review step (`slipgate-gallery review`) is TODO.

## 4. slipgate.json (published by every gallery at its root)
```json
{ "schema": "slipgate/1", "version": "0.1.0", "id": "tjm-art",
  "name": "TJ Murphy", "url": "https://tjm.art/slipgate/",
  "thumbnail": "https://tjm.art/slipgate/thumb.jpg",
  "gatesOut": [{ "id": "chasetoole", "url": "https://chasetoole.com/slipgate/" }] }
```
Gate rendering fetches the target's slipgate.json (name + thumbnail on the portal). If it can't be fetched, the gate shows the bare URL. Fetching it needs CORS on the target: Pages/Netlify `_headers` file is generated.

## 5. Shared gate directory
- Phase 1: a public git repo `slipgate-directory` with `galleries/<id>.json` = a copy of each slipgate.json, added by PR. CI checks that the URL serves a matching slipgate.json and the domain owner placed it there. Build output = `directory.json`, served statically.
- Phase 2: "random gate" and "neighbors" in-engine pull from directory.json. Galleries opt in (`"listed": true`).
- Moderation: maintainers can delist. Signed manifests are not in v1.

## 6. Referral tagging
Every outbound gate and every painting link gets `?ref=slipgate&from=<gallery-id>` (plus `&work=<id>` on painting links). Artists see this in any analytics (Cloudflare Web Analytics, Plausible, GA, Squarespace/Shopify UTM-ish reports). Gates also set `utm_source=slipgate&utm_medium=gate&utm_campaign=<from>` (open question Q3). No cookies, no tracking pixel of our own.

## 7. Deploy targets
- **Cloudflare Pages**: `npx wrangler pages deploy slipgate-out --project-name <id>` or drag-and-drop in the dashboard.
- **Netlify**: `npx netlify deploy --dir slipgate-out --prod` or Netlify Drop.
- **Any static host**: upload the folder to `/slipgate/` on your site (S3, GitHub Pages, cPanel…). Relative paths only.
- **Embed** (Squarespace code block, WordPress, etc.):
```html
<iframe src="https://YOUR-GALLERY/slipgate/?embed=1" style="width:100%;aspect-ratio:16/9;border:0" allow="fullscreen; xr-spatial-tracking" loading="lazy" title="3D gallery"></iframe>
```

## 8. First visit: "just the art"
- Default is a calm walk-through: no HUD, no enemies or score, soft lighting, click a painting for title/size/medium and a **"View on artist's site"** link (its `page`, referral-tagged).
- The game layer (quests, eggs, movement tricks) is opt-in via a small "Play" toggle, remembered in localStorage.
- Works without WebGL: a fallback grid of works linking to their pages (also good for SEO/accessibility).

## 9. Engine core interface (for Studio manager)
```ts
interface SlipgateCore {
  version: string;
  loadGallery(gallery: GalleryJson, opts?: { baseUrl?: string }): Promise<void>;
  layout(works: Work[], opts?: { seed?: string; style?: 'dungeon' }): Layout; // deterministic
  addGates(gates: { id: string; url: string; name?: string; thumbnail?: string }[]): void;
  mount(el: HTMLElement, opts: { mode: 'calm' | 'game'; onWorkClick(w: Work): void; onGateEnter(g): void }): void;
  build?(args: { gallery; gates; outDir }): Promise<void>; // node-side: copies runtime assets
}
type Layout = { rooms: { id; bounds }[]; placements: { workId; roomId; wall; position: [x,y,z]; sizeM: [w,h] }[]; gateSlots: { position; roomId }[] };
```
Works with `sizeIn` hang at true scale; unknown sizes use a default by aspect ratio (long side 1 m).

## 10. Permissions & politeness
- The artist runs the tool on **their own site** (CLI prints this; a `--i-own-this-site` confirm is TODO).
- Honors robots.txt (own UA group, else `*`, longest-match, `*`/`$` wildcards). Identifies as `SlipgateGalleryImporter/0.1 (+url)`. Default 1 req/s, sequential.
- Downloads only public images. Any 401/403 is skipped, no cookies/credentials ever sent, no login flows.
- Note: Squarespace's default robots.txt **disallows `?format=json`**, so on stock Squarespace sites that path is skipped and we use the sitemap + HTML instead.

## 11. Future: room splats (design note, no code)
"Try it on my wall": the visitor films their room on a phone → Gaussian splat (Scaniverse, Polycam, Luma, Postshot) → a browser viewer (three.js + Spark or GaussianSplats3D) loads the `.ply/.splat/.spz`.
- **Pick paintings** from any gallery in the network (directory.json → gallery.json) and hang them at true size.
- **Scale calibration**: LiDAR/ARKit captures are already metric, so use them as they are. Otherwise the user marks a known length (default prompt: a door = 80 in) and we store `scale` (scene units → metres) in `room.json`.
- **Wall picking**: tap → raycast against splat points → RANSAC plane fit on nearby points → wall normal + up vector. The painting snaps flush and at eye height (57 in center by default), and can be dragged on the plane.
- **Sizes** come from `gallery.json` `works[].sizeIn` (inches). This makes **real size a required field** for a work to be room-hangable. Works without it are shown but disabled ("size unknown").
- **"View in my room"** link on each painting page/panel: `…/room/?gallery=<url>&work=<id>`.
- **Privacy**: the room file stays on the user's device (opened via file picker, IndexedDB cache) or their own storage URL. It is never uploaded to us by default. `room.json` = `{ splatUrl|local, scale, walls:[{point,normal}], hung:[{gallery, workId, wall, pos}] }`.
- **Buy links**: each hung painting keeps its `page`/`shopUrl` with `?ref=slipgate&from=room`.

## 12. Bitcoin-native design
- **License**: MIT. Public repo later, not now (local git only for now).
- **Gate directory on Nostr** (replaces/augments §5): each gallery publishes its slipgate.json as a *parameterized replaceable event* (likely kind 30078 or a new 3xxxx kind, with `d`=gallery id: **research**) signed by the artist's npub. Viewers discover gates by querying a few public relays, and §5's directory.json / plain `slipgate.json` stays as a fallback. We run no central server. The signing UX for non-technical artists (NIP-07 browser extension vs. nsec in CLI vs. NIP-46 remote signer) needs **research**.
- **Payments**: `gallery.json.artist.lightningAddress` (LUD-16). Painting panels offer **zap** (NIP-57; the zap request can tag the work via an `a`/`r` tag, exact tagging is **research**). Gates offer a tip. Checkout = link to the artist's own BTCPay Server store, a Lightning invoice/LNURL-pay, or their existing shop (`availability.shopUrl`). We never touch funds.
- **Referral splits** (optional, artist-set %): when a visitor arrives via `?ref=slipgate&from=<id>` and zaps/buys, the client pays the referring gallery's Lightning address its share directly, as a second payment from the visitor's wallet or zap splits (NIP-57 `zap` tag weights, **research** wallet support). For BTCPay sales, a split needs a server-side payout by the artist's own BTCPay (plugin? **research**). Non-custodial throughout. Honest limits: client-side referral attribution is trust-based and spoofable, so keep the default share small (**open question**).
- **Identity**: `artist.npub` (+ optional `artist.nip05`, verified by fetching `/.well-known/nostr.json` on the artist's own domain, which also proves domain ownership for the directory).
- Schema additions: `artist: { name, siteUrl, npub?, nip05?, lightningAddress?, btcpayUrl?, referralSharePct? }`.

## 13. Open questions
- Q1 (TJ): Which pages count as "works" on tjm.art: originals only, or also book-art, prints, murals? There are 366 /products/ pages, including archived works.
- Q2 (TJ): For Squarespace sites the stock robots.txt blocks `?format=json`. Is HTML-only acceptable, or should the artist (as site owner) be allowed `--allow-own-json`?
- Q3 (TJ): Is UTM in addition to `ref/from` OK, or keep it to `ref/from` only?
- Q4 (TJ): Who runs the directory repo / domain (slipgate.art? tjm.art/slipgate)?
- Q5 (Studio manager): Package name and how core ships (npm package vs. vendored `engine/` folder)? Is the §9 interface acceptable? Who computes layout?
- Q6 (Studio manager): Image budget: max texture size / count per room (we download ~2500 px).
- Q8 (TJ): Default referral %, and should it apply to sales (needs artist-side BTCPay automation) or zaps only at first?
- Q9 (TJ): Which relays to default to? Should the directory event kind be custom or reuse an existing NIP?
- Q7: Portfolio sites (e.g. chasetoole) have many images per project with filename-only alts. Should one work = one project (cover image) or every image?
