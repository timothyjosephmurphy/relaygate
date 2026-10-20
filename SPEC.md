# Relay Gate specification

Version 0.3, design draft, reviewed 2026-10-20 UTC. Tracks studio-tracker #69.

Relay Gate is an MIT-licensed project in development. This document specifies proposed behavior; it is not a release announcement. The repository currently contains a website importer, CLI, and offline tests. Nostr publishing, the viewer integration, payments, certificates, and accounting adapters below are not implemented by this specification change. No package publication, deployment, or grant submission is authorized by it.

## 1. Purpose and boundaries

An artist supplies a website URL, reviews the extracted works, and can later publish a portable gallery under their own Nostr identity. Visitors open an ordinary web link, see the art, and walk through gates to other artists. Viewing requires neither an account nor a wallet. The existing website and shop remain useful. A grid fallback, keyboard controls, readable labels, and reduced-motion behavior are requirements, not optional alternatives to the 3D experience.

Nostr adds independently verifiable authorship, identity that survives a hosting change, and discovery across artist-selected relays. It does not store image bytes, guarantee availability, determine copyright, authenticate a physical painting, or settle a payment. Bitcoin Lightning and BTCPay supply payment paths; the artist's private bookkeeping records remain outside public relays.

| User action | Protocol responsibility | Benefit visible to the user |
| --- | --- | --- |
| Preview an imported website | Local JSON; no Nostr connection | Try a gallery before creating an identity |
| Publish a reviewed gallery | Artist signs an addressable event; relays distribute it | Keep the same gallery identity across hosts and viewers |
| Open a gate | Resolve the destination artist's signed gallery by key | Artist-to-artist discovery without one central directory |
| View a work in another client | Reuse NIP-68 picture events and NIP-99 listings | The work can travel beyond Relay Gate |
| Tip or buy | NIP-57/LNURL or the artist's BTCPay/shop | Pay the artist directly, with a clear receipt boundary |
| Inspect a certificate | Verify issuer signature and referenced image digest | Inspect what the artist actually attested |

The first visit is calm: artwork and navigation, no login wall or game HUD. Optional play controls belong behind a deliberate action. A newcomer connects an external signer only when publishing, following, or making a signed interaction. Plain Lightning payments may be offered without a Nostr identity; they must not be labeled signed zaps. There is no per-call charge in the core protocol. Optional curation and referral services must remain separable from free import, viewing, export, and self-hosting.

## 2. Identity, signing, and publication

The authoritative artist identifier is the NIP-01 32-byte public key, lowercase hexadecimal on the wire. `npub` is a display form, and NIP-05 is a domain-controlled identity hint rather than a substitute for signature validation. The maintainer's supplied identity is `npub10m0uf224v7tly6k6h8gl6kkmuhmx7969gmudmmhqj5pv65e03r9sxsumee`, with the supplied identifier `tj@tjm.art`; runtime clients must independently check current NIP-05 mappings.

Relay Gate must never request, receive, generate, store, or log a Nostr private key or `nsec`. Browser signing uses NIP-07; Android may use NIP-55. A CLI can hand review/signing to a browser or an external NIP-46 bridge. NIP-46 requires client transport keys: those must be owned by the external bridge, not implemented as a hidden private-key store in Relay Gate. Pairing credentials must not enter gallery data, shell history examples, telemetry, or source control. An adapter exposes only `getPublicKey()` and `signEvent(unsignedEvent)` to the gallery application. Reject a returned signature whose author, kind, content, tags, or timestamp differs from the reviewed request.

Publishing requires an explicit preview of identity, public fields, works, destinations, and payment recipients. Reading a website proves no ownership and never authorizes publishing under its author's name. The publisher affirms rights to the imported content. A failed or declined signature leaves an unsigned local draft.

Publish picture and listing events first, then the manifest that references their exact IDs. Track relay `OK` acknowledgments independently. Proposed success policy: at least two user-selected relays accept every required event; otherwise show a partial result and retry the same signed bytes. An acknowledgment is not an archival guarantee. Export signed events and media hashes locally for recovery, and permit user-selected relay replication. Never silently substitute the application's key for the artist's key.

## 3. Event model and interoperability

These are **proposed Relay Gate conventions**, not claims of NIP acceptance. NIPs themselves are optional and relay/client support varies. The NIP index and kind registry were inspected on the review date. No entry for 37440 or 37441 was found there; that is not a reservation or proof that no other implementation uses them. Recheck the registry and discuss interoperability before deployment.

| Object | Kind | Existing standard and proposed use |
| --- | --- | --- |
| Profile | 0 | NIP-01 / NIP-24; display metadata and payment hints |
| Follows / artist collections | 3 / 30000 | NIP-02 / NIP-51; optional discovery seeds |
| Picture / picture collection | 20 / 30006 | NIP-68 / NIP-51; works and portable curator selections |
| Sale listing | 30402 | NIP-99; price, status, description, image, seller |
| Gallery manifest | **37440, experimental** | Addressable under NIP-01; new schema and semantics below |
| Artist certificate revision | **37441, experimental** | Addressable under NIP-01; new attestation semantics below |
| Relay preferences | 10002 | NIP-65; discover the artist's write relays |
| Media server preferences | 10063 | NIP-B7 / Blossom BUD-03 |
| Viewer handler / recommendation | 31990 / 31989 | NIP-89; optional cross-client opening |
| Zap request / receipt | 9734 / 9735 | NIP-57; separate from sales and gallery publication |
| Deletion request | 5 | NIP-09; best effort withdrawal, not guaranteed erasure |
| Timestamp attestation | 1040 | NIP-03; **unrecommended upstream, gated pending review** |

NIP-51 picture sets remain useful for curators, but do not define physical dimensions, room layout, or gate semantics. NIP-78 application data is an alternative for an early private prototype, not evidence of interoperable gallery support. Kind 37440 is proposed to make public gallery discovery explicit. Selecting it requires a new gallery NIP or a documented interoperable extension, with examples and implementation evidence. Do not repurpose an assigned kind with incompatible meaning.

### 3.1 Gallery manifest

Identity is `(37440, artist pubkey, d)`. The `d` value is a stable, nonempty identifier such as `main`, independent of title and host. A gate targets this coordinate, not a hostname. Share it as a NIP-19 `naddr` containing kind, key, identifier, and optional relay hints; an HTTPS viewer URL is a convenient wrapper.

The unsigned example below uses readable placeholders, not valid signed events. Event IDs, public keys, and signatures in real events must meet NIP-01 encoding rules. `content` is a JSON string containing the object shown separately.

```json
{
  "kind": 37440,
  "created_at": 1792454400,
  "tags": [
    ["d", "main"],
    ["title", "Studio paintings"],
    ["t", "relaygate"],
    ["r", "https://artist.example"],
    ["e", "<picture-event-id>", "wss://relay.example"],
    ["a", "30402:<artist-pubkey>:work-17", "wss://relay.example"],
    ["a", "37440:<other-artist-pubkey>:main", "wss://other-relay.example"],
    ["p", "<other-artist-pubkey>", "wss://other-relay.example"]
  ],
  "content": "<JSON-encoded object below>"
}
```

```json
{
  "schema": "relaygate/manifest/1",
  "title": "Studio paintings",
  "layout": { "algorithm": "walls-v1", "seed": "main" },
  "works": [
    {
      "id": "work-17",
      "eventId": "<picture-event-id>",
      "imageIndex": 0,
      "sizeIn": { "w": 24, "h": 36 },
      "sizeSource": "artist-reviewed",
      "listing": "30402:<artist-pubkey>:work-17"
    }
  ],
  "gates": [
    {
      "target": "37440:<other-artist-pubkey>:main",
      "label": "Another studio",
      "relays": ["wss://other-relay.example"]
    }
  ],
  "referral": { "enabled": true, "shareBasisPoints": 1000, "scope": "zaps" }
}
```

Proposed validation rules:

- Exactly one nonempty `d`; supported `schema`; maximum encoded manifest size 256 KiB, 500 works, 32 gates, and 8 relay hints per destination. Larger galleries require an explicit future pagination design. The importer may produce more works; publishing must explain and resolve the limit rather than truncate silently.
- Work IDs are unique within the gallery and survive title edits. Every `eventId` must resolve to a valid kind-20 event signed by this gallery's artist; `imageIndex` selects an existing `imeta`. Every referenced listing must have the same artist key. A curator links to another artist's gallery instead of claiming authorship of its works. A later curator manifest needs an explicit attribution model.
- Tags expose search references; JSON supplies their role. Exact picture, listing, and gate references must be present in corresponding `e`/`a` tags. Gate `p` tags mirror destination keys. Reject contradictory references; do not infer a gate from an arbitrary `a` tag. Do not use the fourth `e` field as an invented work ID.
- `sizeIn` is positive finite width and height in inches, or `null`. Pixel dimensions never become physical dimensions. Store review provenance. `layout` selects a known deterministic algorithm; manifests cannot inject executable code, shaders, or HTML.
- Reject unknown major schemas for rendering and preserve them for export. Ignore unknown optional fields. Render titles as text; sanitize any supported Markdown. Apply URL/protocol, event-count, image-byte, and texture-dimension limits before loading untrusted content.

Updates use the same coordinate and a later `created_at`. Select the newest verified candidate; for equal timestamps use the lexically lowest event ID per NIP-01. A proposed five-minute future-clock tolerance prevents one far-future event from hiding subsequent updates; flag it rather than treating relay arrival order as truth. Keep locally observed revision IDs and deletion requests. Honor valid NIP-09 requests from the author, while explaining that relays may retain copies. A missing or deleted destination remains a labeled unavailable gate with a route back, never a fabricated replacement artist. Changing keys is a separate recovery/migration problem; a website redirect alone cannot transfer authorship.

### 3.2 Works and listings

Publish one reviewed work as a kind-20 picture event, using NIP-68 `title` and `imeta` (`url`, MIME `m`, pixel `dim`, SHA-256 `x`, and `alt` where known); content is the artist's description. Keep the original source-page `r` tag. The manifest holds the stable work ID, physical dimensions, and selected image index; those are Relay Gate schema fields, not standardized NIP-68 physical-size tags. Multiple source photographs may be distinct imported candidates until the artist groups them in review. A changed regular picture event gets a new ID and a new manifest revision.

An optional NIP-99 kind-30402 listing uses stable `d`, `title`, `published_at`, `image`, `price` (decimal string and currency), and `status` (`active` or `sold`). An `e` reference links its picture. A checkout `r` link is a Relay Gate convention and must be shown as an external destination. A listing is an offer, not a receipt, inventory lock, sales contract, or certificate. Order creation must recheck authoritative inventory and price; multiple buyers cannot reserve the same original based solely on relay state. Kind 30403 is for drafts/inactive listings but remains public if transmitted; local drafts stay local.

### 3.3 Media and relay discovery

Images remain on the source site or an artist-authorized host. Uploading or mirroring requires explicit consent; HTTP accessibility is not a license. Blossom is the proposed optional replicated media layer: address objects by SHA-256, discover server preferences through NIP-B7, and verify downloaded bytes against signed hashes. Relays store metadata, not arbitrary image bytes. Keep independent copies and source attribution. A media hash proves byte identity, not copyright or who made a physical work.

Read flow:

1. Decode the shared coordinate, validate its kind/key/identifier, and try its bounded relay hints plus the visitor's configured relays.
2. Fetch the artist's latest kind-10002 relay list, then query their write relays for `{"kinds":[37440],"authors":["<hex-key>"],"#d":["main"]}`. Treat hints as untrusted network destinations, not trust anchors.
3. Validate signatures and manifest revisions locally, fetch exact picture IDs and listing coordinates in bounded batches, and build a local render config. Never replace a missing signature check with HTTPS trust.
4. Resolve gates on approach or selection. Cache verified results and show stale/offline status. Close subscriptions after EOSE or an eight-second timeout; cap live relay connections at four by default. No endless recursive gate crawl.

Initial configurable bootstrap relays, approved in #69: `wss://relay.damus.io`, `wss://nos.lol`, and `wss://relay.primal.net`. Their availability, policies, and custom-kind support are not guaranteed. Failure at one relay must not disable local viewing. Discovery can start from follows, picture sets, explicitly selected artists, or opt-in relay searches; there is no claim of a complete global directory.

NIP-89 can advertise a future viewer for 37440 using a `k` tag and a `web` URL template with `naddr`. Only use handlers the visitor trusts or explicitly chooses; arbitrary relay-supplied handlers are a phishing surface. Publishing a handler or hosting a viewer remains a later, separately authorized action.

## 4. Importer and engine contract

The importer takes an HTTP(S) artist website URL and produces an unsigned, reviewable local config. It must respect robots.txt on pages, sitemaps, image origins, and redirects; use bounded requests, timeouts, rate limits, and clear partial-failure reporting. Discover through sitemaps, JSON-LD, page metadata, image tags, and same-site links. It must not bypass login, execute website scripts, or claim that all possible websites are machine-readable. Scripts-only sites need manual additions or a later separately scoped rendering adapter.

Every plausible artwork image is a candidate, including images outside JSON-LD; explicit skips, known interface assets, and exact duplicate images may be excluded with reasons. Keep source URLs, raw dimension text, inferred-title provenance, and unknown values. `data-relaygate-skip` is the explicit exclusion attribute; preserve `data-slipgate-skip` as a legacy alias. Do not infer physical size from pixels or silently label an estimated hanging size as true size.

Proposed engine input (the current importer is being completed in #1):

```json
{
  "schema": "relaygate/gallery/1",
  "generatedAt": "2026-10-20T00:00:00.000Z",
  "artist": { "name": "Artist", "siteUrl": "https://artist.example/" },
  "works": [
    {
      "id": "stable-source-derived-id",
      "title": "Painting title",
      "image": "https://artist.example/painting.jpg",
      "localImage": "images/stable-source-derived-id.jpg",
      "sha256": "<hex-digest-of-downloaded-bytes>",
      "page": "https://artist.example/work/painting",
      "size": "24 × 36 inches",
      "sizeIn": { "w": 24, "h": 36 },
      "medium": "oil on canvas",
      "year": 2024,
      "source": "json-ld"
    }
  ],
  "gates": [],
  "warnings": []
}
```

Unknown optional fields are `null` or absent according to the importer schema; unknown `sizeIn` is explicitly `null`. Absolute remote image URLs and relative local paths must both work. The engine accepts the plain config; a separate Nostr resolver verifies events and maps them to the same input. Importing does not imply signing, publishing, deploying, paying, or granting rights.

The shared gallery engine is a separate dependency. Its adapter needs `loadGallery(config)`, deterministic layout, `addGates(destinations)`, and `mount(element, options)`, with disposal of textures, subscriptions, and controls. Known sizes convert inches to metres with 0.0254; unknown sizes use a clearly labeled display estimate (for example a one-metre longest side), preserving aspect ratio. Do not build a new engine in the importer issue. Gates require an exit/back route, unavailable-state handling, and no dead ends. A 2D view must remain usable if WebGL fails.

## 5. Zaps, sales, and referrals

### 5.1 Direct payments and receipt trust

A NIP-57 zap request (9734) is sent to the recipient's LNURL-pay endpoint, not broadcast as a normal relay event. The payer approves the recipient and amount. The endpoint advertises Nostr support and a signing key, returns a BOLT11 invoice, and publishes a 9735 receipt after its payment process. Validate the request signature, intended target and amount, invoice description hash, and the receipt author's advertised key. A signed receipt is the provider's assertion; the receipt or an included preimage alone is not independent proof of settlement. The artist's wallet/payment backend is the source for financial reconciliation. [NIP-57]

A standard wallet can pay an invoice without learning Nostr. Nostr Wallet Connect (NIP-47) is an optional wallet adapter, not the artist identity signer. Wallet credentials and spending permissions belong in the external wallet integration, never the public manifest. Payer cancellation, expiry, unsupported wallets, and unavailable LNURL endpoints must preserve a usable gallery and shop link.

### 5.2 Referral policy

Decision recorded in #69: **default referral share 10% of zaps; no BTCPay sale split initially**. A referrer is the artist or curator whose gate the visitor deliberately followed. The receiving artist must opt into the policy; it is not a mandatory platform tax. When no eligible referrer exists, 100% goes to the receiving artist. Self-referrals are ineligible. No multi-level or recursive commissions.

Proposed v1 attribution is the most recent explicit gate traversal in the current tab session, expiring after 30 minutes. Direct links do not create a referral. Store only source coordinate, destination coordinate, traversal time, and policy revision locally; disclose the named recipient and split before payment. No cross-site identity tracking or hidden cookie. This is client-observed attribution and can be forged: it is suitable for voluntary tips, not an enforceable advertising or sales attribution guarantee. A later signed referral claim would need its own protocol review and replay/abuse model.

NIP-57 weighted `zap` tags can express recipients where the target event author has already chosen them. They do not authorize rewriting an artist's signed event for a new gate visitor. For dynamic gate referrals, v1 proposes a disclosed **two-payment plan** approved by the payer: compute 10% using integer millisatoshis, round the referral down to the wallet's supported precision, and allocate the remainder to the artist. Each recipient uses its own LNURL request/invoice; do not pretend two receipts describe one recipient's payment. If recipient minimums make the split impossible, offer an unsplit artist tip or a larger amount. If a leg fails, show each actual result, retry only the unpaid leg with fresh approval as necessary, and never announce a full payment. Unsupported clients may simply pay the artist; the protocol cannot force a commission.

Proposed alternative for later review: artist receives the full tip and periodically pays accrued referral commissions. This simplifies payer UX but creates a payable, operational trust, and reconciliation duties. It is not automatically enabled. Neither alternative authorizes a BTCPay sale commission. Paid curation, optional hosting/support, sponsorship, and commercial referral terms belong in separate research tickets and cannot alter this default without a decision.

### 5.3 BTCPay sales

Use the artist's store, server-side least-privilege Greenfield access, and an application order ID. Bind the reviewed work/listing revision and price in the private order record. Redirect to BTCPay's returned checkout URL. Store webhook identity, verify `BTCPay-Sig` as HMAC-SHA256 over exact raw bytes, and compare in constant time before processing. Deduplicate deliveries and reconcile by fetching invoice `status` and `additionalStatus`; a browser success redirect is not payment confirmation. Cover partial, overpaid, expired, late, invalid, and settled states. Retry invoice creation only through persisted application idempotency. Backfill missed events. API credentials never enter the browser or Nostr events. [BTCPay API] [BTCPay examples]

No initial sale splitting or automatic certificate transfer. A settled sale queues fulfillment and a certificate review/signing action. Refunds, inventory exceptions, and shipping remain explicit merchant workflows. Existing card/shop checkout is an external link; do not claim its sales are logged unless an adapter actually reconciles them.

## 6. Private money records and bookkeeping

A proposed append-only JSONL journal stores observations, recognized transactions, adjustments, and export mappings. Do not put customer identity, addresses, invoice metadata, wallet secrets, or the ledger on public relays. Public listing status can change without naming a buyer. Encrypt private backups and support full local export. A static viewer cannot securely hold merchant API credentials; reconciliation needs an artist-controlled local process or backend.

Each financial record has a schema version, immutable entry ID, UTC occurrence/observation times, event type, source system, source transaction ID, order/group ID, artist/work/listing references, settlement state, and evidence pointers. Amounts use integer millisatoshi strings or fixed-decimal fiat strings, never floating-point money. Keep gross, referral expense, network/processor fee, tax, refunds, and actual net movement separately. Include a valuation object with fiat currency, amount, rate, provider, and rate timestamp; absent valuation stays pending rather than silently using today's price. Retain source amounts alongside conversions.

Deduplication keys:

- Lightning: payment hash plus direction and wallet/account identity, not receipt event ID. Multiple relay copies or reissued zap receipts are evidence for one payment.
- BTCPay: server/store/invoice plus underlying payment identifier and transaction type. Invoice settlement and each payment observation must not both become income. If BTCPay and a wallet expose the same Lightning hash, link the observations to one recognized transaction.
- On-chain: network, transaction ID, output index, account and direction. A transaction-level identifier alone cannot distinguish multiple outputs.
- Corrections/refunds: new entries explicitly reference prior entries; never mutate or delete the historical record. Reorgs and reversed settlement require reversal/reclassification, not a second sale.

Preserve the approved **gross income plus separate referral expense** presentation, with an explicit settlement model. Example of artist-funded commission: a 10,000-sat tip yields 10,000 income, 1,000 referral expense, and 9,000 net before fees. If two invoices deliver 9,000 directly to the artist and 1,000 to the referrer, the journal must record the real destinations. Gross presentation then also needs an expressly agreed artist-funded commission and a non-cash clearing entry for the payer's direct settlement of that payable; it must not invent a 10,000-sat wallet deposit. Without that agreement, retain two recipient payments and require accounting review rather than automatically treating the referrer's money as artist income. This unresolved policy is an implementation gate.

Exports are deterministic projections of this journal, with reconciliation totals and a stable export ID. A normalized CSV contains entry IDs, dates, type, source IDs, work/order, original units, valuation, gross, expenses, tax, net, and correction links. Escape spreadsheet formula prefixes in untrusted text fields. Also provide JSONL; GnuCash, Akaunting, and Beancount mappings are separate tested adapters, not interchangeable import formats.

QuickBooks Online is a proposed optional connector, not a claim that arbitrary CSV imports create valid sales receipts. Map an approved chart of accounts: income by work/service, Bitcoin/Lightning clearing asset, referral expense, fees, and tax liabilities where configured. A paid sale may map to SalesReceipt; already-invoiced sales require payment reconciliation instead. Avoid duplicating income when bank feeds or settlements later arrive. Persist `(company, journal entry, projection version) -> remote entity ID, SyncToken, requestId`; reuse the same request ID for retry of the same operation and re-read uncertain results before creating another entry. Use OAuth authorization and company-specific account/item/currency mappings. Confirm required fields and tax behavior in Intuit's sandbox before implementation; the interactive entity pages could not be fully inspected during this review. Do not assume Bitcoin is a supported QBO transaction currency. [Intuit SalesReceipt] [Intuit request IDs]

Accounting acceptance tests must cover duplicate receipts, out-of-order webhooks, partial split success, missing FX, refund/reorg reversals, overpayment, retry after remote timeout, and matching export totals to actual wallet movement. Account classification and gross treatment need the artist's bookkeeper's approval; this is a software data contract, not a determination of tax treatment.

## 7. Certificates and provenance

Preserve the #69 decision: issue an artist-signed certificate for an original, provide a QR label and an in-gallery verification view, then add transfer workflows. No tapd or artist-operated Lightning node is required for this goal.

Proposed kind 37441 uses `d = stable work ID`, signed by the original artist. Content schema `relaygate/coa/1` includes work ID, exact picture event ID, image SHA-256, physical dimensions, medium/year/edition if reviewed, an unpredictable public label identifier, revision reason, and optional previous certificate event ID. `e` tags reference the picture and prior revision; an `a` tag links its gallery/listing where applicable. A buyer public key is optional and requires consent; no buyer name or address is required. A QR points to the issuer/work coordinate and the exact issued revision ID so later replacement does not erase what a label originally asserted. Keep an independent archive of all issued signed revisions because addressable-event relays may discard history.

Verification distinguishes: signature valid, issuer identity recognized by the viewer, image hash matching, revision status, timestamp status, and claimed ownership. These are separate signals. A copied QR is not a tamper-proof link to a physical object. A signature attests what that key said; neither it nor a timestamp proves authenticity, legal title, or copyright.

**Timestamp review gate:** current NIP-03 is explicitly marked unrecommended due to an attack requiring an update. Do not ship a trusted NIP-03 verifier or promise Bitcoin-anchored authenticity until the issue and chosen verifier are reviewed. Its current 1040 format references an event ID and carries base64 OTS file data with a completed Bitcoin attestation. Pending proofs must remain visibly pending. The intended milestone can issue/verify artist signatures and labels first; timestamp integration needs a reviewed approach, documented threat model, and invalid/pending/mismatched-digest vectors. Preserve local signed certificates and detached proof artifacts for that review. [NIP-03]

A later transfer is an explicit artist-approved revision referencing the prior certificate and a privately confirmed sale. It must wait for an authorized external signer; a payment webhook cannot sign as the artist. Proposed buyer acknowledgment and dispute/revocation semantics need a provenance extension/new NIP and privacy review before implementation. Competing transfers must surface as conflicts; “latest event wins” alone is not a trustworthy chain of ownership. Buyers without Nostr can still buy art and receive a certificate without a public owner key, then optionally connect a signer later.

## 8. Delivery plan and OpenSats basis

Approved scope from #69: **six months, 50% time, $27,000 requested**, no prior or other funding reported for this work. This is the artist's approved application plan, not an OpenSats award. Rough capacity is 520 hours; estimates below are planning allocations, not concurrent full-time commitments.

| Stage | Hours | Reviewable exit evidence |
| --- | ---: | --- |
| M0 importer and review contract | 70 | Reproducible fixtures; robots/rate-limit tests; dimensions and unknowns preserved; partial-failure report |
| M1 signer and publisher | 100 | External signer flow; permission rejection; verified signed events; two-relay publication/recovery tests; no secret-key inputs |
| M2 viewer/gates and certificate issue/verify/label | 130 | Shared-engine adapter; no-account visit; unavailable-gate/back navigation; cross-host identity; signature/QR fixtures; timestamp review decision |
| M3 payments, journal, transfer design | 100 | Realistic payment sandbox evidence; split/receipt failure tests; gross/net reconciliation; reviewed transfer schema |
| M4 exports, accessibility, artist trials, documentation | 80 | Repeatable export reconciliation; QBO sandbox if feasible; 3–5 consented artist trials; keyboard/grid/reduced-motion checks |
| Integration, security review and contingency | 40 | Cross-client findings, recovery exercise, unresolved risks documented |
| **Total** | **520** | |

| Budget item | USD |
| --- | ---: |
| Development | 22,800 |
| AI / compute tools | 1,200 |
| Infrastructure | 900 |
| Payment testing | 300 |
| Onboarding and Spanish documentation | 1,800 |
| **Total requested** | **27,000** |

The trial count and milestones are targets, not completed work. Shared-engine readiness, external signer support, relay retention, custom-kind adoption, NIP-03 review, wallet split UX, and bookkeeping mappings are dependencies. If blocked, preserve interoperable local exports and signature verification; report the blocked capability rather than imply it exists. Room scans/Gaussian splats, device memory features, automatic sales commissions, and a hosted commercial service are outside this grant baseline.

Public benefit: a reusable MIT importer and gallery schema; artist-controlled portable metadata; useful Nostr picture/listing interoperability; direct Bitcoin payment and reconciliation tooling; clear education for artists who are not already Nostr users. All funded source and educational outputs should remain openly licensed. OpenSats' official application emphasizes Bitcoin utility, free/open-source work, and transparency/education. Recheck its current application and reporting requirements at submission; this spec does not assert a fixed deadline, required video length, award, or submission. [OpenSats]

Proposed trial measures: completion rate from URL to reviewed gallery, time to first useful preview, correct/unknown dimension rate, successful account-free visits, artist-to-artist gate traversal, successful paid invoices and reconciled exports, and portability to a second viewer/relay set. Use consented tests and aggregate observations, not invasive visitor analytics. Protocol adoption should follow useful art experiences, not a forced account-creation funnel.

## 9. Decisions still needed

1. Review the experimental gallery kind/schema with another client implementer and resolve any registry conflict before public interoperability claims.
2. Choose and review the external NIP-46 bridge; Relay Gate itself cannot handle its transport private keys under the project's key boundary.
3. Resolve the upstream NIP-03 warning and select a reviewed timestamp path. Signature-only certificates can proceed independently.
4. Confirm whether voluntary two-invoice referrals are artist-funded commissions or independent tips, and approve the journal treatment with a bookkeeper. Keep the approved 10% zap / 0% sale policy meanwhile.
5. Choose artist-controlled media storage, FX source, and QBO account mappings during implementation. No default paid provider or service commitment is implied.
6. Agree the shared engine adapter and performance budgets with its maintainer. The importer is not a replacement engine.

Questions and status updates for Studio manager belong on the implementation PRs; check those PRs for replies. Do not comment on or close tracker #69 or #1 from this workflow. The separately requested community/revenue research may create and maintain its own tracker tickets.

## Sources and review notes

Primary sources inspected 2026-10-20 UTC. Protocol documents can change; implementers must pin and test the versions they adopt. The designs, limits, milestones, and proposed extensions above are Relay Gate decisions, not upstream requirements.

- [NIP index](https://github.com/nostr-protocol/nips) and [kind registry](https://github.com/nostr-protocol/registry-of-kinds/blob/master/schema.yaml).
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md), [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md), [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md).
- [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md), [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md), [NIP-55](https://github.com/nostr-protocol/nips/blob/master/55.md).
- [NIP-68](https://github.com/nostr-protocol/nips/blob/master/68.md), [NIP-99](https://github.com/nostr-protocol/nips/blob/master/99.md), [NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md), [NIP-B7](https://github.com/nostr-protocol/nips/blob/master/B7.md).
- [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) and [NIP-47](https://github.com/nostr-protocol/nips/blob/master/47.md).
- [NIP-03](https://github.com/nostr-protocol/nips/blob/master/03.md), including its current unrecommended status.
- [BTCPay API](https://docs.btcpayserver.org/Developers/api/) and [BTCPay examples](https://docs.btcpayserver.org/Developers/api/examples/).
- [Intuit SalesReceipt](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/salesreceipt), [Intuit request IDs](https://developer.intuit.com/app/developer/qbo/docs/learn/learn-basic-field-definitions#request-id), and [Intuit SDK request-ID discussion](https://github.com/intuit/QuickBooks-V3-PHP-SDK/issues/563). Interactive documentation requires implementation-time verification.
- [OpenSats](https://opensats.org/apply).
