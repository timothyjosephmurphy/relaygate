# Nostr integration: public reads and reviewed external signing

This implements the protocol boundary for studio-tracker #186. It is a library
for the future viewer and artist setup flow, not a public launch, deployed
viewer, payment system, or completed usability study. It does not publish events.

Visitors can browse a locally imported gallery without Nostr. A guest who follows
a Nostr gallery address only needs public relay reads. No account, signer,
wallet, relay account, or payment is required. The benefit is portable artist
authorship and gallery links that can survive a host change. Existing websites
and ordinary shop links remain useful without introducing protocol terminology
into the guest's main task.

## Modules and boundaries

| Module | Responsibility |
| --- | --- |
| `src/nostr-events.js` | Bounded public event envelopes, genuine signature verification, public identifiers, experimental gallery schema, unsigned drafts |
| `src/nostr-relays.js` | Explicit read-only WebSocket transport, verified multi-relay reads, revision/deletion decisions, picture references |
| `src/nostr-signer.js` | Explicitly approved handoff to an external signer and verification of its exact returned event |

Node 20.19 or later is required by the pinned `nostr-tools@2.25.2` dependency
tree. A browser build must bundle these ES modules. This change does not install
a browser application or connect to a relay when the modules are imported.

```js
import { resolveGallery, resolveGalleryWorks, websocketQuery } from './src/nostr-relays.js';

const query = websocketQuery(); // Inert until a read is requested.
const result = await resolveGallery('37440:<64-character-hex-public-key>:main', {
  query,
  relays: ['wss://relay.damus.io', 'wss://nos.lol'],
});

if (result.status === 'verified') {
  const pictures = await resolveGalleryWorks(result, { query });
  // Render titles/descriptions as text. Missing pictures retain their work IDs.
  // pictures.mediaFetched is false: no image bytes have been downloaded or checked.
}
```

The address argument is a coordinate **string** or NIP-19 `naddr` string, not an
object. A public key may be lowercase hex or `npub`. Secret key identifiers and
other identifier types have no supported input path. `now` and `checkedAt` use
integer epoch seconds; optional deterministic `now` is useful for tests.

`resolveGallery` first requests the artist's latest observed NIP-65 kind-10002
relay list, then reads the gallery coordinate from bounded author write relays
and configured fallbacks. Explicit visitor relay choices keep slots ahead of
untrusted address hints; up to four author write relays are added. The supplied
defaults are configurable, and no particular operator is an authority for the
artist's signature. It queries NIP-09 deletion requests before exposing a gallery.

`resolveGalleryWorks` reads exact NIP-68 kind-20 IDs, requires the same artist key,
and uses the selected `imeta` image index. Its records preserve unknown physical
size as `null`. A missing picture, rejected URL, unsupported MIME type, or missing
image index remains a labeled record. HTTPS links and signed hash assertions do
not prove availability, image bytes, copyright, or physical authenticity. This
module does not fetch image bytes, enforce decoded texture size, resolve NIP-99
listings, check picture-event deletion requests, or call the separate engine
adapter. `verified-picture-reference` establishes the exact picture event's
signature and artist binding only. It must not be displayed as a claim that the
picture remains approved, available, licensed, or physically authentic. Those
remain viewer integration work; do not call the output a fully verified render config.

## What the result establishes

Successful results include `status: 'verified'`, `pubkey`, `eventId`, `coordinate`,
the verified `event`, parsed `manifest`, `checkedAt`, `revisionIds`, and these
independent fields:

| Field | Meaning |
| --- | --- |
| `signatureStatus: 'verified'` | The event hash and signature match the expected public key. This is key control, not a legal identity check. |
| `latestStatus: 'latest-observed-only'` | Selected from records actually observed. There is no claim of a global latest event. |
| `freshness: 'recent-event'` or `'stale-event'` | Event age relative to a configurable threshold (one day by default). Old age alone does not invalidate a signature. |
| `availability: 'online'`, `'partial'`, or `'cached'` | Whether the selected event was obtained now and whether gallery/deletion queries completed. Relay-list discovery has its own observations. |
| `deletionStatus: 'not-observed-on-queried-relays'` or `'unknown'` | No matching request was seen, with or without complete queried results. Neither means permanent global non-revocation. |
| `location.reachability: 'not-checked'` | No website visit or hosting/domain verification was performed. |

Other top-level statuses are `unavailable`, `withdrawn`, and
`unsupported-or-invalid-manifest`. Missing/offline responses leave signature
status `not-observed`; they do not imply a bad signature. Per-relay observations
separate rejected events, future-dated events, connection failures, timeouts,
authentication requirements, and limits. The UI must not render a withdrawn or
unsupported result by silently falling back to an older revision.

Candidate selection uses the newest verified timestamp and the lexically lowest
ID when timestamps tie, following NIP-01. Events more than five minutes ahead of
the supplied clock are reported and excluded. A latest event with duplicate `d`
tags or unsupported content is rejected after revision selection, so an older
well-formed version is not silently substituted. `sameTimestampConflict` records
a tie; the protocol rule still selects deterministically.

Deletion reads request only the selected revision's exact ID plus its gallery
coordinate, so a long observed history cannot enlarge the deletion filter.
Valid same-author kind-5 requests targeting the event ID are honored. An `a` tag
withdraws revisions at or before the request timestamp; a later replacement may
remain usable. A deletion request cannot delete a deletion request. An observed
withdrawal is not proof that all relays removed their copies. Supply raw observed
events through `cachedEvents` to retain local revision/deletion knowledge; all
cached signatures are rechecked. The library itself stores nothing persistently.

## Experimental gallery location contract

Kind **37440 is experimental and unreserved**. `relaygate/manifest/1` implements
the pending #69 specification design, not an accepted NIP. The branch does not
copy or supersede that specification PR.

The setup adapter needs an explicit gallery destination. This change proposes
one additional optional field and tag pair:

```json
{
  "content": { "schema": "relaygate/manifest/1", "webUrl": "https://artist.example/gallery/" },
  "tags": [["r", "https://artist.example/gallery/", "gallery"]]
}
```

This is an abbreviated schema illustration: real event `content` is JSON encoded
as a string and also includes title, layout, works and gates. `webUrl` must be a
canonical absolute HTTPS URL without credentials or whitespace, and exactly one
three-element `r`/`gallery` tag must match it. An ordinary `r` source-site tag is
never treated as the gallery destination. Absence is valid but produces no
location. The URL extension needs review and incorporation into the draft spec;
it does not reserve a NIP tag or establish a standard.

Only the verified resolver result labels this location
`{ url, assertion: 'artist-signed', reachability: 'not-checked' }`.
`manifestContent()` is a pure schema parser and returns only `{ url }`: calling
it on an unsigned draft is not proof. The setup integration can use this callback:

```js
const verifyDestination = target => resolveGallery(
  `37440:${target.pubkey}:${target.identifier}`,
  { query: websocketQuery(), relays: selectedRelays },
);
```

Setup must require the expected artist key and an acceptable current result from
this live callback. Saved draft flags, a NIP-05 string, and HTTPS alone are not
verification. A signed outgoing gate proves that its author chose a destination;
it does not establish that the destination artist reciprocated or consented to
an endorsement. A shared coordinate keeps the artist/key stable through host
changes; changing keys requires a separate recovery design.

## Reviewed signing without key custody

`buildGalleryDraft()` produces an unsigned event with allowlisted fields. It
checks cross-references and drops unknown import annotations. Its referral
policy is disabled unless explicitly supplied; nothing performs a split or a
payment. The draft must be shown for review before requesting any signature.

```js
import { signReviewedEvent } from './src/nostr-signer.js';

// Call only from the artist's explicit review-and-sign action.
const outcome = await signReviewedEvent(window.nostr, reviewedDraft, {
  approved: true,
  expectedPubkey: selectedArtistPublicKey,
});
// outcome.status === 'signed' still has outcome.published === false.
```

With no `approved: true`, the adapter returns `review-required` before calling
the provider. Missing, declined, wrong-identity, timed-out, and changed/invalid
returns are separate outcomes. It requires the returned event to match the exact
reviewed kind, timestamp, tags and content, verifies its signature, and rejects
provider mutation of the request. It supports public kinds 1, 5, 20, 10002, 30023, 30402,
37440 and 37441; allowed kind is not permission to skip content review.
Kind 30023 allows the artist-approved narration draft from #183 to use this
same reviewed handoff. It does not validate story rights or approval records.

Use a NIP-07 browser extension, an external NIP-55 adapter exposing the same
`getPublicKey`/`signEvent` shape, or an already connected external NIP-46 bridge.
This is **not** an implementation of Android intents or NIP-46 pairing,
encryption or transport. NIP-46's client transport credentials remain entirely
in the external bridge. Relay Gate neither creates them nor accepts them as
configuration. No Nostr secret is generated, imported, persisted or requested.
Timeout does not cancel an already displayed external signer prompt; it does
prevent a late return from becoming an accepted application result. If identity
approval itself arrives after timeout, no subsequent signing prompt is opened.
No signing
request is made merely by opening a gallery, and this code has no publish path.

## Network, rendering and moderation limits

Reads use at most eight selected relays and four concurrent connections, normally
eight seconds per request, capped at thirty. Each message is bounded to the
512-KiB event envelope plus framing; manifests are at most 256 KiB, with 500 works,
32 gates, and eight hints per gate. Event/message counts and 16-MiB read/retained
byte limits bound a query; cached input is independently capped at 16 MiB before
signature verification or network requests. EOSE, disconnect, abort, authentication challenge and
timeout close subscriptions. A wrapper timeout may discard partial results;
previously verified cached events remain a separate fallback. There is no
recursive gate crawl. Picture IDs are requested in batches of one hundred.

WSS/HTTPS URL checks reject credential-bearing and inappropriate schemes; they
are **not** a DNS/IP-level SSRF defense. This library is intended for explicit
local/browser reads. Any future remotely accessible server accepting arbitrary
gallery addresses must enforce outbound network policy, including local/private
addresses and DNS rebinding, before using it. Even valid artist-provided relay
hints are untrusted destinations. Relay reads reveal the requested key/address
to selected relay operators; do not silently expand them into a crawl.

Render untrusted titles, labels, descriptions and failure reasons as text. Do not
insert signed content as HTML, execute layout code, or trust an arbitrary
NIP-89 handler. Consent to mirror media, report/block controls, curator removal,
and rights review belong to the host/viewer. A curator can remove a local link;
that cannot erase another person's public events. The importer and local 2D
fallback should remain available when relay/network/WebGL services fail.

## Evidence and remaining acceptance work

Run `npm ci` and `npm test`. Tests cover a real, publicly signed kind-1 event,
tampering and cached-verification attacks, limits, future timestamps, unsigned
schema rules, deletion/order policy helpers, deterministic fake WebSockets,
two independent **test transports**, timeout/concurrency behavior and explicit
external-provider return verification. The provider test replays an existing
signed public event; it never generates a signature or invokes a real signer.

Fixture provenance: `test/fixtures/nostr-public-note.json` reproduces the signed
event shown at <https://nostr.how/en/the-protocol>, retrieved 2026-10-20. Its ID is
`4376c65d2f232afbe9b882a35baa4f6fe8667c4e684749af565f981833ed6a65`.
The NIP-98 example examined during development did not verify unchanged with
this library version and was not used as a valid fixture. No private-key fixture
was read or created.

These gates remain open; this implementation alone does not complete #186:

- An artist-authorized externally signed kind-37440 gallery with kind-20 works,
  replacements, ties and withdrawals, read end-to-end from two independent real
  relays and a second client. Current tests separately prove cryptography and
  schema/policy; they do not prove the complete signed-gallery success path.
- An actual browser signer compatibility review, selected Android/remote bridge
  integration, and a viewer build connecting the library to the shared engine.
- Image-byte/hash/texture limits, listing resolution, NIP-89 handler comparison,
  moderation controls, and optional payment integrations in their own issues.
- Ten non-Nostr visitors completing useful gallery tasks without a wallet or
  account, and five artists demonstrating understanding of ownership and public
  publishing. Record completion, host-move behavior, useful visitor/artist
  outcomes and net proceeds with consent, without cross-site identity tracking.
- A product decision on the experimental `webUrl`/`r` convention, cache retention,
  stale-state presentation, relay privacy disclosure and key recovery UX.

Protocol references checked 2026-10-20:
[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md),
[NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md),
[NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md),
[NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md),
[NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md),
[NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md),
[NIP-55](https://github.com/nostr-protocol/nips/blob/master/55.md),
[NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md),
[NIP-68](https://github.com/nostr-protocol/nips/blob/master/68.md),
[NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md),
[NIP-99](https://github.com/nostr-protocol/nips/blob/master/99.md),
[nostr-tools](https://github.com/nbd-wtf/nostr-tools).
