# Artist setup on an existing website

This is a working local preparation tool and portable **unsigned 2D gallery**. It does not deploy a website, replace the shared 3D engine, publish to Nostr, or arrange hosting. Artists can review images and export a usable web gallery without a terminal, GitHub account, wallet, or Nostr account.

The source and generated HTML are kept in the repository for review. There is no public hosted setup service or launch implied by this change.

## Prepare a gallery

1. Save [artist-setup.html](../tools/artist-setup.html) as an HTML file and open that file in a current browser. Keep the file for future edits. It contains its own interface and code; no server or installation is needed. Download the raw file, rather than saving GitHub's source-code page. A maintainer can also hand you this file directly.
2. Enter the artist name and website. Add permitted PNG, JPEG, GIF or WebP files, add public image addresses, or open a `gallery.json` supplied by the importer. Website import is an integration point; the standalone file explains the manual fallback if no importer is connected. Opening another draft or importing a website replaces this collection and clears its session history: download the current private draft first.
3. Select each candidate. Correct filename-derived titles, describe the image, and include only artworks you want to show. Physical width and height are optional, in inches or centimetres. Image pixels are never treated as physical dimensions. A blank size remains unknown. Attach an image file to an imported candidate to preserve that artwork's ID.
4. Confirm the metadata review and permission to display each included image. Editing metadata clears its review checkbox; changing the image or permission note also clears image permission. An imported review flag does not count as artist approval. Permission notes, source page, original title source, and size source stay in the data. Unparsed imported size notes remain available until the artist supplies dimensions. An image permission checkbox records the artist's assertion; it is not a copyright investigation.
5. Choose **Preview 2D gallery**. Local image files remain local. Remote image links may contact their existing hosts when previewed; they are not downloaded into the export. Preview is available before all reviews are complete and labels unreviewed candidates.
6. Choose **Download private draft** before closing or switching collections. Reopen that JSON file to resume. It includes excluded candidates, stories, and local images, so keep it private. The editor does not use automatic browser storage. The last five metadata versions are also available within the current collection/session; those versions are not a substitute for a downloaded backup.
7. Choose **Download gallery ZIP** when the included works are ready. Export refuses missing review, missing image permission, absent images, and corrupt local-image checksums. Unpack it with the computer's ordinary ZIP tool. Keep an untouched copy before changing anything on the website.

Limits are 500 candidates, 8 MiB per image, 40 MiB of local images and a 60 MiB saved draft. Large photographs should be resized before import. The tool identifies supported raster formats from their signatures; it is not an image repair or malware scanning service. It rejects SVG and active HTML image formats.

The public ZIP contains:

| File | Purpose |
| --- | --- |
| `index.html` | Script-free, responsive artwork list with contact and optional outbound gate |
| `gallery.json` | Portable `relaygate/gallery/1` metadata, stable artwork IDs and provenance |
| `gallery-editor.json` | Reopen the exported collection in this tool, including its permitted local images |
| `media/…` | Included local images, named by SHA-256; excluded candidates' images are omitted |
| `media-inventory.json` | Bundled checksums and explicit remote-only images that are missing from the backup |
| `RESTORE.txt` | Editing and rollback reminder |

Everything in the ZIP is public if uploaded, including the editor JSON and permission notes. Only included works are exported. Keep excluded or confidential material in the separate private draft. Remote-only images can disappear or be blocked by the source host; attach permitted local files before relying on the ZIP as a complete backup.

## Choose where it runs

| Route | What the artist does | Where the gallery runs |
| --- | --- | --- |
| Own static folder | Upload the unpacked ZIP to a new folder using the host's file manager | That hosting account |
| Iframe | Upload to a host first, then paste the generated iframe and fallback link into a supported page | The iframe's separate HTTPS address |
| Ordinary link | Add the final gallery address with the website editor's normal link tool | The linked gallery's host |
| Optional managed service | Agree ownership, price, maintenance, export and cancellation terms with a provider | The provider agreed with the artist |

This tool does not create any of those accounts or charge for them. An iframe does not upload the gallery, and a link does not include hosting. If a website builder does not offer a file manager for arbitrary HTML folders, use separate static hosting and an ordinary link or supported iframe.

For a folder installation:

1. Keep the old page and folder intact. Create a new folder, for example `gallery-review-2`, using your own hosting control panel.
2. Upload **every unpacked file and the entire `media` folder** into it, preserving filenames and relative paths. Uploading just the ZIP or `index.html` is insufficient. If the host strips scripts, this gallery still uses no scripts; it must still serve HTML, JSON and the raster images with their normal content types.
3. Obtain the final HTTPS address from your host. Open it directly while signed out. Do not guess that a local folder name is a public URL.
4. Enter that address in the editor's installation section. Choose folder, iframe or link and copy the installation text. Add the ordinary link using the existing website editor, or use its supported HTML block for the iframe snippet.
5. Save the old link/embed text before changing it. When the new gallery has been checked, point the existing site at the new address. Leave the old folder available until you are comfortable with the new version.

The iframe snippet is deliberately script-free and sandboxed for this 2D export. It includes a separate ordinary link. Do not reuse its permissions unchanged for a future interactive 3D engine: that adapter must specify and test the permissions it actually needs.

### Website-builder instructions

Provider guidance checked against primary documentation on 2026-10-20; confirm the actual account and plan before changing anything or paying for an upgrade.

- **Squarespace:** add a normal link with the page editor for any supported linking workflow. For an iframe, open the page editor, add a Code block, choose HTML and paste the generated snippet. Current Squarespace guidance limits JavaScript and iframe code-block use to Core, Plus and Advanced plans. Legacy accounts can differ. Check the signed-out published view because editing mode is not an installation test. [Squarespace Code blocks](https://support.squarespace.com/hc/en-us/articles/206543167-Add-custom-code-to-a-page-with-code-blocks).
- **WordPress.com:** add a Custom HTML block and paste the snippet if your account supports it; otherwise add an ordinary link. Current documentation requires a paid plan with hosting features activated for restricted elements such as iframe; installing a plugin can activate those features. It is not safe to assume every account already permits embeds, or to repeat older Business-only guidance. [WordPress.com Custom HTML](https://wordpress.com/support/wordpress-editor/blocks/custom-html-block/).
- **Self-hosted WordPress:** use an ordinary link or a Custom HTML block. The site's role permissions, sanitization/security plugins, theme and hosting policy determine whether an iframe survives saving. Ask the site's administrator if the editor strips it. A standard media-library upload is not necessarily arbitrary HTML-folder hosting.

If an embed is empty, first open the gallery address directly. If that works, the embedding host may strip the iframe or the gallery host may restrict framing through its headers. Keep the ordinary link working; do not weaken unrelated security settings to force an embed.

## A gate to TJ Murphy

The local file starts with **no destination URL** for TJ. The supplied identity is:

- Nostr public key: `npub10m0uf224v7tly6k6h8gl6kkmuhmx7969gmudmmhqj5pv65e03r9sxsumee`
- Hex public key: `7edfc4a9556797f26adab9d1fd5adbe5f66f174546f8ddeee09502cd532f88cb`
- Human-readable identity hint: `tj@tjm.art`

The identity hint is not a claim that `tjm.art` is a current gallery location. **Find TJ's signed gallery** needs a trusted application resolver. Without that integration the editor displays a clear error, preserves the draft, and offers an ordinary HTTPS link explicitly labelled unverified. An outbound link does not create a reciprocal gate or imply endorsement. TJ must separately agree to link back.

The unsigned export keeps an ordinary web link and intentionally makes no lasting verified claim. Saved drafts also discard verification status. The connected application must repeat signature/key/schema validation when resolving a network gate; a user-supplied JSON `verified` field is never sufficient. A valid signature establishes which key asserted the destination, not whether the destination is reachable, safe, endorsed or controlled by that key today.

## For maintainers: integration boundaries

Build the single file after changing the source:

```sh
node bin/build-artist-setup.js
npm test
```

No new runtime dependencies are added. `src/artist-setup.js` is browser-compatible state, validation, preview and export logic. `src/artist-setup-ui.js` binds the form; `src/artist-setup-shell.html` supplies the labelled controls. The generated `tools/artist-setup.html` is committed so artists need no build tools. Tests ensure it matches the source exactly.

The standalone tool works from `main` without unmerged PRs. Its two optional trusted callbacks are installed by application code on `window.RelayGateSetupAdapters`:

```js
window.RelayGateSetupAdapters = {
  // Return a relaygate/gallery/1 candidate config. The editor resets approval.
  // The adapter owns network isolation, robots compliance, rate limits,
  // timeouts and any authenticated service access. Do not accept proxy URLs
  // or arbitrary fetch instructions from a draft.
  importWebsite: async ({ siteUrl }) => importerService(siteUrl),
  // This is an application function, never user-pasted "verified" JSON.
  resolveSignedGallery: async target => resolveGallery(
    `37440:${target.pubkey}:${target.identifier}`,
    { relays, query: websocketQuery(), now: Math.floor(Date.now() / 1000) }
  )
};
```

`resolveGallery` and `websocketQuery` above describe the #186 integration; they are **not imported or bundled here**. `relays`, `importerService` and the resolver must be supplied by the embedding application. A local HTML file cannot directly run the Node importer, bypass browser CORS restrictions, or assume an importer service exists. Missing adapters leave manual entry and export available.

The resolver callback receives the supplied identity plus `identifier: 'main'`. A successful result must have `status: 'verified'`, the exact TJ hex `pubkey`, a 64-character lowercase hexadecimal `eventId`, the exact `37440:<TJ-pubkey>:main` coordinate, and `location: { url, assertion: 'artist-signed' }`. `checkedAt` and the injected `now` are epoch **seconds**, with a maximum five-minute lookup age and 60 seconds future-clock tolerance. The URL must be HTTPS without credentials. This freshness bound is for the lookup result, not a guarantee of the latest network event.

#186 additionally reports `availability`, event freshness, `deletionStatus` and `latestStatus: 'latest-observed-only'`. Resolver verification must check the signature, expected key, manifest schema/references and supported deletion semantics; the editor must not try to reconstruct that trust from saved flags. Its experimental explicit location extension is `content.webUrl` plus an exact matching signed `['r', webUrl, 'gallery']` tag. Ordinary `r` tags can identify source/artist websites and must not be treated as gallery locations. This is a Relay Gate proposal, not a claim of a standardized NIP. Reachability is always separately untested by this editor.

The portable gallery output is an adapter input for the existing engine and #151 self-host kit. Keep the existing shared Three.js engine as the 3D implementation. This change does not copy its built assets or create another rendering engine. Integrating the independently proposed gallery consumer/export kit should reuse these state and UI boundaries after the dependent PR is reviewed, with explicit schema and provenance mapping.

Signing is a later optional step through NIP-07 or NIP-46/NIP-55 adapters. The unsigned website must remain usable when no signer is installed or relays are unavailable. Never request, store or transport an `nsec`, and do not place a signer session, wallet secret, service credential, or private draft into the export.

## Installation and acceptance still to verify

The repository tests cover malformed data, image permissions, stable IDs, checksums, export contents, recovery, resolver identity/clock checks, markup escaping, accessible structural controls and ZIP bytes. Small form-control unit tests check simultaneous unsaved artist/artwork fields, review resets, size-note preservation and checkpoint revisions. Their fake controls do not emulate browser layout, security, focus or accessibility APIs. These tests do not demonstrate human usability or a live installation. Browser visual acceptance was not performed in the current environment; local-file browsing is blocked there and that restriction was not bypassed.

Before marking #182 fully accepted:

1. With permission, observe five nontechnical artists, including a phone user and a keyboard-only user. At least four should reach a reviewed gallery in under 15 minutes, excluding DNS/host setup time. Record time, assistance and failed steps rather than assuming success from an automated test.
2. Integrate the licensed distributable shared engine entry point and #151 hosting kit, then verify the 3D view plus the accessible list. Public built assets alone are not a reusable source/license contract.
3. Connect the robots-aware importer and signed resolver in the intended application. Exercise failed import, missing signer, relay outage, withdrawn/invalid destination and missing media without losing the current draft. No present TJ gallery URL or reciprocal permission has been assumed.
4. With the artist's explicit hosting approval, test a real own-site URL and supported iframe or ordinary-link path. Open it signed out on a phone, check keyboard focus and image descriptions, visit the outbound gate and return, and verify the fallback link when the embed fails.
5. Replace one artwork, export to a new folder, then restore the prior folder/link. Confirm that the old artwork IDs and permitted media still work. Keep the old ZIP and private draft; no automatic rollback service is provided.

These are human, hosting and engine gates, not reasons to publish a test website or contact artists without approval.
