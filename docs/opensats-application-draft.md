# OpenSats application working draft

Unsubmitted, AI-assisted preparation for TJ's review. Write the final account in
TJ's own words, verify every claim, and map it to the current live form. This
document does not clear the reference-outreach hold in the existing application
workflow. No reference request or funder contact is included.

Use the [funding-readiness ledger](funding-readiness.md) for sources, missing
materials and overlap decisions. The figures below preserve the $27,000,
six-month, 50% plan recorded in the repository's [SPEC](../SPEC.md). The
acceptance-based work packages follow the proposed
[Nostr-first SPEC in PR #1](https://github.com/timothyjosephmurphy/relaygate/pull/1);
they remain a proposal while that review is open. The old SPEC's aspirational
feature claims and dated application instructions are not completion evidence.

## Project narrative draft

**Project:** Relay Gate. **Source license:** MIT.
**Repository:** https://github.com/timothyjosephmurphy/relaygate.
**Maintainer:** TJ Murphy. Legal applicant and private receiving details are
confirmed separately by TJ.

Relay Gate is an open-source project for artists who want to publish a useful
gallery on a website they control and remain discoverable when their hosting
changes. The proposed workflow imports artwork information from the artist's
existing site, lets the artist correct it, and connects the resulting gallery to
other artists through gates. Visitors should be able to view work and contact
an artist without creating a Nostr account or obtaining Bitcoin first.

Nostr supplies portable signed publishing and relay-based discovery. An artist
would approve events through an external signer, while galleries and gates
refer to public keys and stable event addresses. Relay Gate must never request
or handle a private signing key. Reusing picture, listing and payment standards
where they fit should make the work useful beyond one viewer. Gallery-specific
conventions require documented proposals and interoperability testing; adoption
by other clients is a goal, not an existing result.

The Bitcoin benefit is practical merchant tooling: artwork-related tips and
invoices paid directly to artist-controlled destinations, with payment evidence
that can be reconciled into bookkeeping exports. The design distinguishes tips,
sales, fees and refunds, preserves gross and net amounts, and treats partial
payments and failed splits explicitly. It does not promise automatic tax
compliance or custody of artist funds.

The repository already contains an importer and tests. Open review work adds a
more rigorous specification, broader importer coverage, a portable local kit
and pilot materials. Those artifacts are prior evidence. End-to-end external
signing, maintained-engine integration, reliable payment reconciliation and
observed artist outcomes still need delivery and verification. Relay Gate has
not launched, and no participant demand or completed pilot is claimed here.

The proposed request is $27,000 for six months at 50% time. Outputs would include
reusable source, protocol fixtures, a documented gallery review contract,
external-signer and relay recovery tests, a working viewer adapter, payment and
export evidence, and artist instructions. Success would be measured through
verified behavior and consented trials, including failures and the cost of
support. Commercial hosting or curation services would be separate from the
freely reusable core and outside this request.

## Future work and acceptance evidence

The following is a planning allocation, not a promise that every dependency is
already available. Month numbers start at a future agreed grant start date.
Before applying, freeze completed work as the baseline and revise the remaining
scope; do not seek payment for work already finished. The M0 allowance funds
remaining importer verification and fixes, not recreating an existing PR.

| ID / planned window | Hours | Future work and acceptance evidence | Dependency / fallback |
| --- | ---: | --- | --- |
| OS-M0 / month 1 | 70 | Import/review contract: representative sitemap, metadata and image-tag fixtures; robots, redirects and rate-limit evidence; correct or explicitly unknown dimensions; partial failures visible to the artist | Site formats vary. Preserve source URLs and editable unknowns; do not guess physical sizes |
| OS-M1 / months 1–2 | 100 | External-signer approval/rejection; validate signed events; publish to two relay endpoints; recover from one unavailable relay; document event-kind/tag conventions | Signer/relay behavior must be tested. Keep an unsigned local export usable if publication is declined |
| OS-M2 / months 2–4 | 130 | Maintained-engine adapter actually displays a rights-cleared catalog; no-account visitor flow; key-addressed gates with unavailable-target/back navigation; certificate issue/verify/label fixtures and QR resolution | No distributable engine entrypoint is established in this pack. Agree its license and adapter first. Certificates show the artist's signed statement, not independent authenticity proof; timestamps need separate review |
| OS-M3 / months 4–5 | 100 | Sandbox invoice/zap handling; idempotent journal entries; missing, duplicate, delayed and partial receipt cases; gross/net reconciliation; reviewed ownership-transfer design | No real-money commitments in this draft. Report unsupported wallet splits or transfer assumptions rather than implying settlement |
| OS-M4 / months 5–6 | 80 | Deterministic bookkeeping exports; QBO sandbox mapping if feasible; keyboard/grid/reduced-motion checks; 3–5 consented artist trials; English and Spanish instructions | Actual accounting-tool import behavior and partner availability must be checked. CSV portability remains useful when a connector is blocked |
| OS-INT / throughout | 40 | Integration, security review, recovery exercise, cross-client findings and unresolved-risk report | Reserve is finite; log which milestone uses it and agree any cut before expanding scope |
| **Total** | **520** | **About 20 hours/week across 26 weeks** | **All hours include review/documentation associated with their stage** |

The trial protocol targets five artists, including people unfamiliar with Nostr,
and four independent own-site completions in under 15 minutes. It measures
actual clock time, assistance and failures. This is a pilot target rather than a
funding guarantee. If only three or four consented trials are possible, report
that denominator and the untested target openly. Visitor tasks should test
account-free access, finding work and contacting an artist, not just 3D novelty.

Review at the end of month 2: if the engine or signer path remains blocked,
agree a reduced scope before committing to payment features. Keep the validated
import/export work useful on its own. Review at month 4: decide which export
targets have demonstrated mapping evidence; defer integrations that cannot be
tested honestly. Room scanning, an auction marketplace, automatic commissions
and a commercial hosted service are outside this baseline.

## Budget draft

USD planning amounts; no purchase, compensation or grant agreement is made by
this table. Actual payment and spending arrangements require owner review.

| Cost | Basis | USD |
| --- | --- | ---: |
| Development | $3,800/month × 6; approximately 520 hours total | 22,800 |
| AI and compute tools | $200/month × 6 | 1,200 |
| Infrastructure | $150/month × 6 for bounded testing/storage/relay needs | 900 |
| Payment testing | Up to $50/month × 6, subject to approved test scope | 300 |
| Onboarding and Spanish documentation | $300/month × 6; allocation and contributors to be confirmed | 1,800 |
| **Total requested** | **$4,500/month average × 6** | **27,000** |

Development implies approximately $43.85/hour ($22,800 / 520), not a separately
approved hourly contract. TJ should confirm whether this level supports the
stated commitment, including their own tax and overhead needs. The $1,800 line
must identify what is paid to other contributors or participants versus
maintainer time already covered above. No hidden unpaid full-time commitment
should be assumed. Prior and other funding must be re-attested by TJ at
submission; the public SPEC currently reports none.

Use sandbox/synthetic payment tests first. A budget line for test funds is not
permission to transfer funds or collect wallet credentials. Do not place payout
addresses, secret keys, tax forms, private invoices or reference emails in this
public draft. Other funding changes require the allocation procedure in
[funding readiness](funding-readiness.md#no-double-funding).

## Human video outline

The current [OpenSats application FAQ](https://opensats.org/faq/application)
requires an exactly two-minute video with a human voice; face visibility is
optional. It requires at least two written references with contact emails before
general-grant evaluation begins. It permits part-time grants, sets a 3–12 month
regular-grant range, and asks for public FOSS development and 90-day reports.
Recheck these requirements before submission.

This is a timing outline for TJ to adapt and record, not a generated voiceover
or a claimed finished video. Avoid unverified demos or a forced sign-in funnel.

| Time | TJ's talking point / screen |
| --- | --- |
| 0:00–0:20 | Introduce yourself and the artist's concrete problem: moving a useful catalog between sites and being found beyond one platform |
| 0:20–0:45 | Show only a currently working, rights-cleared importer/review output; name the build and say what remains a prototype |
| 0:45–1:10 | Explain artist-signed publishing, gates and account-free viewing; label design mockups as proposed |
| 1:10–1:35 | Explain the Bitcoin merchant benefit: direct payments and reconcilable records; show synthetic examples if actual integration is incomplete |
| 1:35–1:55 | State the six-month, half-time request, key acceptance tests and public outputs |
| 1:55–2:00 | Close with the verified repository link and the next milestone |

Check the final exported media duration is exactly 120 seconds, playback and
human audio are clear, links work without requester access, and no participant
or private application data appears. Sharing/uploading the video is a separate
owner action; the project has not been announced through this pack.

## Application assembly worksheet

```text
Owner-reviewed version/date:
Live form URL and field/length limits checked on:
Approved legal applicant (private record only):
Grant-start date and available hours:
Pinned baseline / selected SPEC revision:
Narrative: human-reviewed contribution claims and unsupported claims removed
Prior-work proof: verified URL + exact personal contribution
Demonstration: verified URL + commit + limitations + media permissions
Budget: approved amount + remaining-work scope + other-funding disclosure
References: HOLD until TJ clears it; letters/contact consent retained privately
Human video: owner-approved URL + exact duration + access check
Public-development and reporting commitments reviewed:
Funder terms/data handling/cutoff checked:
Other unresolved application holds cleared by TJ:
Submission authorized by / date: [blank]
Submission record / acknowledgement: [blank until actually submitted]
```
