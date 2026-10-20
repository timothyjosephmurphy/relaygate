# Curated auction rehearsal

This is a local simulation for studio-tracker #184. It provides a deterministic
lot/bid/payment-state core and a repeatable three-lot exercise. It does not run
a public auction, connect visitors, create invoices, contact a charity, sign
Nostr events or transfer money. All payment IDs must start with `sim-` and all
receipts, exports and summaries identify themselves as simulations.

## Run the exercise

From a checkout with Node 20 or newer:

```sh
npm ci
npm test
node bin/auction-rehearsal.js /path/to/new-rehearsal-folder
```

The destination must not exist. It receives:

- `private-simulation-log.json`: configuration, exact lot revisions, host
  ordering, actor IDs, command receipts and a replayable hash chain.
- `visitor-summary.json`: lot titles, revisions, status, amounts and confirmed
  host time, without bidder identities or payment identifiers.
- `rehearsal-report.json`: expected outcomes and simulated money totals.

The exercise uses three synthetic lots and ten **simulated identities**, not ten
real participants. It covers equal competing bids near the deadline, a late
disconnected bidder, host-state replay, a reserve not met, partial payments,
failed then completed charity payout and unpaid-winner review. No real artwork,
charity agreement, certificate revision or consent is fabricated.

## Integration boundary

`AuctionSimulation` accepts a configuration, then processes synchronous
`dispatch(command, { actorId, at, expectedSequence })` calls. An acknowledgement
contains the host sequence, timestamp and exact lot revision. A retry with the
same command ID, actor and payload returns the original acknowledgement even
after restart. Reusing an ID for another actor/payload fails. A stale sequence
fails before mutation. `auditSince(sequence)` supplies a bounded private replay
page; `visitorSummary()` supplies a separate visitor-safe view.

**These strings are not authentication.** A future host must authenticate the
caller, assign receipt time from its trusted clock, serialize requests, commit
the transition durably before acknowledging it and fence old host processes.
A visitor cannot be trusted to supply any of those values. This module does not
provide a network server, durable transaction store, multi-process locking,
cryptographic signatures, abuse controls or consensus.

The full archive can be reconstructed with `replayAuctionSimulation(archive)`.
It rejects altered, missing or reordered events. Its hashes detect accidental
changes relative to a trusted archive; an attacker can rewrite a whole archive
and recompute hashes. External signed checkpoints and durable storage are still
needed before a live event. A claimed replay test is not a power-loss test.

## Rules used in this rehearsal

All amounts are integer sats; fiat/FX conversion is not performed. Each lot
declares its starting bid, reserve, mandatory increment, time window, optional
anti-sniping response/cap, shipping and tax treatment, and artist/charity/curator
basis-point shares. The artist receives the buyer payment directly and owes
separate charity/curator payouts. Other merchant arrangements are rejected until
their responsibility and bookkeeping have been explicitly designed.

All three recipients approve the exact hashed lot revision. This model freezes
terms at opening, which is stricter than freezing only after the first accepted
bid. Changing terms or withdrawing consent requires cancellation and a new
auction/lot ID with fresh approvals. The artist's approval covers the stated
artwork reference; the host must obtain and retain actual image/artwork rights
before using this flow with real works. A supplied certificate revision is only
a reference here; the simulation does not verify it.

Only registered, terms-accepting bidder IDs may bid; recipients and host cannot
bid in this rehearsal. Watching a future event must remain possible without
registration, a wallet or Nostr. Guest bidder authentication, privacy, reputation
checks and accessibility remain product decisions, not a reason to create or
handle an artist's or collector's private key.

An accepted bid must meet the current increment and have host receipt time
strictly before the effective end. Equal amounts do not replace a leader, so
host acceptance order resolves a tie. A qualifying leading bid restores a
response window, capped relative to the original end; retries and rejected bids
do not extend it. The host cannot close early or supply an arbitrary winner.
Client clocks and relay arrival order cannot establish acceptance.

## Settlement and recovery

An internal `sim-invoice-*` record is a payment-window scenario, never a payable
Lightning invoice. Only simulated merchant-side updates affect the sale state.
A real adapter must verify merchant records and callback authenticity before
feeding a separately reviewed production ledger. Do not connect raw browser
claims, zap receipts or arbitrary webhooks to these state changes.

| Scenario | Rehearsal result |
| --- | --- |
| Partial buyer payment | `partial`; later `partial-expired-review` if expired |
| Settled update arrives late but merchant time was before expiry | Can reconcile to `paid` |
| Actual settlement time is at/after expiry | `late-payment-review` |
| Duplicate or out-of-order update for a settled payment | Ignored; one journal entry |
| Extra distinct buyer payment | `overpaid-review`; no automatic extra payout |
| Charity payout fails | Charity paid amount stays zero |
| Payout is pending | Reserves its recipient's authorization; another attempt cannot reuse it |
| Known payout attempt fails | Releases its reservation, including after dispute/cancellation |
| Failed attempt later settles after replacement | Explicit reconciliation records the outcome and freezes further payouts for review |
| Artist payment received | Does not imply charity/curator payment |
| Open dispute | Further payouts blocked |
| Cancellation with buyer money recorded | Refund review required; money is not silently reversed |
| Refund after a charity payout | Buyer refund recorded; separate payout recovery review remains |
| Unpaid winner past expiry | Host reviews; no automatic next-bidder award |

The artist separately authorizes simulated charity and curator payouts. A
recipient's agreement to auction terms is not a wallet authorization. Pending
attempts reserve capacity alongside settled payouts. Retrying an attempt ID or
moving it from pending to settled does not reserve twice. Authorization cannot
be lowered below the combined settled and pending amount. Reservations are
local ledger limits, not funds locked by a wallet or payment processor.

Only a confirmed provider failure should release a reservation; a timeout or
missing callback is still pending. Real adapters must reconcile provider state
and identify attempts before applying updates; unverified, stale failure
callbacks must not release capacity. A distinct transfer uses a distinct ID.

If an observed settlement cannot use the ordinary payout transition, the host
can record `reconcile-payout` with a previously recorded payout ID and a reason.
This records evidence only: it never initiates a transfer, changes the original
authorization, or claims the outcome was authorized. It works after a dispute,
cancellation or refund and can expose an overpayment when both a failed attempt
and its replacement settle. The private journal retains each settlement once,
and `payoutReview` blocks further ordinary payouts. Pending failures can still
release reservations and additional observed settlements can still be recorded.
This rehearsal intentionally has no automatic clearance of that review; recovery
and renewed authority need a separately reviewed production workflow.

Charity
and curator allocations round down to sats; the artist keeps the remainder.
The full gross sale and obligations remain distinct. Auction gate referrals stay
at zero. Curator compensation here is a separately disclosed hypothetical
agreement, not a new default fee policy.

The journal is a private rehearsal record, not a QuickBooks import or final
book of accounts. Actual processor/network fees, FX quotes/timestamps, custody,
tax, shipping costs and payout/refund reconciliation must be added in the
payment/accounting workstream. Do not infer the artist's final income from the
pre-fee split shown in this model. Voluntary audience zaps are separate tips,
never bids or proof that the sale invoice was settled.

## Protocol comparison, checked 2026-10-20

[NIP-15](https://github.com/nostr-protocol/nips/blob/master/15.md) is currently
marked unrecommended. It defines auction kind `30020`, bid `1021` and merchant
confirmation `1022`. Bids refer to the exact auction event revision and clients
must verify merchant confirmations. This rehearsal reuses the ideas of a fixed
lot revision and explicit host acceptance, but emits no Nostr events and claims
no wire compatibility. NIP-99 listings alone do not define auction ordering.

Plebeian has newer work than its August marketplace update. Its
[four-validator ADR](https://github.com/PlebeianApp/market/blob/d4757b409b58e0ecf7c43e53629dd464c32dfb4e/docs/adr/ADR-0017-four-validator-bft-consensus-for-plebeian-auctions.md)
records an October 5 ratification: four equal-power CometBFT validators,
three-of-four finality, and Nostr as transport/audit rather than consensus. It
documents a fake-collateral prototype and a separate real-money gate, with
multi-operator, timing and durability limitations. Its proposed anti-sniping
profile restores 300 seconds, capped at 1,800 seconds; the ADR distinguishes
that profile from older tested prototype values. Relay Gate's small rehearsal
timings and mandatory increment are its own explicit test policy.

The public main tree at that revision exposes this ADR and deployment scaffolding;
a search of that tree did not expose a `30020` auction adapter. The frozen
prototype hash named by the ADR was not retrievable as a tree in this repository.
Consequently, **current auction implementation interoperability remains
unverified**. Before adopting event formats, ask Plebeian maintainers for the
supported code/version and execute cross-client fixtures. No outreach has been
made. Do not propose a new NIP merely because this local module exists.

[BTCPay pull payments](https://docs.btcpayserver.org/Users/pull-payments/) distinguish
creating a claim allowance, approving a payout and actually paying it. Those
are separate states; a claim link or approval is not settlement. A real pilot
must test the chosen store, permissions and payout processor.

For a US pilot, the charity must determine receipt wording and tax treatment.
[IRS charity-auction guidance](https://www.irs.gov/charities-non-profits/charitable-organizations/charity-auctions)
does not treat every winning bid as a fully deductible donation. This software
does not issue tax receipts or calculate deductions.

## Human rehearsal and live-event gates

Before a ten-person, no-money rehearsal:

1. Name the host and backup operator; choose time window, increment and outage
   policy. State that a click without an acknowledgement is not an accepted bid.
2. Obtain artist-approved lot images/references and each recipient's agreement.
   Decide merchant identity, jurisdiction, fees, shipping, tax and default terms.
3. Provide a keyboard-accessible 2D lot list, explicit bid confirmation,
   connection state and host-confirmed countdown. The current module is not a UI.
4. Assign ten participants synthetic bidder IDs. Include a keyboard-only visitor,
   mobile visitor, two competing bidders, a disconnected bidder and backup host.
5. Rehearse three lots. Record acknowledgements, restart from the trusted log,
   reconnect clients and compare the winner against replay. Then inject partial,
   duplicate, delayed and failed payment events using simulated records only.
6. Record actual completion time, unacknowledged submissions, support requests,
   recovery time, disagreement count and any inaccessible controls. Mark each
   result observed, failed or not run; the automated fixture is not user testing.

Before any real-money pilot, complete authenticated durable hosting, signing
and relay interoperability, actual merchant reconciliation, participant consent,
two-operator recovery and a separate review of custody/charity responsibilities.
The maintained 3D engine and multiplayer transport are additional dependencies.
Do not activate production payments as part of this PR.
