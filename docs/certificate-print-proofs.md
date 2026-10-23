# Artwork certificate print proofs

Implementation for studio-tracker #185. This first print workflow creates
**unsigned DEMO proofs only**. It cannot issue a certificate, fabricate an artist
signature, publish a master event or make an authenticity claim. Do not attach
the example proofs to artwork: their QR codes use the reserved `example.invalid`
domain and are deliberately not live verification links.

## Make a proof

From this checkout with Node 20 or newer:

```sh
npm ci
npm test
node bin/certificate-proofs.js test/fixtures/certificate-demo.json ./new-proofs
```

The output directory must not exist. It contains:

- `sticker-sheet-demo.pdf`: A4, two columns and four rows of 90 x 55 mm labels.
- `strip-labels-demo.pdf`: one 120 x 24 mm page per artwork, with 2 mm margins.
- Individual monochrome PNG and vector SVG files for both layouts.
- A 100 mm calibration-ruler PDF, the exact public draft data, and a file/hash
  inventory with actual raster sizes, DPI, QR payload and dots per module.

These are generic engineering profiles, not claims of compatibility with a
particular printer or label-stock SKU. PDF dimensions reflect the integer-dot
raster size, which may differ from nominal millimetres by less than one dot.
Print at **100% / actual size**, disable fit-to-page, and check the calibration
ruler and alignment on plain paper before using labels.

The input requires `mode: "demo"` and `reviewed: true` for each selected work.
Artist name, title, year, medium, physical width/height/unit and edition text are
explicit artist-supplied fields. Unknown physical size remains unknown. Pixels
never become physical dimensions. The export allowlist omits owner names,
addresses, purchase prices, private notes and unrelated metadata.

The draft keeps an optional supplied master coordinate under the artist's public
key, labeled **not verified**. It always has `certificateEventId: null` and
`issuedAt: null`. The tool rejects supplied signature/issued-event fields rather
than presenting them as verified certificates. Repeating identical reviewed
data preserves the same demo lookup code; editing it changes the draft hash.

## Printer profiles

Pass a JSON profile as the third argument. Example for different sheet offsets
and a wider strip:

```json
{
  "label": { "widthMm": 90, "heightMm": 55, "dpi": 300, "moduleDots": 4 },
  "sheet": {
    "widthMm": 210, "heightMm": 297, "columns": 2, "rows": 4,
    "marginLeftMm": 12, "marginTopMm": 12,
    "gapXMm": 5, "gapYMm": 5, "firstLabel": 2
  },
  "strip": { "widthMm": 120, "heightMm": 24, "marginMm": 2, "fontPt": 7, "dpi": 300, "moduleDots": 4 }
}
```

`firstLabel` is a zero-based unused-cell offset on the first sheet only. Later
sheets start at their first cell. Match margins, pitch and cell sizes to the
actual stock; the default is not an Avery template. Set a roll printer's media
size and cut settings in its own driver. A PDF page break does not guarantee a
physical cut, and this tool does not send printer commands.

The QR uses error-correction level M, a four-module white quiet zone and an
integer `moduleDots` of at least three. It is never silently reduced to fit.
If the symbol plus quiet zone does not fit the **printable** height, generation
fails. A 24 mm nominal tape may have less printable area; use the printer's
manual. A three-dot minimum is an engineering bound, not a promise every phone
or substrate will scan it. Test the exact exported payload.

Titles wrap by grapheme. If text cannot fit at the requested font size, the tool
fails with an overflow message; it does not hide the ending or print outside the
label. Increase the label size or use an artist-approved shorter display title.
The full record remains in its JSON draft.

The bundled DejaVu Sans font and its license support many Latin, Greek and
Cyrillic characters. Unsupported characters fail explicitly. For another script,
set `fontFile` to a local font with the required glyphs and redistribution rights.
Text is converted to vector paths in SVG and rasterized for PNG/PDF, so the
receiving printer app does not need that font installed. The print PDFs are
image-based; use the accompanying JSON for machine-readable metadata.

## The printer gun decision

TJ's make/model, printable height/width, DPI, app/connection and media type are
still unknown. There are two materially different possibilities:

| Device class | Test route | What remains device-specific |
| --- | --- | --- |
| Continuous tape/roll | Import the strip PNG or PDF, set media size and print at actual size | Printable margin, accepted formats, driver scaling, cut gap and feed direction |
| Handheld direct inkjet | Import a device-sized monochrome graphic; first print on a separate sacrificial card or label | Supported bitmap format, print height, hand speed, ink/substrate interaction and QR distortion |

A direct-inkjet device with a small print height may not fit this payload and
quiet zone at usable dot size. That must fail the profile check; a future signed
certificate service can use a shorter verified resolver URL plus an offline
archive, after its domain and trust model are chosen. Do not print directly on
an original painting while experimenting. Artist selection of attachment and
materials must consider fading, abrasion and adhesive suitability.

## Required next integration for issued certificates

The draft format and proof code are not a NIP. The SPEC proposal uses experimental,
unreserved kind 37441; adoption and a real signed event still need review.

1. Use an external NIP-07/46/55 signer only after the artist reviews the exact
   public claims. Never put signer secrets or private commerce data in labels.
2. Independently validate the event ID/signature and expected artist key. Bind
   both the stable master coordinate and exact issued certificate revision.
3. Archive the exact signed JSON, relay hints and media hashes. Addressable relays
   may retain only the latest revision, so latest lookup is not an old-label archive.
4. Provide a stable HTTPS verification URL with human lookup code. Distinguish
   valid signature, expected key, exact revision, newer/revoked status where known,
   and unavailable data. Offline verification cannot establish current revocation.
5. Reprint the same issued revision; corrections create linked revisions. Revocation
   and transfer of ownership are distinct. A signature is a key's claim and does
   not prove the physical painting is genuine or legally transfer ownership.
6. Keep Bitcoin timestamp claims disabled until an independently verified proof
   path replaces or mitigates the current NIP-03 review concern.

## Validation and remaining acceptance

Automated tests cover required review, rejection of issued records, exact units,
unknown dimensions, duplicate IDs, bounded printer geometry, QR decoding, all
quiet-zone pixels, page dimensions, partly-used sheets, editions, overflow and
covered/unsupported non-Latin text. File checksums cover the complete output.
The sample sheet and strip PDFs were also rendered with Poppler; both sheet
labels and the first strip label decoded at 300 DPI. The calibration PDF was
visually checked after embedding the font to avoid substitute-font spacing.

Still required: physical stock alignment, scans on two ordinary phones in
realistic lighting, actual printer profiles and material tests. Signed issuance,
offline signature validation, archived revisions and live status resolution are
separate implementation gates. #185 stays open until those gates are met.

Sources: [DENSO WAVE quiet-zone guidance](https://www.qrcode.com/en/howto/code.html/index.html),
[node-qrcode](https://github.com/soldair/node-qrcode),
[PDF-LIB](https://pdf-lib.js.org/),
[DejaVu license](https://dejavu-fonts.github.io/License.html).
