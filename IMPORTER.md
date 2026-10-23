# Website importer

This is a local importer, not a deployed gallery service. It reads publicly accessible HTML and writes an unsigned config for review. It does not invoke the shared 3D engine, sign Nostr events, or publish anything.

```sh
npm ci
node bin/cli.js https://artist.example --out ./gallery
node bin/cli.js https://artist.example --out ./preview --no-download --max-pages 30
npm test
```

Node.js 20 or newer is required. `--help` lists options. Unknown flags, including `--publish`, fail instead of being silently ignored. `--name` overrides the detected artist label; `--gate-to https://other.example/` can be repeated to preserve unsigned web destinations for later review. These are not verified Nostr gates.

## Discovery and limits

The starting page always contributes candidates. Discovery combines robots-advertised sitemaps and `/sitemap.xml`, nested sitemap indexes (including gzip), sitemap image entries, JSON-LD artwork/product/image objects, Open Graph/Twitter fallback metadata, and ordinary/lazy/responsive image tags. Same-origin links provide a bounded breadth-first fallback, even when a sitemap exists. Every distinct plausible image is retained, including images on pages that also contain structured works.

Interface regions, very small images, recognized UI assets, and elements inside `data-relaygate-skip` are excluded heuristically. The legacy `data-slipgate-skip` attribute is also supported, including empty attributes. Review remains necessary: a scraper cannot reliably distinguish every painting, installation photo, and decorative image. No browser scripts run; JavaScript-only content, authentication, or nonstandard markup can require manual additions. A site with no candidates produces a warning, not a claim of successful complete discovery.

Defaults: 600 pages including the start, 30 sitemap requests, 3,000 works, 3 concurrent workers, and at least 1,000 ms between all HTTP request starts. `--max-pages`, `--concurrency` (1–8), and `--delay` (0–60,000 ms) control CLI limits. Sitemaps and images are additional requests. Lower concurrency or increase the delay for a site that needs it. An import of hundreds of pages can take minutes because the rate limit is intentional.

The HTTP client identifies itself as RelayGateImporter and caches one robots request per origin for the run. It merges matching product-token groups, applies longest-path rules and allow precedence, and honors an optional `Crawl-delay`. Every content redirect gets another robots check. Missing robots files allow access; network/5xx/429/auth failures defer the origin. Redirects stop after five hops. A 429 or 503 gets at most one retry, observing Retry-After. Delays longer than a minute defer the affected origin instead of waiting indefinitely. Page redirects outside the established origin are skipped; image hosts and declared sitemap hosts have their own robots checks.

Each response has a 20-second timeout covering headers and body. Limits are 512 KiB for robots, 5 MiB for pages/sitemaps (including decompressed gzip), and 25 MiB per image. Only supported raster MIME types are downloaded. Warnings identify blocked, unavailable, unsupported, or truncated results. No credentials are accepted inside URLs. This CLI is not an SSRF-isolated multi-tenant fetch service; do not expose it as a public URL-fetching endpoint without a separate network-isolation design.

## Engine input

`gallery.json` uses `schema: "relaygate/gallery/1"`. This replaces the prototype's `relaygate/1` marker; consumers must explicitly accept the new schema. The root contains `artist`, `works`, `gates`, `warnings`, `stats`, and `generatedAt`.

Each work includes:

| Field | Meaning |
| --- | --- |
| `id` | SHA-256-derived identifier of normalized source image URL; stable across title/order changes, not across a changed source URL |
| `title`, `titleSource` | Extracted title and whether it came from metadata, alt/caption, page title, sitemap, or filename |
| `image`, `page`, `source` | Absolute HTTP(S) image, source page, extraction method |
| `size`, `sizeIn`, `sizeSource` | Raw physical-size text, normalized `{w,h}` in inches or `null`, and interpretation provenance |
| `pixelSize` | Optional pixel dimensions; never treated as physical size |
| `localImage`, `sha256` | Relative downloaded path and SHA-256 of bytes, or `null` on no-download/failure |
| `medium`, `year`, `availability`, `description` | Best-effort source metadata; unknown values remain null |

Structured width/height with explicit inches, centimetres, millimetres, or metres are normalized. Explicit W/H text is normalized too. Unlabelled `24 × 36 in` remains raw text with `sizeIn: null` because sites disagree about orientation. Bare numbers and image pixel dimensions never become painting dimensions. An engine can use a labeled display estimate for unknown sizes and obtain image aspect ratio from the raster.

Deduplication merges richer metadata for the same image URL. Query identifiers and same-named files in different directories remain distinct. Known Squarespace `format` resize variants share an identity. Byte-identical downloads share a content-addressed file, while distinct work records are preserved for review. No destructive cleanup of earlier images occurs. A rerun atomically replaces `gallery.json`; do not run concurrent imports into the same output directory.

## Verification

Tests use the original fixtures plus mixed metadata and a deterministic simulated website. They cover sitemap cycles/gzip/images, homepage and nested-link discovery, robots failures/redirects, concurrent rate limiting, Retry-After, response limits/timeouts, malformed JSON-LD, stable IDs, unknown dimensions, downloads, no-download, partial failures, and CLI errors. They make no requests to artists' sites.

Reference behavior: [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309), [Sitemap protocol](https://www.sitemaps.org/protocol.html), and [Schema.org VisualArtwork](https://schema.org/VisualArtwork). The crawler's conservative auth/error handling, resource limits, and review rules are application policy.

Live case checked 2026-10-20 UTC: `https://www.ariellelivernoche.com/` yielded 175 image candidates from seven HTML pages with `--max-pages 80 --no-download`. It is a photography portfolio with mostly filename alt text and no normalized physical sizes; filename-derived labels must remain marked for review. An HTTP sitemap advertised by the site could not be reached from this environment, so its origin was skipped and HTTPS/link discovery continued. These are observed results, not a fixed test expectation or proof that all 175 candidates are separate artworks. A synthetic Squarespace fixture captures the relevant markup without copying the artist's photographs.
