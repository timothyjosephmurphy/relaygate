# Portable gallery and engine boundary

This implements the offline export/recovery and visitor fallback portions of
studio-tracker #196. It is not a public launch or a claim that every readiness
criterion has passed. Nothing here signs, publishes, deploys or takes payments.

## Run from a checkout

Requires Node 20 or newer. The importer work in Relay Gate PR #2 produces the
`relaygate/gallery/1` input consumed here. This PR starts independently from
`main`; it does not include or replace that importer PR.

```sh
npm ci
npm test
node bin/gallery-kit.js build /path/to/gallery.json /path/to/new-gallery-folder
node bin/gallery-kit.js verify /path/to/new-gallery-folder
node bin/gallery-kit.js restore /path/to/new-gallery-folder /path/to/restored-folder
```

The destination must not already exist and its parent must exist. A build is
staged before an atomic directory rename on supported local filesystems. Keep
the old folder for rollback. This is a local CLI, not a public URL-fetch service.

The resulting `index.html` is a complete, script-free visitor view. All work
titles, metadata, stories, source links and web gates are readable without
WebGL, Nostr, sign-in or a wallet. Images load lazily; missing images leave the
text and source links usable. There is no automatic audio or camera motion.
The page includes a skip link, ordered headings, visible keyboard focus,
responsive cards, print styling and light/dark colors. This is not yet a
manual WCAG conformance assessment.

No files are uploaded by these commands. Preview locally before deploying a
folder through an artist's existing hosting workflow. Host over HTTPS with
correct MIME types and `X-Content-Type-Options: nosniff`. JavaScript is not
needed. The inline style is restricted by a CSP hash; external frames, forms,
scripts and connections are blocked by the generated page's CSP.

## Consumer format and artist review

`src/gallery-contract.js` validates the version, unique stable work IDs,
bounded text, physical dimensions, safe relative file paths and HTTP(S) URLs.
Unknown physical dimensions remain `null`. Image pixels never become an
asserted physical measurement. The importer may produce non-artwork candidates;
only an explicit `reviewed: true` on a work changes its review label.

Preserved fields include titles and their source, source page/image, project,
medium, year, size text and provenance, physical size, pixel dimensions,
description, artist story, alt text, rights/license text and availability.
Unknown fields are intentionally not exported. This is a public-gallery
allowlist, not a general backup for private commerce records or signer state.
Artists should keep their original input alongside the portable public folder.
An imported title alone is the fallback alt text; artists should supply richer
descriptions before their accessibility pilot.

Gates are ordinary HTTP(S) links in this version. They always say unverified;
the page does not imply artist consent, a reciprocal connection, a verified
Nostr key, or a current signed gallery location. Nostr resolver/signature and
relay-recovery work remains a separate integration requirement.

## Shared 3D engine adapter

The maintained website engine now uses Three.js and was consolidated in
`timothyjosephmurphy/vermillionaurora` PR #635. The earlier Babylon gallery room
is retired. This adapter does not revive or copy that legacy renderer.

`toEnginePaintings(gallery, slots, { baseUrl })` maps the portable records into
the current painting renderer's `id/title/sub/url/img/mid/hi/thumb`,
`x/y/z/ix/iz/fy/room`, and `w/h/fw/fh` fields. Coordinates and display sizes are
in metres. Supply one slot per work, with finite position and wall normal,
room ID, floor height, `maxWidth` and `maxHeight`. Insufficient slots or invalid
geometry fail explicitly instead of silently losing work.

The output preserves physical dimensions separately. Unknown sizes use an
explicit display estimate and pixel aspect ratio where available; oversized
works are scaled to the supplied slot and retain `displayScale`. IDs remain
unchanged when the site moves; local media resolves against the new directory
URL. Missing media is flagged so a renderer can show a placeholder.

This is a **painting-data adapter**, not a complete museum layout or a working
drop-in gallery engine distribution. Existing museum collision geometry,
spawn points, gates, textures and runtime hooks remain engine-owned. The public
website repository currently carries built player assets. Before the full
3D acceptance test, the Gallery owner needs to provide the maintained source
package, license and a supported entry point for custom catalogs. No private
artist source or artwork is copied into this public repository.

## Backup guarantees and limits

The folder contains canonical `gallery.json`, regenerated `index.html`, a
`manifest.json` inventory and content-addressed raster media. Files are hashed
with SHA-256. Remote images are **not fetched**: the manifest lists remote-only,
missing and absent images. Local image checksums, file signatures and size
limits are checked. SVG/HTML, symlinks and path traversal are rejected.

Optionally append paths to exact public Nostr event JSON files (relative to
the source gallery folder) to the `build` command. Their original bytes are
archived under `events/<id>.json`; the inventory retains event IDs and
addressable-event coordinates. Only the public event envelope is accepted.
Its shape is checked, but its cryptographic signature and event ID are **not
verified** by this kit. The archive explicitly says so. Never put signer state,
private accounting records or credentials in the source folder or arguments.

Verification checks required files, hashes, sizes and references. Restoration
validates before writing into a new folder and re-renders the HTML from safe
metadata. It does not execute an archived page. Checksums detect corruption;
an attacker can replace both a file and its manifest, so hashes do not prove
artist identity or authenticity. Exact certificate revisions are retained as
public event files, not promoted to verified ownership claims.

Limits: 3,000 works, 100 gates, 8 MiB gallery JSON, 25 MiB per file, 256 MiB
total bundle and 1,000 event inputs. This bounds memory for a local utility.
Large collections should split into galleries. No hosted importer is exposed;
hosted fetching still requires network-level SSRF isolation and abuse controls.

## Acceptance evidence and remaining gates

Automated checks cover schema rejection, duplicate IDs, malformed geometry,
preserved real sizes, hostile HTML and URLs, missing media, loss of the original
source folder, checksum tampering, traversal, symlinks, exact event retention
and replacing a malicious archived HTML page during restore.

Before #196 can be closed:

- Run the adapter inside the maintained engine with a synthetic catalog, then
  an artist-approved catalog. A data mapping test is not a rendered gallery.
- Run keyboard and screen-reader checks, 320 px phone layout, reduced motion,
  missing images and a constrained-network first-text measurement. Record
  device/browser/network profile; the proposed first-text target is 3 seconds.
- Test verified signed-gallery selection, conflicting/stale events, relay loss,
  host migration and key recovery limits after the Nostr integration lands.
- Have five artists complete the installation/export/restore pilot. Record
  time, help needed, hosting cost and a real rollback on their chosen host.

Reference standards: [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/),
[OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
