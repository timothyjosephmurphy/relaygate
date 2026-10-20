# Competitive landscape and demand evidence

Research date: 2026-10-20. Refs timothyjosephmurphy/studio-tracker#188.

## Decision proposed for review

Test whether an artist can turn an existing artwork website into an exhibition
they can maintain, move and connect to other artists. The first audience is
working artists with a website and a forthcoming show; at least three of the
first five participants should not already use Nostr. Keep guest viewing,
artwork details, an accessible list and an ordinary inquiry link available
without a wallet or account.

This is a product hypothesis, not demonstrated demand or a launch plan. The
repository has an importer; several proposed integrations are being reviewed
in separate PRs. No participant has committed to Relay Gate in this research.
The next decision should follow the [validation protocol](market-validation.md),
not the number of possible features.

## How to read the evidence

| Grade | Evidence | What it supports | What it does not support |
|---|---|---|---|
| A | Dated primary document or directly inspected public artifact | The document, listed feature, decision or exhibition exists | Independent performance, revenue, retention or causality |
| B | Identifiable person's first-hand public account | That person described a need or experience at that time | Representative demand, current need, consent or willingness to pay |
| C | Search excerpt or inaccessible original | A lead for later verification | A product claim or validated demand count |
| H | Our inference or proposed experiment | A testable decision | A finding already established |

Vendor statements remain vendor statements even when graded A. Published
features were researched, not exercised in accounts. No paid plans, competitor
benchmarks, customer interviews or sales conversions were tested. Features not
documented below are **unknown**, not absent. Prices are deliberately omitted;
compare live plan terms before any purchase decision.

## Overlap and useful comparison targets

| Product or alternative | Primary evidence and date | Overlap with Relay Gate | Decision consequence and evidence limit |
|---|---|---|---|
| ArtPlacer | Virtual exhibitions, website embedding, purchase links and AR are advertised [S1]. Its directory listed October 2026 shows when checked [S2]. Labels and presentation documents are also offered [S3]. A | Artist presentation, own-site visitor flow, artwork labels | A 3D room or printable label alone is not distinctive. Use it as a presentation benchmark. A directory shows activity, not incremental sales or audited customer totals. |
| Kunstmatrix | FAQ lists audio guides, tours, teleporters and embedding [S4]. The 2026-09-29 changelog describes a promotion kit with links, QR, website embedding and PDF catalogs [S5]. A | Connected exhibitions, guided stories and promotion | Do not describe gates, narration or QR promotion as unprecedented. Compare whether artists can retain independently usable records and move their exhibition. Neither usability nor export behavior was tested. |
| New Art City | Official docs describe guest browser access, co-presence/chat [S6], a 2D accessible catalog [S7], and export of published worlds as static website files for supporters [S8]. A | Multiplayer art spaces, accessible viewing and self-hosted archives | Account-free viewing, a list alternative and export already have precedents. Test restoration and editing separately from a static archive; the export page does not establish portable multiplayer hosting. |
| Artsteps / Metasteps | Artsteps advertises multimedia, narration, website embedding and paid curation [S9]. Its 2025-09-15 announcement describes Metasteps portals, guided paths and branded hubs [S10]. A | Storytelling, connected spaces, curation services | Include Metasteps in a current comparison instead of treating Artsteps as static. The announcement is vendor positioning, not measured demand or proof of migration success. |
| Buybitart / BitcoinArt | Open-source repository describes self-hosted physical-art sales/auctions with Bitcoin payment options; roadmap includes Nostr login and 3D/VR/AR [S11]. A | Closest combination of art commerce, ownership and planned spatial/Nostr features | Consider schema/payment integration or collaboration before duplicating a shop. The README has inconsistent database descriptions; deployment and payment compatibility need code-level verification. No adoption or sales figures were established. |
| Shopstr | Public repository describes Nostr commerce and Bitcoin payments, with external-signer NIPs among its integrations; GPL-3.0 license [S12]. A | Existing commerce and listing infrastructure | Prefer a listing/checkout boundary over rebuilding commerce. A NIP list is not an interoperability test. License review is needed before code reuse; Relay Gate still accepts external signing only. |
| Plebeian | Accepted October 2026 ADR specifies four CometBFT validators, three required for finality, with Nostr for transport/audit [S13]. A | Auctions and public verifiable records | Its fake-collateral prototype and separate real-money gate supersede reliance on an August development-status post. The ADR is not evidence of live art auctions, a compatible Relay Gate adapter or production monetary security. |
| Mozilla Hubs / community Hubs | Mozilla ended its hosted offering and support on 2024-05-31; its notice points to community stewardship [S14]. The annual report places Hubs among exits during strategic realignment [S15]. A | Social 3D spaces and continuity after a host exits | A recovery/export drill matters even for open source. Mozilla's service ended; that does not establish that the community project ended or that visitors rejected 3D art. |
| Artist's current website and shop | The first-party Square discussion includes artists describing existing online selling and setup problems [S16]. B | The job may be presenting work, receiving inquiries or maintaining a site, with no spatial requirement | Treat the existing site as the default competitor. Test reduced workload and completed visitor tasks before asking the artist to maintain another destination. |

The plausible distinction is the combination of importing existing work,
portable artist-authored records and relationships that survive a viewer or
hosting change. That combination remains H until a working cross-client export
and recovery test and repeat artist use establish its value. “Nostr-powered” is
an implementation description, not a customer outcome.

## What prior attempts establish

**There is demonstrated exhibition activity, but no demonstrated Relay Gate
business model.** ArtPlacer's current directory [S2] and New Art City's examples
of university and festival exhibitions [S17] establish that such exhibitions
have been published. New Art City's named examples include 2021 projects; they
must not be counted as current active customers. Neither source supplies
comparable retention, net sales or sustainable margin data.

**A discontinued service is not a causal experiment.** Mozilla documents the
Hubs shutdown [S14] and a broader strategic realignment [S15]. We did not find
product-specific financial or retention evidence sufficient to attribute that
decision to poor art demand, interface friction or an unsuccessful business
model. Hosting dependence is a reasonable design lesson, not an established
explanation for the closure.

**A product evolution is not proof of either success or failure.** Artsteps
describes Metasteps as a response to requests for customization and access
control [S10]. That is the company's stated rationale. Independent uptake,
conversion and migration outcomes remain unknown.

**Open-source code is evidence of work, not market adoption.** Buybitart,
Shopstr and Plebeian [S11–S13] are relevant implementations and potential reuse
targets. Stars, commits and roadmap ambitions are not paying-artist counts.
Live money behavior requires its own security and reconciliation review.

## Demand ledger

Public handles below identify the source of a statement, not a contact list or
permission to contact anyone. No outreach was sent. These are small, selected,
mostly historical samples with search and survivorship bias.

| ID | Person, date and source | Observed statement or behavior | Grade and inference limit | Question worth testing |
|---|---|---|---|---|
| D1 | MythDotHouse, 2023-08-19, Square [S16] | Asked other virtual-gallery owners what their websites should contain; described an online art shop with no sales yet | B. “Gallery” meant an art website, not necessarily 3D. No Relay Gate interest or budget | Is missing presentation, audience reach or transaction confidence the actual problem? |
| D2 | Ccfbarb, 2023-08-20, same Square thread [S16] | Described difficulty setting up a Square site and wanting marketing help while selling on Etsy | B. A second voice in one thread, not an independent market study; could favor a service over new software | Would fixed-scope website/import help be more useful than another gallery tool? |
| D3 | frugalacademic, 2022-03-18, r/MuseumPros [S18] | Asked about 3D gallery alternatives and self-hosting; follow-up emphasized embedding on their own website | B. Direct historical request, but self-hosting and embedding are conflated. Existing products already support embedding | Is a site embed sufficient, or must the exhibition operate after the vendor disappears? |
| D4 | Christine Chung, 2020-07-01, OCADU graduate research blog [S19] | Evaluated exhibition tools for a cohort and identified accessibility, language and ease-of-use needs | B for the evaluator's needs, A for the dated report. It is not a current accessibility audit or procurement commitment | Can visitors complete the same tasks with keyboard, screen reader and touch controls? |
| D5 | Buybitart maintainers, undated README checked 2026-10-20 [S11] | Published a roadmap combining physical Bitcoin art sales with Nostr and spatial presentation | A for published roadmap, H for relevance to Relay Gate. Builder intention is not buyer demand | Can a useful art-data/payment boundary serve both projects without a new marketplace? |
| D6 | Arielle Livernoche website test requested by TJ | Candidate technical import fixture | Not a demand observation. A website test is neither artist consent nor a partnership | Does an authorized artist approve the imported titles, images and dimensions before any exhibition? |

Other Reddit leads recorded in tracker #188 remain C where the original thread
was not inspected; they are excluded from the evidence count. The old UCLA
Artsteps tutorial returned 404 on direct retrieval during this check, although
search retained historical text. It is not used to assert current product
behavior. Public professional relevance and a public contact route do not
establish expressed interest in this project.

## SWOT with actions

These are strategic judgments (H), informed by the evidence above rather than
scores measured in a market study.

| Area | Assessment | Action and falsification condition |
|---|---|---|
| Strength | Open-source importer and a proposed artist-controlled record/relationship model fit existing websites | Measure correction work, restore on another host and preserve artist identity. If importing is slower than manual entry, narrow supported inputs before expansion. |
| Strength | Ordinary links, optional Lightning and physical labels can connect exhibitions to existing practice | Keep each path independently useful. If visitors need protocol education to see a painting, revise onboarding. |
| Weakness | Maintained-engine integration, signing, payment reconciliation and support remain substantial work | Report working vs proposed capabilities separately. Do not recruit a live auction around an offline rehearsal. |
| Weakness | Unknown metadata, signer recovery and image rights create artist work | Time review and recovery tasks. Keep unknown sizes unknown; require permission for public display. |
| Opportunity | Artist co-ops, open studios and recurring group shows may value curation and shared discovery | Start with one consenting cohort and a second exhibition. A one-off demonstration does not pass the repeat-use gate. |
| Opportunity | Fixed-scope import, curation, story capture, labels and maintenance may fund free software | Test a defined deliverable and total price after discovery, without per-call billing. Record rejection and actual support cost; enthusiasm alone is not revenue evidence. |
| Threat | Established products already offer tours, portals, labels, embedding and some exports | Compare the same tasks against the artist's current tool. If Relay Gate provides no valued improvement, integrate or narrow the scope. |
| Threat | Navigation, bandwidth, accessibility and vendor/relay/media failure can undermine access | Make the list path and a complete offline recovery drill acceptance gates. A relay event alone does not preserve image bytes or a website. |
| Threat | Grants and unpaid support can hide an unsustainable service | Separate grant-funded engineering from service contribution margin; log all onboarding and support time. No grant award or paid demand is assumed. |

## Nostr value that must be demonstrated

1. **Authorship across hosts:** verify the same signed record after moving the
   exhibition. A signature attributes a statement to a key; it does not prove
   a painting's physical authenticity or copyright ownership.
2. **Artist relationships across viewers:** preserve an artist-approved gate
   when a domain or viewer changes. The visitor should follow a normal link;
   keys and relay settings should not be prerequisites to browsing.
3. **Recoverability:** restore records and permitted media from an export when
   the original host and one relay are unavailable. Relays, media mirrors and
   local backups solve different failure cases.
4. **Optional participation:** external NIP-07/NIP-46/NIP-55 signing can add
   portable publishing for artists. It must not become a visitor account wall.
   Signing interoperability still needs its own test; no private keys enter
   Relay Gate.

These are proposed protocol outcomes aligned with tracker #69, not claims that
main already implements them. Use artist-maintained work, successful recovery
and useful cross-gallery visits as outcomes; a new Nostr account count alone
does not show value. Tips, sales and disclosed service fees remain separate.

## Sources

All sources were checked 2026-10-20 unless an earlier publication date is noted.
Use the source and date together; vendor pages can change. Summaries are limited
to the claims relevant to the decisions above.

- S1: [ArtPlacer virtual exhibitions](https://www.artplacer.com/virtual-exhibitions/).
- S2: [ArtPlacer exhibition directory](https://discover.artplacer.com/exhibitions).
- S3: [ArtPlacer presentations](https://www.artplacer.com/presentations/).
- S4: [Kunstmatrix FAQ](https://www.kunstmatrix.com/en/faqs).
- S5: [Kunstmatrix changelog](https://www.kunstmatrix.com/en/changelog).
- S6: [New Art City about](https://info.newart.city/about).
- S7: [New Art City accessibility](https://info.newart.city/accessibility-on-new-art-city).
- S8: [New Art City world export/archive](https://info.newart.city/world-export-archive).
- S9: [Artsteps product page](https://www.artsteps.com/), retrieved as its public text page.
- S10: [Artsteps to Metasteps announcement, 2025-09-15](https://blog.artsteps.com/from-artsteps-to-metasteps-the-next-chapter-in-immersive-creation-5ddb6bc90a72).
- S11: [Buybitart/BitcoinArt source and README](https://github.com/buybitart/bitcoinart).
- S12: [Shopstr source and README](https://github.com/shopstr-eng/shopstr).
- S13: [Plebeian ADR-0017, accepted October 2026, pinned revision](https://github.com/PlebeianApp/market/blob/d4757b409b58e0ecf7c43e53629dd464c32dfb4e/docs/adr/ADR-0017-four-validator-bft-consensus-for-plebeian-auctions.md). Retrieved through GitHub's contents API; the web reader could not fetch the HTML page.
- S14: [Mozilla Hubs end-of-support notice, updated 2024-07-11](https://support.mozilla.org/en-US/kb/end-support-mozilla-hubs).
- S15: [Mozilla 2024 annual report: financing and strategic realignment](https://www.mozilla.org/en-US/foundation/annualreport/2024/article/financing-an-open-internet-mozillas-path-forward/).
- S16: [Square community: Looking for other Virtual Art Galleries, August 2023](https://community.squareup.com/t5/Artists-Makers/Looking-for-other-Virtual-Art-Galleries/td-p/677710).
- S17: [New Art City exhibition examples](https://info.newart.city/who-is-using-nac).
- S18: [r/MuseumPros: Virtual galleries: experiences?, March 2022](https://www.reddit.com/r/MuseumPros/comments/thbx71/virtual_galleries_experiences/).
- S19: [OCADU graduate research: Artsteps evaluation, July 2020](https://ocaduinclusivedesign.wordpress.com/2020/07/01/digital-platform-analysis-artsteps/).
