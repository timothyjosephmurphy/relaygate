import { createHash } from 'node:crypto';

// A local rehearsal model. It has no relay, signer, invoice or wallet client.
const MAX_SATS = 2_100_000_000_000_000;
const MAX_TIME = 4_102_444_800;
const MAX_EVENTS = 10_000;
const clone = value => structuredClone(value);
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const fail = message => { throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : fail('Expected an object');
const text = (value, name, max = 500) => typeof value === 'string' && value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : fail(`Invalid ${name}`);
const id = (value, name = 'ID') => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value) ? value : fail(`Invalid ${name}`);
const int = (value, name, min = 0, max = MAX_SATS) => Number.isSafeInteger(value) && value >= min && value <= max ? value : fail(`Invalid ${name}`);
const time = value => int(value, 'host timestamp', 0, MAX_TIME);
const add = (a, b) => int(a + b, 'amount total');
const simId = value => id(value).startsWith('sim-') ? value : fail('Payment and payout IDs must begin sim-');

function lotTerms(input) {
  object(input);
  if (input.currency !== 'SAT' || input.settlement !== 'artist-direct') fail('Rehearsal supports SAT and artist-direct settlement only');
  if (input.defaultPolicy != null && input.defaultPolicy !== 'host-review-then-new-auction') fail('Unsupported default policy');
  if (input.gateReferralBps != null && input.gateReferralBps !== 0) fail('Auction sale gate referrals must remain zero');
  const split = object(input.splitBps);
  const splitBps = Object.fromEntries(['artist', 'charity', 'curator'].map(role => [role, int(split[role], `${role} basis points`, 0, 10000)]));
  if (Object.values(splitBps).reduce((a, b) => a + b, 0) !== 10000) fail('Recipient shares must total 10000 basis points');
  const startAt = time(input.startAt), endAt = time(input.endAt);
  if (endAt <= startAt || endAt - startAt > 31_536_000) fail('Invalid auction window');
  const anti = object(input.antiSniping);
  const antiSniping = { windowSeconds: int(anti.windowSeconds, 'sniping window', 0, 3600), responseSeconds: int(anti.responseSeconds, 'response window', 0, 3600), maxExtensionSeconds: int(anti.maxExtensionSeconds, 'extension cap', 0, 86400) };
  if (endAt + antiSniping.maxExtensionSeconds > MAX_TIME) fail('Auction extension exceeds time limit');
  const result = {
    id: id(input.id, 'lot ID'), artworkRef: text(input.artworkRef, 'artwork reference', 600),
    certificateRevision: input.certificateRevision == null ? null : text(input.certificateRevision, 'certificate revision', 100),
    title: text(input.title, 'lot title', 300), artistId: id(input.artistId, 'artist ID'),
    charityId: id(input.charityId, 'charity ID'), curatorId: id(input.curatorId, 'curator ID'),
    currency: 'SAT', settlement: 'artist-direct', splitBps,
    startingBidSats: int(input.startingBidSats, 'starting bid', 1), reserveSats: int(input.reserveSats, 'reserve', 1),
    incrementSats: int(input.incrementSats, 'increment', 1), startAt, endAt, antiSniping,
    paymentWindowSeconds: int(input.paymentWindowSeconds, 'payment window', 60, 604800),
    shippingTerms: text(input.shippingTerms, 'shipping terms'), taxTerms: text(input.taxTerms, 'tax terms'),
    defaultPolicy: 'host-review-then-new-auction', gateReferralBps: 0,
  };
  if (new Set([result.artistId, result.charityId, result.curatorId]).size !== 3) fail('Rehearsal requires separately identified artist, charity and curator roles');
  if (result.reserveSats < result.startingBidSats) fail('Reserve cannot be below the starting bid');
  return result;
}

export function splitAuctionProceeds(amountSats, splitBps) {
  int(amountSats, 'sale amount');
  for (const role of ['artist', 'charity', 'curator']) int(splitBps[role], 'basis points', 0, 10000);
  if (splitBps.artist + splitBps.charity + splitBps.curator !== 10000) fail('Recipient shares must total 10000 basis points');
  // Integer arithmetic avoids multiplication overflow and floating point drift.
  const charitySats = Number(BigInt(amountSats) * BigInt(splitBps.charity) / 10000n);
  const curatorSats = Number(BigInt(amountSats) * BigInt(splitBps.curator) / 10000n);
  return { grossSaleSats: amountSats, artistNetBeforeFeesSats: amountSats - charitySats - curatorSats, charitySats, curatorSats, rounding: 'charity and curator round down; artist retains remainder', gateReferralSats: 0 };
}

const fields = {
  consent: ['role', 'revision', 'approved'], register: ['bidderId', 'termsAccepted'],
  open: ['revision'], bid: ['revision', 'amountSats'], close: [], cancel: ['reason'],
  'open-invoice': [], 'expire-invoice': [], 'review-default': ['reason'],
  'payment-update': ['paymentId', 'invoiceId', 'amountSats', 'status', 'settledAt'],
  'authorize-payout': ['role', 'amountSats'], 'payout-update': ['payoutId', 'role', 'amountSats', 'status'],
  'reconcile-payout': ['payoutId', 'reason'],
  refund: ['refundId', 'amountSats', 'reason'], dispute: ['reason'], 'resolve-dispute': ['reason'],
};

function commandInput(input) {
  object(input);
  if (!Object.hasOwn(fields, input.type)) fail('Unsupported simulation command');
  const allowed = ['id', 'type', 'lotId', ...fields[input.type]];
  if (Object.keys(input).some(key => !allowed.includes(key))) fail('Unexpected command field; keep personal and payment credentials out of this log');
  const command = { id: id(input.id, 'command ID'), type: input.type, lotId: id(input.lotId, 'lot ID') };
  for (const field of fields[input.type]) if (input[field] !== undefined) command[field] = clone(input[field]);
  if (canonical(command).length > 4000) fail('Command is too large');
  return command;
}

export class AuctionSimulation {
  #config; #lots; #log = []; #seen = new Map(); #paymentOwners = new Map(); #lastAt = 0;

  constructor(input) {
    object(input);
    if (input.simulation !== true) fail('This model requires simulation: true');
    if (!Array.isArray(input.lots) || !input.lots.length || input.lots.length > 100) fail('Provide 1 to 100 lots');
    const lots = input.lots.map(lotTerms);
    if (new Set(lots.map(lot => lot.id)).size !== lots.length) fail('Duplicate lot ID');
    this.#config = { schema: 'relaygate/auction-simulation/1', simulation: true, auctionId: id(input.auctionId), hostId: id(input.hostId), lots };
    this.#lots = new Map(lots.map(terms => [terms.id, { terms, revision: hash(terms), status: 'draft', consent: {}, bidders: [], effectiveEnd: terms.endAt, bids: [], winner: null, invoice: null, payments: {}, payouts: {}, payoutAuthorization: { charity: 0, curator: 0 }, payoutReview: null, refundedSats: 0, dispute: null, defaultReviewed: false, journal: [] }]));
  }

  get sequence() { return this.#log.length; }

  #host(actorId) { if (actorId !== this.#config.hostId) fail('Host authority required'); }

  dispatch(input, context) {
    const command = commandInput(input), actorId = id(context?.actorId, 'actor ID'), fingerprint = hash({ command, actorId });
    const seen = this.#seen.get(command.id);
    if (seen) {
      if (seen.fingerprint !== fingerprint) fail('Command ID reused with a different actor or payload');
      return clone(seen.receipt);
    }
    if (this.#log.length >= MAX_EVENTS) fail('Simulation log is full');
    if (context.expectedSequence !== this.sequence) fail('Sequence conflict: reload the host snapshot before retrying');
    const at = time(context.at);
    if (at < this.#lastAt) fail('Host time cannot move backwards');
    const original = this.#lots.get(command.lotId);
    if (!original) fail('Unknown lot');
    // Validation and transitions happen on a copy. A rejected operation cannot
    // leave a partial mutation or a partial journal entry behind.
    const lot = clone(original), paymentOwners = new Map(this.#paymentOwners);
    const outcome = this.#transition(lot, command, actorId, at, paymentOwners);
    const sequence = this.sequence + 1;
    const receipt = { simulation: true, commandId: command.id, lotId: command.lotId, lotRevision: lot.revision, sequence, hostTime: at, ...outcome };
    const event = { sequence, at, actorId, command, receipt, previousHash: this.#log.at(-1)?.hash || null };
    event.hash = hash(event);
    this.#lots.set(command.lotId, lot); this.#paymentOwners = paymentOwners; this.#lastAt = at;
    this.#log.push(event); this.#seen.set(command.id, { fingerprint, receipt });
    return clone(receipt);
  }

  #transition(lot, command, actorId, at, owners) {
    const terms = lot.terms;
    const accepted = extra => ({ status: 'accepted', ...extra });
    const rejected = reason => ({ status: 'rejected', reason });
    const journal = entry => lot.journal.push({ commandId: command.id, at, simulation: true, ...entry });
    const totals = () => this.#totals(lot);
    const requireInvoice = () => { if (!lot.invoice) fail('No simulated invoice exists'); };
    const checkRevision = () => { if (command.revision !== lot.revision) fail('Lot revision mismatch'); };
    switch (command.type) {
      case 'consent': {
        if (!['artist', 'charity', 'curator'].includes(command.role) || actorId !== terms[`${command.role}Id`]) fail('Recipient can approve only their own role');
        checkRevision();
        if (lot.status !== 'draft') fail('Terms are frozen once the rehearsal opens; cancel and create a new lot to change consent');
        if (typeof command.approved !== 'boolean') fail('Consent must be explicit');
        lot.consent[command.role] = command.approved;
        return accepted({ role: command.role, approved: command.approved });
      }
      case 'register':
        this.#host(actorId); id(command.bidderId, 'bidder ID');
        if (command.termsAccepted !== true) fail('Bidder must explicitly accept the lot terms');
        if (!['draft', 'open'].includes(lot.status)) fail('Registration is closed');
        if ([terms.artistId, terms.curatorId, terms.charityId, this.#config.hostId].includes(command.bidderId)) fail('Recipient or host cannot bid in this rehearsal');
        if (!lot.bidders.includes(command.bidderId)) { if (lot.bidders.length >= 1000) fail('Bidder limit reached'); lot.bidders.push(command.bidderId); }
        return accepted();
      case 'open':
        this.#host(actorId); checkRevision();
        if (lot.status !== 'draft' || at < terms.startAt || at >= terms.endAt) fail('Lot cannot open outside its scheduled window');
        if (!['artist', 'charity', 'curator'].every(role => lot.consent[role] === true)) fail('All recipients must approve the exact terms');
        lot.status = 'open'; return accepted({ effectiveEnd: lot.effectiveEnd });
      case 'bid': {
        checkRevision(); int(command.amountSats, 'bid amount', 1);
        if (!lot.bidders.includes(actorId)) return rejected('not-registered');
        if (lot.status !== 'open') return rejected('lot-not-open');
        if (at >= lot.effectiveEnd) return rejected('received-at-or-after-deadline');
        const leader = lot.bids.at(-1);
        const minimum = leader ? leader.amountSats + terms.incrementSats : terms.startingBidSats;
        if (!Number.isSafeInteger(minimum) || command.amountSats < minimum) return rejected('below-required-increment');
        const bid = { id: command.id, bidderId: actorId, amountSats: command.amountSats, acceptedAt: at, sequence: this.sequence + 1 };
        lot.bids.push(bid);
        const anti = terms.antiSniping;
        if (anti.windowSeconds && at >= lot.effectiveEnd - anti.windowSeconds) lot.effectiveEnd = Math.min(Math.max(lot.effectiveEnd, at + anti.responseSeconds), terms.endAt + anti.maxExtensionSeconds);
        return accepted({ amountSats: bid.amountSats, effectiveEnd: lot.effectiveEnd });
      }
      case 'close':
        this.#host(actorId);
        if (lot.status !== 'open' || at < lot.effectiveEnd) fail('Host cannot close before the effective deadline');
        lot.status = 'closed';
        lot.winner = lot.bids.at(-1)?.amountSats >= terms.reserveSats ? clone(lot.bids.at(-1)) : null;
        return accepted({ winningBidId: lot.winner?.id ?? null, result: lot.winner ? 'awaiting-payment' : 'reserve-not-met' });
      case 'cancel':
        this.#host(actorId); text(command.reason, 'cancellation reason');
        if (lot.status === 'cancelled') fail('Lot already cancelled');
        lot.status = 'cancelled';
        return accepted({ reason: command.reason, refundReviewRequired: totals().buyerReceivedSats > lot.refundedSats });
      case 'open-invoice':
        this.#host(actorId);
        if (lot.status !== 'closed' || !lot.winner || lot.invoice) fail('A closed winning lot without an invoice is required');
        if (at + terms.paymentWindowSeconds > MAX_TIME) fail('Payment window exceeds time limit');
        lot.invoice = { id: `sim-invoice-${lot.terms.id}`, amountSats: lot.winner.amountSats, createdAt: at, expiresAt: at + terms.paymentWindowSeconds, expired: false };
        return accepted({ invoice: clone(lot.invoice), warning: 'Simulation record only; not a payable Lightning invoice' });
      case 'expire-invoice':
        this.#host(actorId); requireInvoice();
        if (at < lot.invoice.expiresAt) fail('Invoice has not reached expiry');
        lot.invoice.expired = true; return accepted({ paymentState: this.#paymentState(lot) });
      case 'payment-update': {
        this.#host(actorId); requireInvoice(); simId(command.paymentId); int(command.amountSats, 'payment amount', 1);
        if (command.invoiceId !== lot.invoice.id || !['pending', 'failed', 'settled'].includes(command.status)) fail('Invalid payment update binding');
        if (command.status === 'settled') { time(command.settledAt); if (command.settledAt > at || command.settledAt < lot.invoice.createdAt) fail('Invalid settlement timestamp'); }
        else if (command.settledAt != null) fail('Only settled updates can contain a settlement timestamp');
        const binding = { lotId: terms.id, invoiceId: command.invoiceId, amountSats: command.amountSats };
        const ownerKey = `payment:${command.paymentId}`;
        if (owners.has(ownerKey) && canonical(owners.get(ownerKey)) !== canonical(binding)) fail('Payment ID already bound to another amount, lot or invoice');
        owners.set(ownerKey, binding);
        const previous = lot.payments[command.paymentId];
        if (previous?.status === 'settled') return accepted({ ignored: 'already-settled', paymentState: this.#paymentState(lot) });
        lot.payments[command.paymentId] = { ...binding, status: command.status, settledAt: command.settledAt ?? null };
        if (command.status === 'settled') {
          add(totals().buyerReceivedSats, 0);
          journal({ type: 'simulated-buyer-payment', reference: command.paymentId, amountSats: command.amountSats, late: command.settledAt >= lot.invoice.expiresAt });
        }
        return accepted({ paymentState: this.#paymentState(lot) });
      }
      case 'authorize-payout':
        if (actorId !== terms.artistId) fail('Artist must separately authorize each simulated payout amount');
        if (!['charity', 'curator'].includes(command.role)) fail('Invalid payout role');
        int(command.amountSats, 'authorized payout amount');
        if (!lot.winner || command.amountSats > splitAuctionProceeds(lot.winner.amountSats, terms.splitBps)[`${command.role}Sats`]) fail('Authorization exceeds the agreed obligation');
        if (command.amountSats < totals()[`${command.role}PaidSats`] + totals()[`${command.role}ReservedSats`]) fail('Authorization cannot drop below settled and pending payouts');
        lot.payoutAuthorization[command.role] = command.amountSats; return accepted();
      case 'payout-update': {
        this.#host(actorId); simId(command.payoutId); int(command.amountSats, 'payout amount', 1);
        if (!['charity', 'curator'].includes(command.role) || !['pending', 'failed', 'settled'].includes(command.status)) fail('Invalid payout update');
        const ownerKey = `payout:${command.payoutId}`, binding = { lotId: terms.id, role: command.role, amountSats: command.amountSats };
        if (owners.has(ownerKey) && canonical(owners.get(ownerKey)) !== canonical(binding)) fail('Payout ID already bound to another lot, role or amount');
        const previous = lot.payouts[command.payoutId];
        if (previous && (previous.role !== command.role || previous.amountSats !== command.amountSats)) fail('Payout ID changed role or amount');
        if (previous?.status === 'settled') return accepted({ ignored: 'already-settled' });
        // A failure for an already recorded attempt must release its reservation
        // even after cancellation, a refund or a dispute blocks new payouts.
        if (previous && command.status === 'failed') {
          previous.status = 'failed'; return accepted({ reservationReleased: true });
        }
        if (lot.payoutReview) fail('Payout reconciliation review blocks further payouts');
        if (lot.status !== 'closed' || lot.dispute || this.#paymentState(lot) !== 'paid') fail('Payout needs an undisputed, exactly paid sale');
        const due = splitAuctionProceeds(lot.winner.amountSats, terms.splitBps)[`${command.role}Sats`];
        const recorded = totals();
        const committed = recorded[`${command.role}PaidSats`] + recorded[`${command.role}ReservedSats`] - (previous?.status === 'pending' ? previous.amountSats : 0);
        if (command.amountSats + committed > due || command.amountSats + committed > lot.payoutAuthorization[command.role]) fail('Payout exceeds obligation or explicit artist authorization, including pending reservations; reconcile a late settled outcome separately');
        lot.payouts[command.payoutId] = { role: command.role, amountSats: command.amountSats, status: command.status };
        owners.set(ownerKey, binding);
        if (command.status === 'settled') journal({ type: `simulated-${command.role}-payout`, reference: command.payoutId, amountSats: command.amountSats });
        return accepted();
      }
      case 'reconcile-payout': {
        this.#host(actorId); simId(command.payoutId); text(command.reason, 'payout reconciliation reason');
        const previous = lot.payouts[command.payoutId];
        if (!previous) fail('Reconciliation requires a previously recorded payout attempt');
        if (previous.status === 'settled') return accepted({ ignored: 'already-settled' });
        // Record a simulated observed settlement even when a replacement attempt,
        // dispute or refund makes it unsafe. Evidence is not permission to pay.
        previous.status = 'settled';
        this.#totals(lot);
        lot.payoutReview = { at, payoutId: command.payoutId, reason: command.reason };
        journal({ type: `simulated-${previous.role}-payout`, reference: command.payoutId, amountSats: previous.amountSats, reconciliation: true, reason: command.reason });
        return accepted({ payoutReviewRequired: true });
      }
      case 'refund':
        this.#host(actorId); simId(command.refundId); int(command.amountSats, 'refund amount', 1); text(command.reason, 'refund reason');
        if (owners.has(`refund:${command.refundId}`)) fail('Refund reference already recorded');
        if (lot.journal.some(entry => entry.reference === command.refundId)) fail('Refund reference already recorded');
        if (command.amountSats > totals().buyerReceivedSats - lot.refundedSats) fail('Refund exceeds recorded buyer payments');
        lot.refundedSats = add(lot.refundedSats, command.amountSats);
        owners.set(`refund:${command.refundId}`, { lotId: terms.id, amountSats: command.amountSats });
        journal({ type: 'simulated-buyer-refund', reference: command.refundId, amountSats: command.amountSats, reason: command.reason });
        return accepted({ payoutRecoveryReviewRequired: totals().charityPaidSats + totals().curatorPaidSats + totals().charityReservedSats + totals().curatorReservedSats > 0 });
      case 'review-default':
        this.#host(actorId); requireInvoice(); text(command.reason, 'default review reason');
        if (lot.status !== 'closed' || at < lot.invoice.expiresAt || totals().buyerReceivedSats !== 0) fail('Only an unpaid expired invoice can receive default review');
        lot.defaultReviewed = true; return accepted({ nextAction: 'cancel-and-create-new-auction', automaticNextBidderAward: false });
      case 'dispute':
        if (![this.#config.hostId, terms.artistId, lot.winner?.bidderId].includes(actorId)) fail('Only host, artist or winner can flag a dispute');
        text(command.reason, 'dispute reason'); if (lot.dispute) fail('Dispute already open');
        lot.dispute = { at, openedBy: actorId, reason: command.reason }; return accepted();
      case 'resolve-dispute':
        this.#host(actorId); text(command.reason, 'resolution note'); if (!lot.dispute) fail('No open dispute');
        lot.dispute = null; return accepted({ note: command.reason });
      default: fail('Unsupported simulation command');
    }
  }

  #totals(lot) {
    const payments = Object.values(lot.payments).filter(p => p.status === 'settled');
    const sum = values => values.reduce((total, value) => add(total, value), 0);
    return {
      buyerReceivedSats: sum(payments.map(p => p.amountSats)),
      onTimeReceivedSats: sum(payments.filter(p => p.settledAt < lot.invoice.expiresAt).map(p => p.amountSats)),
      charityPaidSats: sum(Object.values(lot.payouts).filter(p => p.status === 'settled' && p.role === 'charity').map(p => p.amountSats)),
      curatorPaidSats: sum(Object.values(lot.payouts).filter(p => p.status === 'settled' && p.role === 'curator').map(p => p.amountSats)),
      charityReservedSats: sum(Object.values(lot.payouts).filter(p => p.status === 'pending' && p.role === 'charity').map(p => p.amountSats)),
      curatorReservedSats: sum(Object.values(lot.payouts).filter(p => p.status === 'pending' && p.role === 'curator').map(p => p.amountSats)),
      refundedSats: lot.refundedSats,
    };
  }

  #paymentState(lot) {
    if (!lot.invoice) return 'not-invoiced';
    const totals = this.#totals(lot), net = totals.buyerReceivedSats - totals.refundedSats;
    if (lot.refundedSats) return net === 0 ? 'refunded' : 'partially-refunded-review';
    if (totals.buyerReceivedSats > lot.invoice.amountSats) return 'overpaid-review';
    if (totals.buyerReceivedSats > totals.onTimeReceivedSats) return 'late-payment-review';
    if (net === lot.invoice.amountSats) return 'paid';
    if (net > 0) return lot.invoice.expired ? 'partial-expired-review' : 'partial';
    return lot.invoice.expired ? 'expired' : 'awaiting-payment';
  }

  snapshot() {
    return { ...clone(this.#config), sequence: this.sequence, lastHostTime: this.#lastAt, lots: [...this.#lots.values()].map(lot => ({ ...clone(lot), totals: this.#totals(lot), paymentState: this.#paymentState(lot), proceeds: lot.winner ? splitAuctionProceeds(lot.winner.amountSats, lot.terms.splitBps) : null })) };
  }

  visitorSummary() {
    return { simulation: true, auctionId: this.#config.auctionId, sequence: this.sequence, lastHostTime: this.#lastAt, lots: [...this.#lots.values()].map(lot => ({ id: lot.terms.id, title: lot.terms.title, revision: lot.revision, status: lot.status, effectiveEnd: lot.effectiveEnd, bidCount: lot.bids.length, leadingAmountSats: lot.bids.at(-1)?.amountSats ?? null, winnerConfirmed: !!lot.winner, paymentState: this.#paymentState(lot), payoutReviewRequired: !!lot.payoutReview })) };
  }

  exportLog() { return { schema: 'relaygate/auction-simulation-log/1', simulation: true, private: true, config: clone(this.#config), events: clone(this.#log) }; }

  auditSince(sequence, limit = 1000) {
    int(sequence, 'audit cursor', 0, this.sequence); int(limit, 'audit page size', 1, 1000);
    return { simulation: true, private: true, events: clone(this.#log.slice(sequence, sequence + limit)), nextSequence: Math.min(this.sequence, sequence + limit), latestSequence: this.sequence };
  }
}

export function replayAuctionSimulation(archive) {
  if (archive?.schema !== 'relaygate/auction-simulation-log/1' || archive.simulation !== true || !Array.isArray(archive.events) || archive.events.length > MAX_EVENTS) fail('Invalid simulation archive');
  const simulation = new AuctionSimulation(archive.config);
  for (const event of archive.events) {
    if (event.sequence !== simulation.sequence + 1) fail('Missing or reordered audit sequence');
    simulation.dispatch(event.command, { actorId: event.actorId, at: event.at, expectedSequence: simulation.sequence });
    if (canonical(simulation.auditSince(simulation.sequence - 1, 1).events[0]) !== canonical(event)) fail('Audit replay differs from the recorded transition');
  }
  return simulation;
}
