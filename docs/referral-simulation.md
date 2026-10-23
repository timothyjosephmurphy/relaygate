# Gate referral simulation

This is the offline design/validation implementation for studio-tracker #194.
It makes **no network requests, invoices, signatures or payments**. Every plan,
event, summary and review CSV is marked `simulation`. It cannot establish that
an artist accepted real terms or that a wallet actually settled a payment.

## Try the three failure/reconciliation cases

Run from a checkout with Node 20 or newer:

```sh
npm ci
npm test
node bin/referral-demo.js --model two-tips --scenario complete
node bin/referral-demo.js --model two-tips --scenario second-fails
node bin/referral-demo.js --model artist-commission --scenario artist-refund
node bin/referral-demo.js --model artist-commission --format csv
```

The demo uses fictional public recipients, 1,000 sats, and an explicitly
fictional USD/BTC rate. The commission payout fee is 2 sats, paid by the artist.
Sender fees on visitor tips do not reduce either recipient's agreed amount.
The CSV goes to standard output; keep any saved ledger output private.

## Separate arrangements, separate records

| Model | Visitor payment | Artist records | Referrer records |
|---|---|---|---|
| Direct support | 1,000 sats to artist | 1,000 income | None |
| Two voluntary tips | 900 sats to artist, 100 to referrer | 900 income | 100 independent support income |
| Artist-funded commission | 1,000 sats to artist; artist separately pays 100 | 1,000 gross income, 100 commission expense, separate artist-paid payout fee | 100 referral service income |

Selecting a model is explicit. Nothing defaults two recipient tips into gross
artist revenue. The existing 10% zap/0% sale policy is enforced; a sale cannot
become commission-bearing through a URL, changed terms or changed recipient.
The fixed organizer fee and service-credit alternatives in #194 remain
non-attribution experiments; this module does not invent payment routing for
them. Studio manager and the bookkeeper still need to choose the real model.

## Minimal attribution and consent

`createVisit(artistKey)` creates transient in-memory state with no visitor ID,
cookies, IP address, device fingerprint or cross-site history.
`acceptGate(visit, gate)` replaces the current attribution only after an
explicit simulated visitor acceptance. It keeps one source and destination,
not a chain of commissions. The default lifetime is 30 minutes; callers may
choose at most 24 hours. Self-referrals and a mismatched destination fail.
`clearReferral(visit)` removes it. Do not persist this visit state by default.

`planReferral()` requires matching artist/referrer keys, the terms version,
current validity, exact 10% rate, non-revoked terms, an explicit model and
visitor acceptance. A copied URL is not accepted as consent. Turning referrals
off or declining the additional support leaves a full direct artist payment.
This implements no reputation or anti-bot system: a public key and local click
are not proof of a real person or a genuine recommendation.

Terms and approvals here are simulations, not signed legal agreements. Before
live use a separate adapter must verify the artist's signed terms and current
revocation state, and bind the displayed recipients and amounts to a reviewed
payment request. No new referral event kind/tag is claimed as a Nostr standard.

## Amounts, fees and refunds

Amounts are canonical decimal **millisatoshi strings**, processed with BigInt.
Floating-point, exponent, negative and over-limit amounts are rejected. The
10% share rounds down to one millisatoshi and the remainder stays with the
artist. A rounded zero share produces no extra invoice. A satoshi-only wallet
adapter must offer an additional reviewed rounding rule; this simulator does
not silently round or claim universal wallet compatibility.

Commission simulations require an explicitly selected
`refundPolicy: 'proportional-net-support'`. This is a proposed policy to review,
not an inferred commercial agreement. It reduces the commission liability to
10% of retained artist support after a refund. If the referrer already received
more, the summary shows a recovery amount; it never pretends the payout was
automatically reversed. A separately recorded return reduces that amount.
Independent tips are refunded independently. Refund fees are borne by the
recipient returning funds and are separate expense rows.

## Payment state and replay

`createSimulationLedger(plan)` validates recipients and amounts again and
omits the visit trail. `applySimulationEvent(state, event)` returns new state;
it never edits the prior state. Supported simulated events are:

- `attempt`: one outstanding attempt per leg; no automatic retry of an unknown
  outcome. Commission attempts require a current artist payout approval for
  the exact positive outstanding liability.
- `failed`, `cancelled`, `expired`: leave the payment unpaid and make the
  incomplete state visible. A later observed simulated settlement can still
  be recorded rather than dropping money from the books.
- `settled`: binds recipient, exact attempt amount, a unique payment hash,
  timestamp, fee and exchange-rate provenance. There is no live-event mode.
- `refunded`: references a settled payment and its own unique refund hash;
  cumulative refunds cannot exceed the original amount.
- `approve-payout`: records a simulated artist decision for an exact liability
  and a bounded expiry. It does not send a payout or authenticate a person.

Matching duplicate event IDs and payment/refund references are idempotent;
conflicting duplicates fail. Two late distinct payments remain two ledger
observations and produce an excess-payment warning. Retries cannot replace
the recipient or silently claim a partial split complete. Existing obligations
are preserved if referrals are later disabled; disabling new referrals is not
proof that an already agreed debt disappeared.

`replaySimulation(plan, events)` reconstructs state from the event log. Treat
mutable in-memory state as trusted application data, not an authenticated API
payload. A real durable adapter needs transaction isolation, unique database
constraints and an authenticated append-only audit log before concurrency or
provider delivery can be trusted. This in-memory simulator is bounded to
10,000 events and is not a production payment backend.

## Private accounting review export

Each financial observation requires a decimal USD/BTC rate, source and time.
Amounts are valued at the supplied quote using integer microdollars and
half-up rounding. Each recipient's income, artist commission expense, fee and
refund/reversal remain separate rows. Rates for a real payment must come from
the configured provider or reviewed rate service, not the demo's fixed quote.

`exportReviewCsv(state, ownerKey)` exports only that participant's rows and
omits buyer names, payer keys, invoice contents and payment hashes. Text cells
are quoted and spreadsheet-formula prefixes are neutralized. The result is a
**generic review CSV, not a QuickBooks bank-feed import or tax-ready journal**.
It does not calculate sales tax, realized Bitcoin disposal gains/cost basis,
accounts payable accruals or fiat rounding adjustments. The bookkeeper must
approve account mappings, currency treatment and the actual transaction model
before a QuickBooks connector is configured.

No private ledger or customer data belongs in public Nostr events. Disabling
referrals does not disable data export or ordinary gallery access.

## Validation and remaining integration gates

Automated tests cover 1,000-sat examples, sub-satoshi rounding, replaced
recipients, stale/revoked terms, opt-out, zero-sale fees, separate tips, gross
commissions, failed second legs, cancellation/expiry/late settlement, duplicate
callbacks, blocked duplicate payout requests, refunds/recoveries and CSV
injection/privacy. No live payment, wallet interoperability or artist pilot
has been performed.

Before a live implementation:

1. Choose the actual model and accept the artist's signed terms/refund policy.
2. Authenticate provider callbacks, backfill canonical provider state and
   reconcile payment hashes. A Nostr receipt alone is not merchant settlement.
3. Validate NIP-57 request/invoice/issuer bindings in the payment adapter;
   handle two invoices as non-atomic and require each wallet approval.
4. Review current BTCPay payout authorization/processing and retry behavior.
5. Add durable concurrency tests and ledger account/currency mappings.
6. Run an explicitly authorized financial test and artist/visitor pilot;
   record understanding, settled support and support effort, not just clicks.

Primary references checked during implementation:
[NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) and
[BTCPay pull payments](https://docs.btcpayserver.org/Users/pull-payments/).
