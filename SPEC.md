# Relay Gate — SPEC (v0.2 draft, Nostr-first)

> **Project name: Relay Gate.**
> Package/CLI: `relaygate`. Gallery schema id: `relaygate/1`. Skip attribute: `data-relaygate-skip`
> (deprecated alias `data-slipgate-skip` still accepted).

Relay Gate turns an artist's own website into a walkable 3D gallery, publishes it to **Nostr** under the artist's own key, and links artists to each other through **gates**. There is no central server: galleries are signed Nostr events, images sit on Blossom or the artist's site, discovery runs over relays, and money goes straight to the artist over Lightning. Every payment is written to the artist's books.

Owner and maintainer: TJ Murphy (sole proprietor). License: MIT.

---

## 1. Goal and one-command flow
```
npx relaygate <url> [--out dir] [--name "Artist"] [--gate-to <npub|naddr|url>]... [--publish] [--relays wss://…,…]
  --max-pages 600  --delay 1000 ms  --no-download  --blossom <server-url>  --static (also write a static site)
```
1. **Import** (built, `src/importer.js`): robots.txt → sitemap (+ image sitemap) → JSON-LD (VisualArtwork/Painting/Product/ImageObject) → Open Graph → Squarespace `?format=json` *only if robots.txt allows* → `<img>` fallback with size/logo filters. Dedupe by normalized URL, preferring structured data. **Every image on the site counts as its own work** (TJ, Oct 18 2026). Output: `gallery.json` (local working copy; schema in §3.6).
2. **Review** (`relaygate review`, TODO): the artist fills in real size, medium, year and price. Unknown fields stay null and are never guessed.
3. **Publish** (`--publish`, M1): upload images to Blossom (or keep the artist's site URLs), sign the events in §3 through the artist's signer (§2), and send them to the artist's relays (NIP-65) plus the defaults.
4. **View**: any Relay Gate viewer opens `naddr1…` (or `https://viewer/#naddr1…`) and loads the gallery from relays (§4). With `--static`, the same folder also deploys to Cloudflare Pages, Netlify, GitHub Pages, an nsite (NIP-5A on Blossom), or `/relaygate/` on the artist's site, and can be embedded with an `<iframe>`.

**First visit: "just the art."** It is a calm walk-through with no HUD. Click a painting to see its title, size, medium, and **View on artist's site**, **Zap**, **Buy** (§5). The game layer (cleanup elves after paint splats, wand, buy scanner, quests) is behind a "Play" toggle. Without WebGL you get a fallback grid of works.

## 2. Identity
- **Artist = Nostr keypair.** The gallery's author is the artist's `npub`. A gate links two keys, not two domains.
- **NIP-05** (`artist@domain`), checked through `https://<domain>/.well-known/nostr.json`, proves the artist controls their website domain. The viewer shows a verified badge; the importer warns when the imported site's domain ≠ the NIP-05 domain.
- **The tool never sees the nsec.** Signing goes through:
  - **NIP-46 remote signer** (bunker URL or `nostrconnect://` QR, e.g. Amber, nsec.app). This is the default for the CLI.
  - **NIP-07 browser extension** (Alby, nos2x) when publishing from the web publisher page.
  - New artists: the docs point to a signer app that creates the key on the artist's own device. We never generate or store keys for them.
- Profile (kind 0) stays the artist's own. We read `name`, `picture`, `lud16` and `nip05` from it and only write it if the artist asks.

## 3. Data on Nostr
| What | Event | NIP | Why |
|---|---|---|---|
| Gallery manifest | **kind 37440** (proposed, addressable, `d` = gallery id) | new draft NIP "Relay Gate galleries" | No existing kind models an ordered, spatial gallery with gates. NIP-51 picture sets (30006) don't carry layout or gates, and NIP-78 (30078) is app-private by design. 37440 is unregistered in the NIPs README as of Oct 18 2026; we claim it with the draft NIP. |
| Each work | **kind 20** picture event | NIP-68 (+ NIP-94 `imeta` fields) | Works show up in picture-first clients (Olas etc.) for free. `imeta` carries url, `x` (sha256), `m`, `dim`, `alt`. |
| Work for sale | **kind 30402** classified listing (`d` = work id) | NIP-99 | Standard addressable listing with `price` and `status` tags, so price and availability change without re-publishing the picture. |
| Images | Blossom blob (sha256-addressed) or the artist's own URL | NIP-B7 (Blossom). NIP-96 is now unrecommended | Hash = identity, so any mirror works. The viewer checks `x` against the downloaded bytes. |
| Gates | `a` tags in the manifest → other artists' `37440:<pubkey>:<d>` (shared as `naddr`) | NIP-01 / NIP-19 | A gate is a signed pointer from one artist to another. |
| Viewer app | kind 31990 handler for kind 37440 | NIP-89 | Any client can offer "open in 3D". |
| Relays | kind 10002 | NIP-65 | Outbox model: fetch each artist's events from their own write relays. |
| Discovery | the artist's follows (kind 3), NIP-51 follow sets (30000) used as curated "gate rings", plus relay queries `{kinds:[37440]}` | NIP-02, NIP-51 | No directory server. |

### 3.1 Manifest (kind 37440)
```jsonc
{ "kind": 37440, "content": "<artist statement, markdown>",
  "tags": [
    ["d", "tjm-art"], ["title", "TJ Murphy"], ["image", "<thumbnail url>", "<sha256>"],
    ["r", "https://tjm.art"],                       // source site (matches NIP-05 domain)
    ["e", "<kind-20 id>", "<relay>", "symbiosis-1"],  // works, in hang order
    ["a", "30402:<artist-pk>:symbiosis-1", "<relay>"],// sale listing, if any
    ["a", "37440:<other-pk>:chasetoole", "<relay>", "gate"],  // outbound gate
    ["layout", "dungeon", "<seed>"],                // deterministic layout hint (§4)
    ["zap", "<artist-pk>", "<relay>", "90"], ["zap", "<platform-or-ref-pk>", "<relay>", "10"], // optional split (§5)
    ["L", "relaygate"], ["l", "gallery/1", "relaygate"], ["alt", "Relay Gate 3D gallery: TJ Murphy"] ] }
```
### 3.2 Work (kind 20) extra tags
`["title", …]`, `["imeta", "url …", "x <sha256>", "m image/jpeg", "dim 2500x1348", "alt …"]`, `["size", "113", "61", "cm"]` (real w × h, units `cm|in`; missing tag = unknown), `["medium", "watercolor"]`, `["year", "2021"]`, `["r", "<work page on artist site>"]`, `["a", "37440:<pk>:<d>"]` (back-link to gallery). Corrections mean re-publishing plus a NIP-09 delete of the old event, and the manifest gets the new id.
### 3.3 Sale listing (kind 30402)
NIP-99 tags `title`, `price` (`["price","1000","USD"]` or `"SAT"`), `status` (`active|sold`), `image`, `r` (shop URL), plus `["e", <kind-20 id>]`.
### 3.4 Hosting
- Images go to Blossom (the artist picks servers; BUD-03 server list) or stay on the artist's site. The viewer falls back across mirrors by hash.
- Optional static fallback: `--static` writes `index.html`, `gallery.json`, `images/`, `engine/`. It is fully usable without relays and can be deployed as an nsite.
### 3.5 Relays
Publish to the artist's NIP-65 write relays plus 2–3 defaults (to decide, Q4). Viewers read the manifest author's write relays first.
### 3.6 `gallery.json` (local + static fallback)
Kept from v0.1: `{ schema, generatedAt, artist:{name, siteUrl, npub, nip05, lud16, btcpayUrl, referralSharePct}, works:[{id, title, image, localImage, sha256, page, size, sizeIn:{w,h}|null, medium|null, year|null, availability:{status, price, shopUrl}, project, source}] }`. `publish` maps it 1:1 onto §3.1–3.3.

## 4. Engine interface and loading from relays
The 3D engine/shared core is built separately (Studio manager). The interface below is the contract.
```ts
interface GateCore {
  version: string;
  loadGallery(g: GalleryJson, opts?: { baseUrl?: string }): Promise<void>;
  loadFromNostr(naddr: string, opts?: { relays?: string[]; timeoutMs?: number }): Promise<GalleryJson>; // M2
  layout(works: Work[], opts?: { seed?: string; style?: 'dungeon' }): Layout;   // deterministic: same seed → same rooms
  addGates(gates: { id: string; naddr?: string; url?: string; name?: string; thumbnail?: string }[]): void;
  mount(el: HTMLElement, opts: { mode: 'calm'|'game'; onWorkClick(w: Work): void; onGateEnter(g): void; onZap?(w: Work): void }): void;
  build?(args: { gallery; gates; outDir }): Promise<void>; // node-side static export
}
type Layout = { rooms:{id;bounds}[]; placements:{workId;roomId;wall;position:[x,y,z];sizeM:[w,h]}[]; gateSlots:{position;roomId}[] };
```
- Works with a `size` hang at true relative scale. Unknown size defaults to a 1 m long side, by aspect ratio.
- No dead-end hallways. Cleanup elves follow paint splats, then the wand, gates, and the buy scanner (game mode).
- **Load from relay:** decode naddr → read the author's kind 10002 (fall back to the naddr relay hints, then defaults) → `REQ {kinds:[37440], authors:[pk], "#d":[d]}` → one batched `REQ {ids:[…kind-20 ids]}` plus `{kinds:[30402], authors:[pk], "#d":[…]}` → map to `GalleryJson` → check image hashes → `loadGallery`. Gate portals resolve each gate's manifest lazily for its name and thumbnail, and show the bare npub if it can't be fetched. A small client library (`nostr-tools` or NDK) lives in the viewer, not the engine core.

## 5. Payments (non-custodial: we never hold funds)
- **Zaps (NIP-57):** a Zap button per work and per gallery. The zap request (9734) carries `p` = artist, `a` = the work's 30402 address or the gallery's 37440 address, and `e` = the kind-20 id. That's how a receipt is tied to a work. Paid from the visitor's wallet via WebLN/NWC (NIP-47, e.g. Bitcoin Connect) or a QR code.
- **Lightning address** (LUD-16) comes from the artist's kind 0 `lud16`. **Recommended:** a Lightning address served by the artist's own **BTCPay Server** (NIP-05/zap plugin, to verify), so every zap and Lightning tip lands in BTCPay's books too.
- **Sales:** the Buy button opens a BTCPay invoice (Greenfield API / payment link) with `orderId`/`itemCode` = work id and metadata `{gallery, work, naddr}`, or a link to the artist's existing shop (`shopUrl`). **Fiat checkout stays on the artist's existing site** (Squarespace/Shopify). We don't process cards.
- **Referral splits (optional, artist-set %, default small):** a visitor who arrives through a gate (`?ref=relaygate&from=<gallery d>`) can split a zap with the gate-linking artist via NIP-57 `zap` split tags (wallet support varies) or a second payment. For BTCPay sales, the split is a payout from the artist's own BTCPay (manual or plugin). Attribution happens client-side and is spoofable, so it's trust-based.
- Link tagging: gates and painting links carry `?ref=relaygate&from=<id>[&work=<id>]`. No cookies, no pixels of our own.


## 5.1 Provenance (physical originals)
Reuse TJ's 2023 [LN_BasedArtFoundry](https://github.com/timothyjosephmurphy/LN_BasedArtFoundry) where practical. That repo is a personal Python pipeline (~580 LOC, Nov 2023): HEIC→JPG, deskew, perceptual hash + Imgur upload + image SHA256, then mint a **Taproot Asset** collectible via `tapcli` (metadata: title, sha256, phash, url), merge mint + hash tables, print labels, and tally LN wallet spend. It is **not** a library: no `requirements.txt`, incomplete `.gitignore`, and it needs a local bitcoind/lnd/tapd (`lncli`/`tapcli`), ImageMagick, and packages such as `imgurpython`/`imagehash`/opencv/pandas/reportlab. It will not run cleanly without that stack; mainnet minting spends real sats. Related: [timothyjosephmurphy/taro](https://github.com/timothyjosephmurphy/taro) is an Oct 2022 snapshot of Lightning Labs' Taro daemon (now `taproot-assets`) at commit `3204936` — **no TJ commits beyond upstream**, so treat current `lightninglabs/taproot-assets` as the daemon, not that fork.

**Reuse plan (honest):**
- **Per original:** a certificate of authenticity — either a Taproot Asset (heavier; API has moved since 2023) **or**, preferred for v1, a simpler **signed Nostr event** carrying the artwork image `sha256` (kind 20 already has `imeta`/`x`).
- **Link** the certificate from the work's Nostr event and from the tjm.art product page; **transfer** to the buyer on sale; **tie** to BTCPay invoice + ledger entry (`workId`, payment hash).
- Lift ideas (hash-as-identity, label/export flow), not the shell-out scripts as-is.

**Effort:** **S** for Nostr-signed CoA + links + sale/ledger hooks (folds into M3); **M** if also reviving Taproot Asset mint/transfer against modern tapd. Secrets were committed under `secrets/` in LN_BasedArtFoundry — rotate those credentials; do not copy them here.

## 6. Accounting and records
**Rule: no payment skips the books.** Every zap receipt and every sale becomes a ledger entry.

**Capture** (`relaygate ledger sync`, a long-running service or a cron job):
- **Zaps:** subscribe on the artist's relays and the relays named in their zap requests to `{kinds:[9735], "#p":[artist-pk]}`. Validate each receipt per NIP-57 (the receipt's pubkey = the LNURL server's `nostrPubkey`, and the bolt11 amount = the zap request amount). Read the work from the embedded request's `a`/`e` tags.
- **BTCPay:** a webhook (`InvoiceSettled`, `InvoicePaymentSettled`) plus a Greenfield API backfill. BTCPay is the preferred source of truth when it is used, because it also catches Lightning payments that never produce a zap receipt.
- **Reconcile:** dedupe by payment hash (zap receipt bolt11 ↔ BTCPay invoice). `relaygate ledger check` lists receipts with no BTCPay match and vice versa. Manual entries cover off-Nostr sales (cash, card through the artist's site).

**Entry** (append-only `ledger/entries.jsonl`, never edited; corrections are reversing entries):
`{ id, receivedAt (ISO, UTC), type: zap|sale|tip|refund|referral-out, amountSats, amountMsat, usdValue, btcUsdRate, rateSource, rateTime, workId|null, galleryD, workTitle, paymentHash, bolt11|null, btcpayInvoiceId|null, zapReceiptId|null, payerNpub|null, memo, category (income account), taxable: true, salesTax: {jurisdiction, rate, amount}|null, buyerCountry|null, fee: {sats, usd} }`
- **Required for every entry:** `amountSats`, `usdValue` at the time received (the BTCPay invoice rate, or for direct zaps the BTC/USD rate at `receivedAt` from a configured source, stored with source and time), and `workId` (null only for gallery-level tips, labeled as such).
- Tax fields: income category, sales-tax fields for physical sales (rate per jurisdiction, set by the artist), fees, and USD basis. These support a sole proprietor's Schedule C and Bitcoin cost basis for later disposal. **We don't give tax advice. TJ's accountant confirms the treatment.**

**Exports and connectors:**
| Target | How | Why this one |
|---|---|---|
| CSV | `ledger export --csv` (generic, plus a QBO bank-feed CSV layout) | Opens anywhere; the accountant's fallback |
| **QuickBooks Online** | `ledger connect qbo`: OAuth2 against the Intuit Accounting API, posting Sales Receipts in USD to a "Bitcoin (sats)" clearing/asset account, with the work in the line description | What most US accountants use (Bookkeeper's requirement) |
| **GnuCash** | CSV in GnuCash's transaction-import layout (plus an optional QIF) | The most widely used open-source desktop books. Native multi-commodity support (USD + BTC) |
| **Akaunting** | REST API (income transactions with an item = work) or CSV import | Open-source web books with invoicing, for artists who want a browser app |
| **Beancount** (and ledger/hledger) | Plain-text journal: `ledger export --beancount`, with `--ledger` from the same generator | Diffable, auditable, git-friendly, Fava UI. The best match for open-source and self-sovereign users |
| ERPNext | Not in v1 | A full ERP is too heavy for one artist. The CSV covers it |

**Privacy:** zap receipts are public on relays, but the ledger is local only (the artist's machine or their own server) and never uploaded by Relay Gate. Payer npubs and buyer details from BTCPay are stored only if the artist enables it, and exports leave them out by default (`--include-payers` to opt in). Private/anonymous zaps are recorded by amount only. QBO tokens are stored in the OS keychain, never in the repo.

## 7. Room splats (later, M5)
"Try it on my wall": the visitor scans their room on a phone (Scaniverse/Polycam/Luma) into a Gaussian splat (`.ply/.splat/.spz`), viewed in three.js with Spark or GaussianSplats3D. Pick works from any gallery (via §3/§4), then hang them at **true size**: a work without `size` is shown but can't be hung. Scale comes from LiDAR captures (already metric), or the visitor marks a known length (door = 80 in). Wall pick = tap → raycast → RANSAC plane fit → the painting snaps flush at 57 in center height. `room.json = {splat, scale, walls, hung:[{naddr, workId, wall, pos}]}`. **Privacy:** the room file stays on the device (file picker + IndexedDB) and is never uploaded. Buy/zap links carry `from=room`.

## 8. Open-source plan
- **License:** MIT. **Repo:** public (needed for OpenSats, see Q1). Owner: TJ Murphy.
- **Layout:** `bin/cli.js` · `src/importer.js` `src/http.js` (built) · `src/publish/` (event builders, Blossom upload, NIP-46 client) · `src/ledger/` (capture, store, exports, `connectors/{qbo,akaunting}`) · `viewer/` (web viewer + NIP-89 handler + NIP-07 publisher page) · `nips/relaygate-galleries.md` (draft NIP) · `docs/` (artist guide, EN/ES) · `test/` (fixtures, relay mock).
- **Milestones** (effort = one part-time developer, rough):
  | M | Deliverable | Effort |
  |---|---|---|
  | M0 | Site importer → `gallery.json` (**done**) | — |
  | M1 | Rename code; `review` step; Nostr publish (kinds 37440/20/30402, Blossom, NIP-46/07); draft NIP | 3 wk |
  | M2 | Viewer loads a gallery from relays; gates by naddr; NIP-89 handler; static/nsite fallback | 4 wk (+ engine core) |
  | M3 | Zaps (NIP-57, NWC), BTCPay invoices, referral splits; ledger capture + CSV; provenance CoA hooks (§5.1, Nostr-first) | 3–4 wk |
  | M4 | Connectors: QBO, GnuCash, Akaunting, Beancount/ledger; reconcile; artist docs | 3–4 wk |
  | M5 | Room splats (§7) | 5–6 wk, separate funding |
- **Permissions & politeness** (unchanged): run it only on your own site; honor robots.txt (own UA group, else `*`); 1 req/s; public images only; never send cookies or credentials; skip 401/403.

## 9. OpenSats fit (liftable draft: TJ, rewrite in your own words before submitting)
From Opportunities' funding research notes (Oct 18 2026): one form covers the General and Nostr funds. Requirements: FOSS license, public development, about one page, **2 references**, an **exactly 2-minute human-voiced video**, 90-day progress reports, budget in USD paid in BTC, part-time allowed, 3–12 months. Window: Oct–Nov 2026, **submit by Nov 30 2026**, review takes up to about 90 days. Verify the field names against the live form at opensats.org/apply.

**Project name:** Relay Gate · **License:** MIT · **Repo:** (public URL, to create) · **Applicant:** TJ Murphy

**Project description:** An open-source tool that turns any artist's website into a walkable 3D gallery published as signed Nostr events under the artist's own key. Galleries link to each other through "gates" (signed pointers between artists' keys), visitors zap or buy works over Lightning, and every payment lands in the artist's own books (BTCPay, QuickBooks, GnuCash, Akaunting, Beancount).

**Project goals:**
1. Decentralized art discovery: galleries and the links between artists live on relays, with no platform, directory server or algorithm in between.
2. Artist sovereignty: the artist's key, their domain (NIP-05), their images (Blossom/own site) and their money (own Lightning address/BTCPay). Nothing is custodial and the nsec is never touched.
3. Lightning adoption by working artists: zaps and sales that are as easy to account for as card sales, so artists (and their accountants) can say yes to Bitcoin.
4. Reusable Nostr infrastructure: a draft NIP for galleries (kind 37440) and picture-event conventions for physical artworks (real size, medium, price via NIP-99).

**How it helps Nostr and Bitcoin users:**
- Nostr users get a new kind of content (spatial galleries) that opens from any NIP-89-aware client. Artworks also show up as ordinary kind-20 pictures in clients like Olas, and gates turn follow graphs into walkable art networks.
- Artists get one command from website to Nostr, with no key handling (NIP-46/NIP-07), which onboards non-technical creators.
- Bitcoin users get zaps tied to specific works, BTCPay checkout for originals, and optional referral splits that pay artists for sending visitors to each other.
- Merchant acceptance: a ledger that records sats, USD value at receipt and the work for every payment, with exports to QuickBooks and open-source books. This removes the bookkeeping barrier that keeps small sellers off Lightning.

**Timeline and milestones** (months from grant start; 6 months part-time):
| Month | Milestone | Public deliverable |
|---|---|---|
| Before applying (by Nov 30 2026) | M0 + start of M1 | Public repo, working `npx relaygate <url>`, 3–5 real artist galleries |
| 1–2 | M1 Nostr publish | Kinds 37440/20/30402 published via NIP-46/07; Blossom upload; draft NIP opened on nostr-protocol/nips |
| 2–3 | M2 Load from relay | Web viewer opens naddr links; gates; NIP-89 handler; nsite/static fallback |
| 4 | M3 Zaps and sales | NIP-57 per-work zaps, NWC, BTCPay invoices, referral splits; ledger capture + CSV |
| 5–6 | M4 Books | QuickBooks Online, GnuCash, Akaunting and Beancount exports/connectors; artist guide in EN/ES; 90-day and final reports |
| Later (separate funding) | M5 | Room splats |

**Budget (TJ approved the $27,000 total, Oct 18 2026):**
| Item | Proposed |
|---|---|
| Development, part-time (~20 h/wk × 26 wk, about 520 h) | $22,800 ($3,800/mo × 6) |
| AI and compute (coding assistants, build/test runs, 6 mo) | $1,200 |
| Infrastructure: test relay, Blossom storage, BTCPay test server, domain (6 mo) | $900 |
| Test sats for zap/sale/split testing | $300 |
| Artist onboarding and Spanish localization (incl. El Salvador artists) | $1,800 |
| **Grand total** | **$27,000** (paid in BTC) |

**Duration and time commitment:** 6 months, 50% time (part-time).
**Prior funding:** no. **Other current funding:** no.

**Prior work / proof:** a working site importer (robots.txt-respecting, JSON-LD/sitemap aware), this spec, and TJ's own gallery as the first live deployment; also [LN_BasedArtFoundry](https://github.com/timothyjosephmurphy/LN_BasedArtFoundry) (2023 Taproot Asset CoA pipeline) and [taro](https://github.com/timothyjosephmurphy/taro) (2022 upstream Taro snapshot, no local commits). Add the commit history and links to live galleries.
**Other funding:** none. Possible later complements: Geyser crowdfund, Bitcoin for the Arts (exhibition side).
**Still needed:** 2 references (Nostr devs or BTCPay/El Salvador community, Nostr-signed if possible) and the 2-minute video recorded in TJ's own voice.

## 10. Open questions (for TJ unless noted)
- Q2: Squarespace's stock robots.txt blocks `?format=json`. Is HTML-only OK, or should there be an `--allow-own-json` option for site owners?
- Q3: UTM tags in addition to `ref/from`?
- Q4: Default Blossom server(s)? (Relays decided, see log.)
- Q5: Is the custom kind 37440 plus a draft NIP OK, or should we try to stay inside existing kinds only (NIP-51 picture sets + NIP-78)? Custom is cleaner; existing kinds avoid the NIP process.
- Q7: BTC/USD rate source for direct zaps (BTCPay's rate provider vs. a public exchange API).
- Q8 (Studio manager): How the engine core ships (npm vs. vendored), the texture budget per room, and whether the §4 interface (incl. `loadFromNostr` living in the viewer) is OK.

## Decisions log
- Oct 18 2026 (TJ): every image on the artist's site counts as its own work.
- Oct 18 2026 (TJ): Nostr-first. the old working name is retired (game term with a registered trademark conflict). Working name Relay Gate.
- Oct 18 2026 (TJ): name is Relay Gate; public repo github.com/timothyjosephmurphy/relaygate. OpenSats: 6 months at 50%, no prior or other funding, $27,000 budget. Default relays: relay.damus.io, nos.lol, relay.primal.net. Referral default: 10% of zaps only; no BTCPay sale splits at first.
- Oct 18 2026 (Bookkeeper): zaps are taxable business income, not gifts.
- Oct 18 2026 (Bookkeeper, #70): every zap/sale records sats, USD value at receipt and the work. Route through BTCPay when possible. Export to QuickBooks, GnuCash, Akaunting and Beancount. Owner: TJ Murphy, sole proprietor.
- Oct 18 2026 (TJ): reuse LN_BasedArtFoundry provenance work where practical.
