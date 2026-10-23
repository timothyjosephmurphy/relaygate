# Funding readiness

Research checked 20 October 2026 UTC. This is a decision aid and preparation
pack, not a submitted application, award forecast or instruction to contact a
funder. Amounts below are program limits or proposed requests, never committed
income. Recheck the official pages and live form before submission.

Start with the [OpenSats draft](opensats-application-draft.md). The
[smaller-grant drafts](alternative-grant-drafts.md) provide a bounded alternative
and a separate artist project. These documents support the existing OpenSats
application workflow; they do not replace its owner decisions.

## Grant-fit decisions

The priorities are our assessment of fit and readiness, not funder endorsements.

| Priority / action | Route and funding type | Verified terms and timing | Fit judgment and next evidence |
| --- | --- | --- | --- |
| 1 — prepare, submission held | **OpenSats**, FOSS grant | Applications open in the first two months of each quarter; the general FAQ closes March, June, September and December. Use 30 November 2026 as a planning boundary, not a verified portal cutoff or timezone. USD budget, BTC payment. [O1–O3](#primary-sources) | Best match for reusable Nostr publishing, direct Bitcoin payments and reconciliation. Proposed six-month, half-time request: $27,000. Needs a credible engine demonstration, evidence ledger, human video and owner-cleared references. |
| 2 — bounded alternative draft | **FUTO microgrant**, grant | Applications page says open; one-time $1,000–$5,000 for small or early projects. It lists an email application route, with no fixed deadline on that page. Its large grants target established projects. [F1](#primary-sources) | Self-hosting and leaving a provider are clear benefits. Draft $3,000 for a future portability verification slice, explicitly carved out of the OpenSats plan if both proceed. Check recipient, license and reporting terms before contact. |
| 2 — separate artistic project draft | **Bitcoin for the Arts (BFTA)**, artist microgrant | Current round: $500–$2,000, paid in BTC; quarterly review. Worldwide individuals/collectives may apply without nonprofit status, but spending must deliver U.S. public benefit. Pure product development lacks the required artistic focus. [B1–B3](#primary-sources) | Draft $1,800 for a curated exhibition and workshop. Needs actual works, permissions, a defined U.S. audience and delivery arrangement. Do not relabel the software build as an exhibition. Exact quarterly cutoff remains unverified. |
| 3 — mission evidence first | **HRF Bitcoin Development Fund**, grant pathway in a program that also invests | Year-round applications; case-specific amounts. Its stated review follow-up is 4–6 weeks, not an award guarantee. It prioritizes financial freedom in repressive settings and includes Nostr among relevant technologies. [H1](#primary-sources) | Generic art commerce is a weak fit. Consider only with a real, consenting mission partner and a documented problem. Do not invent a human-rights use case or identify vulnerable artists in a public proposal. Confirm grant rather than investment terms. |
| Hold — eligibility not established | **NLnet**, technical-development grants | Proposal page lists Restack and CodeSupply, deadline **3 November 2026, 12:00 CET**, and €5,000–€50,000 for a first grant. EU-supported funds require a European dimension. [N1](#primary-sources) | The current AI policy allows disclosed assistance and requires provenance; purely AI-generated outcomes are ineligible paid work. Relay Gate needs an honest human-contribution and provenance assessment plus fund-specific eligibility before any proposal. [N2](#primary-sources) |
| Watch — current cycle closed | **Creative Capital**, individual artist project grant | The 2027 open call closed **2 April 2026**; the next call date is unconfirmed. The award supports new artistic works, with up to $50,000 and professional services. [C1–C2](#primary-sources) | Potentially relevant to a distinct artwork or installation. Do not treat it as software-company operating capital. Recheck residence, career-stage and other individual criteria when a new call opens. |
| Unverified — no pipeline value | **Spiral**; funding terms not verified here | Its public page did not yield readable current grant terms in this check. [S1](#primary-sources) | Keep as a research lead. Do not call it an open grant or assume amount, deadline or eligibility. |
| Unverified — distinguish routes | **Geyser**; grant programs and crowdfunding must be assessed separately | The grants page required JavaScript and did not expose current eligibility or a live round in this check. [G1](#primary-sources) | A crowdfunding campaign is not a grant award. A campaign, public story or donor appeal needs its own scope and authorization. No campaign is prepared or opened here. |

No investment capital is included in the proposed budget. Sponsorships, service
income, donations, equity and grants need separate records and terms; none is
interchangeable with an award already received.

## Corrections and unresolved terms

- **NLnet:** the current linked policy is version 1.1, dated 26 January 2026.
  Its disclosure rules do not amount to a blanket ban on every LLM user. The
  proposal page's warning about AI-generated projects must be read with that
  policy. Do not hide AI use, manufacture missing prompt logs, or assume a
  cosmetic rewrite establishes eligibility. This pack is AI-assisted draft
  material for human review, not evidence of exclusively human authorship.
- **BFTA:** use the current $500–$2,000 round, not its aspirational $25,000
  ceiling. Its guidelines and FAQ differ on reporting cadence and simultaneous
  applications. The guidelines describe interim updates and a final report
  within 90 days of completion; the FAQ says six months plus project end and
  one active application per quarter. Confirm the applicable terms with the
  owner before applying; do not resolve the discrepancy by silently picking
  the less demanding version. [B2–B3](#primary-sources)
- **OpenSats:** the recurring calendar supports October–November preparation;
  it does not establish the precise portal closure time. Public development
  can continue while Relay Gate remains unlaunched.

## Readiness evidence ledger

Freeze this ledger to exact commit IDs before a submission. A proposed feature,
an open PR, a passed unit test and an observed artist outcome are different
claims. Public evidence must stand on its own without access to the private
tracker. Current baseline: main commit
`3e99143559a9038cb035bca6bd3f218137cb7918`.

| Claim to support | Available artifact / status at this check | Missing evidence or safe wording |
| --- | --- | --- |
| FOSS public development | [Repository](https://github.com/timothyjosephmurphy/relaygate), [MIT license](../LICENSE), commit history | Name the actual reviewed commit and license of any external engine/media. Repository visibility is not proof of a public product launch. |
| Nostr architecture is specified | [PR #1](https://github.com/timothyjosephmurphy/relaygate/pull/1), proposed Nostr-first SPEC | Describe as a design under review. Custom kinds are proposals; signatures do not prove copyright, physical authenticity or relay permanence. |
| Importer handles representative sites | [PR #2](https://github.com/timothyjosephmurphy/relaygate/pull/2), expanded offline fixtures and real-site case work | Attach exact CI run/head and output with limitations. Say representative fixtures, not any website guaranteed. Reusing already-completed work is prior evidence, not future billable delivery. |
| Portable review/export foundation | [PR #3](https://github.com/timothyjosephmurphy/relaygate/pull/3), portable local kit under review | Show export and restore at a pinned build. This alone does not demonstrate maintained 3D-engine integration or nontechnical own-site installation. |
| Pilot is executable | [PR #4](https://github.com/timothyjosephmurphy/relaygate/pull/4), runbook, blank records and public prospects | Materials are prepared. Artists have not been recruited or consented through this work; no completion rate, sale or demand finding is established. |
| A real gallery works in the maintained engine | No completed evidence in this pack | Provide a rights-cleared catalog, engine/version/license, actual rendering, navigation, unavailable-media behavior and an account-free visitor demonstration. A JSON file is insufficient. |
| Nostr adds useful portability | Planned | Show external-signer approval/rejection, signature validation, reload from another relay set, a gate between two artists, and useful reading without signing in. Never collect secret keys. |
| Referral accounting failure cases are modeled | [PR #5](https://github.com/timothyjosephmurphy/relaygate/pull/5), offline simulation under review | Simulation evidence only: no live payment, invoice creation or merchant reconciliation. Actual receipt validation, durable storage, permissions and accounting import still need testing. |
| Printable certificate layouts exist | [PR #6](https://github.com/timothyjosephmurphy/relaygate/pull/6), unsigned DEMO sheet/strip proofs under review | QR decoding and PDF checks do not establish an issued certificate, a physical printer test or physical authenticity. External signing, stable resolution and real scans remain gates. |
| Bitcoin payments reconcile | Not demonstrated end to end | Supply sandbox invoice/receipt-to-journal reconciliation, including failure cases. Tips, sales and referrals must remain distinguishable. Do not present the offline referral simulation as merchant settlement evidence. |
| Applicant can execute | Public repository contributions are available | TJ selects and verifies relevant prior-work links and explains their own contribution. Check any older repository for safe public sharing before citing it; do not copy private incident details here. |

The following snapshot was checked through GitHub's PR and workflow APIs on
20 October 2026 UTC. Each listed CI run matches the corresponding head SHA.

| Artifact | Exact reviewed branch head | Automated check | Repository status |
| --- | --- | --- | --- |
| [PR #1](https://github.com/timothyjosephmurphy/relaygate/pull/1) | `1baab0d80507699a63240f4a7c0d4c8d31f2cd42` | [CI passed](https://github.com/timothyjosephmurphy/relaygate/actions/runs/39361240637) | Open, unmerged |
| [PR #2](https://github.com/timothyjosephmurphy/relaygate/pull/2) | `e83dff88ddd7454bb3f8f2417475311d4881b029` | [CI passed](https://github.com/timothyjosephmurphy/relaygate/actions/runs/39362374520) | Open, unmerged |
| [PR #3](https://github.com/timothyjosephmurphy/relaygate/pull/3) | `30b63135ab27beef303882894b0559863b36191d` | [CI passed](https://github.com/timothyjosephmurphy/relaygate/actions/runs/39365921297) | Open, unmerged |
| [PR #4](https://github.com/timothyjosephmurphy/relaygate/pull/4) | `50265e18c991784be8e690cef7288dd33e8428f6` | [CI passed](https://github.com/timothyjosephmurphy/relaygate/actions/runs/39366985069) | Open, unmerged |
| [PR #5](https://github.com/timothyjosephmurphy/relaygate/pull/5) | `a834abcb7f5f19787c72eac8cc23c0d5e9fc50a1` | [CI passed](https://github.com/timothyjosephmurphy/relaygate/actions/runs/39367176032) | Open, unmerged |
| [PR #6](https://github.com/timothyjosephmurphy/relaygate/pull/6) | `53344fa752b4f1b8e0155d00538441e226e7afb2` | [CI passed](https://github.com/timothyjosephmurphy/relaygate/actions/runs/39368175167) | Open, unmerged |

PR states can change. Before submission, replace every status with a fresh check
and a stable evidence link. These branches are separate proposals, not a tested
combined release. Neither a merged PR nor a green CI badge proves that artists
successfully used the feature.

## Missing materials and owners

Keep this checklist in the application working copy. Empty fields remain
unresolved; do not complete them by inference.

| Material / decision | Owner | Complete only when |
| --- | --- | --- |
| Legal applicant and receiving arrangement | TJ | Confirmed privately in the application workflow; no tax identifiers, addresses or payout information in GitHub |
| Scope and grant-start baseline | TJ + maintainer | Approved SPEC version, already-completed work and future acceptance tests are separated |
| Budget refresh and funding disclosure | TJ | $27,000 request, 50% capacity, other funding and any carve-outs checked as of submission |
| Runnable proof and evidence links | Maintainer | Pinned build, actual engine evidence, CI links and a short limitations list verified |
| Prior-work narrative | TJ | First-person contribution claims and public URLs checked |
| Human video | TJ | Final spoken recording meets the current form and is reviewed before sharing |
| References | TJ | **Hold remains in force: do not ask references until TJ explicitly lifts it in the existing application workflow** |
| Reference letters and private contact fields | TJ, after hold lifted | Referees consent and supply their own evidence; no invented endorsements or public contact-data copies |
| Artist pilot evidence | Facilitator + artists | Permissions recorded, actual sessions completed, all failures/withdrawals counted consistently |
| Reporting and public-license plan | TJ | Agreed obligations, owner, cost records and public/private boundaries recorded |
| Funder-specific terms | TJ | Current form, data handling, deadline/timezone and agreement reviewed; discrepancies resolved |
| Final submit decision | TJ | All submission holds cleared and final application approved; no automated submission by this pack |

## No double funding

Assign every hour, invoice and output to one source before accepting support.
Prospective applications may describe alternatives, but disclose the overlap.
Do not charge the same work twice, relabel completed work as future work, or
hide a second application when asked about funding.

| Work package | Baseline allocation | Alternative treatment |
| --- | --- | --- |
| OS-M0 through OS-M4 and OS-INT | $27,000 proposed OpenSats plan | No award assumed; rebaseline completed work at grant start |
| FU-P1 portability verification | $3,000 slice of OS-M4/OS-INT and relevant expenses | Alternative FUTO request. If funded separately, remove the corresponding $3,000 and 60 hours from the proposed OpenSats allocation, or negotiate a disclosed new scope before accepting either award |
| BA-A1 curated exhibition/workshop | $1,800 separate proposed arts project | Outside the core software request. Different time records and invoices; never charge OS onboarding/localization or software tests to this project |

If FU-P1 is carved out exactly as drafted, the remaining OpenSats request is
**$24,000 and 460 hours**. This changes the approved baseline and requires TJ's
approval and funder disclosure; it is not an instruction to change an application
already sent. BFTA spending would bring that two-software-route scenario plus the
separate arts project to $28,800 in requested costs, not revenue or an award.

Copy this private allocation record for each funded cost:

```text
Record ID:
Date / work period:
Work package and accepted artifact:
Status: proposed / approved / incurred / reimbursed / reported
Hours and rate, or invoice currency/amount:
Funding source and approved budget line:
Other proposals mentioning this output, and disclosed allocation:
Reviewer and evidence of approval:
Public report entry (redacted):
Private invoice / payment-record location:
Unspent balance or correction required:
```

## Reporting template

```text
Reporting period and approved scope version:
Opening budget / actual costs / committed costs / remaining balance:
Completed outputs: immutable links, version, acceptance result, named owner
Unfinished outputs: reason, user impact, revised estimate, decision needed
Tests and pilot observations: count, denominator, failures, limits
Reuse: prior work used; new work performed in this reporting period
Other support and overlap: source, amount, allocation, disclosure status
AI assistance and human review: provenance, reviewer, known gaps
Privacy: aggregated results only; no participant/referee/payment secrets
Next period: bounded outputs, dependencies, expected cost
Owner reviewed on:
```

Keep reference letters, consent records, identity/tax documents, payout details
and raw interviews in the owner-controlled private workspace. Public progress
can contain source commits, synthetic fixtures, aggregate outcomes and redacted
spending totals. Publishing a report or an artist quote is a separate action;
this blank template is not permission to disclose someone else's information.

## Primary sources

Retrieved 20 October 2026 UTC; source pages may have their own earlier crawl or
effective dates. Terms and availability must be checked again at action time.

- **O1:** [OpenSats general FAQ](https://opensats.org/faq).
- **O2:** [OpenSats application FAQ](https://opensats.org/faq/application).
- **O3:** [OpenSats application criteria](https://opensats.org/apply).
- **F1:** [FUTO grants](https://futo.tech/grants), redirected from futo.org/grants.
- **B1:** [BFTA grants](https://www.bitcoinforthearts.org/grants).
- **B2:** [BFTA guidelines v1.2](https://www.bitcoinforthearts.org/grants/guidelines).
- **B3:** [BFTA grants FAQ](https://www.bitcoinforthearts.org/grants/faq).
- **H1:** [HRF Bitcoin Development Fund](https://hrf.org/program/financial-freedom/bitcoin-development-fund/).
- **N1:** [NLnet proposal page](https://nlnet.nl/propose/).
- **N2:** [NLnet GenAI policy v1.1](https://nlnet.nl/foundation/policies/generativeAI/).
- **C1:** [Creative Capital award](https://creative-capital.org/creative-capital-award/).
- **C2:** [Creative Capital application status](https://creative-capital.org/creative-capital-award/award-application/).
- **S1:** [Spiral](https://spiral.xyz/) — current terms unverified in this check.
- **G1:** [Geyser grants](https://geyser.fund/grants) — current round unverified in this check.
