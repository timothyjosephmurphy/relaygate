import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuctionSimulation, replayAuctionSimulation, splitAuctionProceeds } from '../src/auction-simulation.js';

const terms = (id = 'lot-one') => ({ id, title: 'Synthetic rehearsal artwork', artworkRef: `demo:${id}`, certificateRevision: null, artistId: 'artist', charityId: 'charity', curatorId: 'curator', currency: 'SAT', settlement: 'artist-direct', splitBps: { artist: 7000, charity: 2500, curator: 500 }, startingBidSats: 100, reserveSats: 100, incrementSats: 10, startAt: 100, endAt: 200, antiSniping: { windowSeconds: 10, responseSeconds: 10, maxExtensionSeconds: 20 }, paymentWindowSeconds: 60, shippingTerms: 'Rehearsal only; no artwork ships.', taxTerms: 'Rehearsal only; no tax receipt.' });
const config = lots => ({ simulation: true, auctionId: 'demo-event', hostId: 'host', lots: lots || [terms()] });
let nextId = 0;
const send = (sim, type, data = {}, { actorId = 'host', at = 100, lotId = 'lot-one', id = `command-${++nextId}`, expectedSequence = sim.sequence } = {}) => sim.dispatch({ id, type, lotId, ...data }, { actorId, at, expectedSequence });
const lot = (sim, lotId = 'lot-one') => sim.snapshot().lots.find(value => value.terms.id === lotId);
function ready(sim, lotId = 'lot-one', bidders = ['bidder-one', 'bidder-two']) {
  const revision = lot(sim, lotId).revision;
  for (const role of ['artist', 'charity', 'curator']) send(sim, 'consent', { role, revision, approved: true }, { actorId: role, at: 90, lotId });
  for (const bidderId of bidders) send(sim, 'register', { bidderId, termsAccepted: true }, { at: 90, lotId });
  return revision;
}
function paidLot() {
  const sim = new AuctionSimulation(config()), revision = ready(sim);
  send(sim, 'open', { revision });
  send(sim, 'bid', { revision, amountSats: 100 }, { actorId: 'bidder-one', at: 110 });
  send(sim, 'close', {}, { at: 200 });
  const invoice = send(sim, 'open-invoice', {}, { at: 201 }).invoice;
  send(sim, 'payment-update', { paymentId: 'sim-payment-one', invoiceId: invoice.id, amountSats: 100, status: 'settled', settledAt: 210 }, { at: 211 });
  return { sim, invoice };
}

test('requires simulation mode, exact recipient consent, and frozen terms', () => {
  assert.throws(() => new AuctionSimulation({ ...config(), simulation: false }), /simulation/);
  const sim = new AuctionSimulation(config()), revision = lot(sim).revision;
  assert.throws(() => send(sim, 'open', { revision }), /All recipients/);
  assert.equal(sim.sequence, 0);
  assert.throws(() => send(sim, 'consent', { role: 'artist', revision, approved: true }), /own role/);
  ready(sim); send(sim, 'open', { revision });
  assert.throws(() => send(sim, 'consent', { role: 'artist', revision, approved: false }, { actorId: 'artist' }), /frozen/);
  assert.throws(() => send(sim, 'revise', { title: 'Changed terms' }), /Unsupported/);
});

test('three-lot ten-visitor rehearsal reproduces winners after restart and reconnect', () => {
  const sim = new AuctionSimulation(config([terms('lot-one'), terms('lot-two'), { ...terms('lot-three'), reserveSats: 1000 }]));
  const bidders = Array.from({ length: 10 }, (_, i) => `visitor-${i + 1}`);
  const revisions = Object.fromEntries(['lot-one', 'lot-two', 'lot-three'].map(lotId => [lotId, ready(sim, lotId, bidders)]));
  for (const lotId of Object.keys(revisions)) send(sim, 'open', { revision: revisions[lotId] }, { lotId });
  for (const lotId of Object.keys(revisions)) send(sim, 'bid', { revision: revisions[lotId], amountSats: 100 }, { actorId: 'visitor-1', at: 110, lotId });
  const disconnectedCursor = sim.sequence;
  send(sim, 'bid', { revision: revisions['lot-one'], amountSats: 150 }, { actorId: 'visitor-2', at: 190 });
  const first = send(sim, 'bid', { revision: revisions['lot-two'], amountSats: 200 }, { actorId: 'visitor-3', at: 199, lotId: 'lot-two' });
  const equal = send(sim, 'bid', { revision: revisions['lot-two'], amountSats: 200 }, { actorId: 'visitor-4', at: 199, lotId: 'lot-two' });
  assert.equal(first.status, 'accepted'); assert.equal(equal.status, 'rejected');
  const restarted = replayAuctionSimulation(sim.exportLog());
  assert.deepEqual(restarted.snapshot(), sim.snapshot());
  assert.equal(restarted.auditSince(disconnectedCursor).events.length, 3);
  // A disconnected bidder's late delivery never becomes an accepted bid.
  const late = send(restarted, 'bid', { revision: revisions['lot-two'], amountSats: 500 }, { actorId: 'visitor-10', at: 209, lotId: 'lot-two' });
  assert.equal(late.reason, 'received-at-or-after-deadline');
  for (const lotId of Object.keys(revisions)) send(restarted, 'close', {}, { at: 220, lotId });
  assert.equal(lot(restarted, 'lot-one').winner.bidderId, 'visitor-2');
  assert.equal(lot(restarted, 'lot-two').winner.bidderId, 'visitor-3');
  assert.equal(lot(restarted, 'lot-three').winner, null);
  assert.deepEqual(replayAuctionSimulation(restarted.exportLog()).snapshot(), restarted.snapshot());
});

test('deadline is strict; anti-sniping resets the response window and honors the cap', () => {
  const sim = new AuctionSimulation(config()), revision = ready(sim);
  send(sim, 'open', { revision });
  send(sim, 'bid', { revision, amountSats: 100 }, { actorId: 'bidder-one', at: 199 });
  assert.equal(lot(sim).effectiveEnd, 209);
  send(sim, 'bid', { revision, amountSats: 110 }, { actorId: 'bidder-one', at: 208 });
  assert.equal(lot(sim).effectiveEnd, 218);
  send(sim, 'bid', { revision, amountSats: 120 }, { actorId: 'bidder-two', at: 217 });
  assert.equal(lot(sim).effectiveEnd, 220);
  assert.equal(send(sim, 'bid', { revision, amountSats: 130 }, { actorId: 'bidder-one', at: 220 }).status, 'rejected');
  assert.equal(lot(sim).effectiveEnd, 220);
  assert.throws(() => send(sim, 'close', {}, { at: 219 }), /backwards/);
});

test('command replay is idempotent, ownership-bound, and sequence conflicts do not mutate state', () => {
  const sim = new AuctionSimulation(config()), revision = ready(sim); send(sim, 'open', { revision });
  const sequence = sim.sequence, data = { revision, amountSats: 100 };
  const receipt = send(sim, 'bid', data, { id: 'bid-retry', actorId: 'bidder-one', at: 110 });
  assert.deepEqual(send(sim, 'bid', data, { id: 'bid-retry', actorId: 'bidder-one', at: 999, expectedSequence: sequence }), receipt);
  assert.equal(sim.sequence, sequence + 1);
  assert.throws(() => send(sim, 'bid', data, { id: 'bid-retry', actorId: 'bidder-two', at: 110 }), /different actor/);
  assert.throws(() => send(sim, 'bid', { revision, amountSats: 200 }, { expectedSequence: sequence, actorId: 'bidder-two', at: 110 }), /Sequence conflict/);
  assert.equal(lot(sim).bids.length, 1);
});

test('amount, authority and stale revision checks reject unsafe inputs', () => {
  const sim = new AuctionSimulation(config()), revision = ready(sim);
  assert.throws(() => send(sim, 'open', { revision }, { actorId: 'visitor-1' }), /Host/);
  send(sim, 'open', { revision });
  for (const amountSats of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, '100']) assert.throws(() => send(sim, 'bid', { revision, amountSats }, { actorId: 'bidder-one' }), /amount/);
  assert.throws(() => send(sim, 'bid', { revision: 'old', amountSats: 100 }, { actorId: 'bidder-one' }), /revision/);
  assert.equal(send(sim, 'bid', { revision, amountSats: 100 }, { actorId: 'unregistered' }).reason, 'not-registered');
  assert.throws(() => send(sim, 'close', {}, { at: 101 }), /deadline/);
});

test('partial, expired and out-of-order payment callbacks never duplicate payment journals', () => {
  const sim = new AuctionSimulation(config()), revision = ready(sim); send(sim, 'open', { revision });
  send(sim, 'bid', { revision, amountSats: 100 }, { actorId: 'bidder-one', at: 110 }); send(sim, 'close', {}, { at: 200 });
  const invoice = send(sim, 'open-invoice', {}, { at: 201 }).invoice;
  const base = { paymentId: 'sim-payment-a', invoiceId: invoice.id, amountSats: 40 };
  send(sim, 'payment-update', { ...base, status: 'pending' }, { at: 210 });
  send(sim, 'payment-update', { ...base, status: 'settled', settledAt: 211 }, { at: 212 });
  assert.equal(lot(sim).paymentState, 'partial');
  send(sim, 'expire-invoice', {}, { at: 261 }); assert.equal(lot(sim).paymentState, 'partial-expired-review');
  send(sim, 'payment-update', { ...base, status: 'failed' }, { at: 262 });
  assert.equal(lot(sim).totals.buyerReceivedSats, 40); assert.equal(lot(sim).journal.length, 1);
  // Delayed delivery of a verified-before-expiry settlement can reconcile paid.
  send(sim, 'payment-update', { paymentId: 'sim-payment-b', invoiceId: invoice.id, amountSats: 60, status: 'settled', settledAt: 250 }, { at: 263 });
  assert.equal(lot(sim).paymentState, 'paid');
  send(sim, 'payment-update', { ...base, status: 'settled', settledAt: 211 }, { at: 264 });
  assert.equal(lot(sim).journal.length, 2);
  assert.throws(() => send(sim, 'payment-update', { ...base, amountSats: 80, status: 'settled', settledAt: 211 }, { at: 265 }), /already bound/);
});

test('double and late payments are review states rather than settlement success', () => {
  const { sim, invoice } = paidLot();
  send(sim, 'payment-update', { paymentId: 'sim-extra', invoiceId: invoice.id, amountSats: 100, status: 'settled', settledAt: 215 }, { at: 216 });
  assert.equal(lot(sim).paymentState, 'overpaid-review');
  assert.equal(lot(sim).totals.buyerReceivedSats, 200);
  const lateSim = new AuctionSimulation(config()), revision = ready(lateSim); send(lateSim, 'open', { revision });
  send(lateSim, 'bid', { revision, amountSats: 100 }, { actorId: 'bidder-one', at: 110 }); send(lateSim, 'close', {}, { at: 200 });
  const lateInvoice = send(lateSim, 'open-invoice', {}, { at: 201 }).invoice;
  send(lateSim, 'payment-update', { paymentId: 'sim-late', invoiceId: lateInvoice.id, amountSats: 100, status: 'settled', settledAt: 261 }, { at: 262 });
  assert.equal(lot(lateSim).paymentState, 'late-payment-review');
});

test('artist receipt does not imply charity payment; payouts need separate artist approval', () => {
  const { sim } = paidLot();
  assert.equal(lot(sim).totals.charityPaidSats, 0); assert.equal(lot(sim).proceeds.charitySats, 25);
  const payout = { payoutId: 'sim-charity-payout', role: 'charity', amountSats: 25, status: 'settled' };
  assert.throws(() => send(sim, 'payout-update', payout, { at: 212 }), /authorization/);
  send(sim, 'authorize-payout', { role: 'charity', amountSats: 25 }, { actorId: 'artist', at: 212 });
  send(sim, 'payout-update', { ...payout, status: 'failed' }, { at: 213 });
  assert.equal(lot(sim).totals.charityPaidSats, 0);
  send(sim, 'payout-update', payout, { at: 214 });
  send(sim, 'payout-update', { ...payout, status: 'pending' }, { at: 215 });
  assert.equal(lot(sim).totals.charityPaidSats, 25);
  assert.equal(lot(sim).journal.filter(e => e.type === 'simulated-charity-payout').length, 1);
  assert.throws(() => send(sim, 'payout-update', { ...payout, payoutId: 'sim-extra-payout' }, { at: 216 }), /exceeds/);
});

test('racing payout IDs reserve authorization before settlement for either recipient', () => {
  for (const [role, authorization] of [['charity', 25], ['curator', 5]]) {
    const { sim } = paidLot();
    send(sim, 'authorize-payout', { role, amountSats: authorization }, { actorId: 'artist', at: 212 });
    const expectedSequence = sim.sequence;
    const first = { payoutId: 'sim-first', role, amountSats: authorization - 1, status: 'pending' };
    const second = { payoutId: 'sim-second', role, amountSats: 2, status: 'pending' };
    send(sim, 'payout-update', first, { at: 213, expectedSequence });
    const snapshot = sim.snapshot();
    assert.throws(() => send(sim, 'payout-update', second, { at: 213, expectedSequence }), /Sequence conflict/);
    assert.throws(() => send(sim, 'payout-update', second, { at: 213 }), /pending reservations/);
    assert.deepEqual(sim.snapshot(), snapshot);
    assert.equal(lot(sim).totals[`${role}PaidSats`], 0);
    assert.equal(lot(sim).totals[`${role}ReservedSats`], authorization - 1);
    assert.throws(() => send(sim, 'authorize-payout', { role, amountSats: 0 }, { actorId: 'artist', at: 213 }), /settled and pending/);
    send(sim, 'payout-update', { ...second, amountSats: 1 }, { at: 214 });
    assert.equal(lot(sim).totals[`${role}ReservedSats`], authorization);
    send(sim, 'payout-update', { ...first, status: 'settled' }, { at: 215 });
    assert.equal(lot(sim).totals[`${role}PaidSats`], authorization - 1);
    assert.equal(lot(sim).totals[`${role}ReservedSats`], 1);
  }
});

test('same-ID pending retries and settlement convert a reservation exactly once', () => {
  const { sim } = paidLot();
  send(sim, 'authorize-payout', { role: 'charity', amountSats: 25 }, { actorId: 'artist', at: 212 });
  const payout = { payoutId: 'sim-retried', role: 'charity', amountSats: 25, status: 'pending' };
  const receipt = send(sim, 'payout-update', payout, { id: 'pending-retry', at: 213 });
  assert.deepEqual(send(sim, 'payout-update', payout, { id: 'pending-retry', at: 214 }), receipt);
  send(sim, 'payout-update', payout, { at: 214 });
  assert.equal(lot(sim).totals.charityReservedSats, 25);
  send(sim, 'payout-update', { ...payout, status: 'settled' }, { at: 215 });
  send(sim, 'payout-update', { ...payout, status: 'settled' }, { at: 216 });
  assert.equal(lot(sim).totals.charityReservedSats, 0);
  assert.equal(lot(sim).totals.charityPaidSats, 25);
  assert.equal(lot(sim).journal.filter(entry => entry.reference === payout.payoutId).length, 1);
  assert.deepEqual(replayAuctionSimulation(sim.exportLog()).snapshot(), sim.snapshot());
});

test('failed payouts release reservations and retries compete for the remaining capacity', () => {
  const { sim } = paidLot();
  send(sim, 'authorize-payout', { role: 'charity', amountSats: 25 }, { actorId: 'artist', at: 212 });
  const first = { payoutId: 'sim-first', role: 'charity', amountSats: 25, status: 'pending' };
  send(sim, 'payout-update', first, { at: 213 });
  send(sim, 'payout-update', { ...first, status: 'failed' }, { at: 214 });
  assert.equal(lot(sim).totals.charityReservedSats, 0);
  send(sim, 'payout-update', first, { at: 215 });
  send(sim, 'payout-update', first, { at: 216 });
  assert.equal(lot(sim).totals.charityReservedSats, 25);
  send(sim, 'payout-update', { ...first, status: 'failed' }, { at: 217 });
  const second = { ...first, payoutId: 'sim-replacement' };
  send(sim, 'payout-update', second, { at: 218 });
  assert.throws(() => send(sim, 'payout-update', first, { at: 219 }), /pending reservations/);
  send(sim, 'dispute', { reason: 'Pause while the provider is reviewed' }, { at: 219 });
  send(sim, 'payout-update', { ...second, status: 'failed' }, { at: 220 });
  assert.equal(lot(sim).totals.charityReservedSats, 0);
  assert.equal(lot(sim).totals.charityPaidSats, 0);
  assert.deepEqual(replayAuctionSimulation(sim.exportLog()).snapshot(), sim.snapshot());
});

test('late payout settlement is retained for review even when a replacement consumed authorization', () => {
  const { sim } = paidLot();
  send(sim, 'authorize-payout', { role: 'charity', amountSats: 25 }, { actorId: 'artist', at: 212 });
  const first = { payoutId: 'sim-first', role: 'charity', amountSats: 25, status: 'pending' };
  send(sim, 'payout-update', first, { at: 213 });
  send(sim, 'payout-update', { ...first, status: 'failed' }, { at: 214 });
  const second = { ...first, payoutId: 'sim-replacement' };
  send(sim, 'payout-update', second, { at: 215 });
  assert.throws(() => send(sim, 'payout-update', { ...first, status: 'settled' }, { at: 216 }), /reconcile/);
  const reconciliation = { payoutId: first.payoutId, reason: 'Simulated provider corrected the previous failure to settled' };
  assert.throws(() => send(sim, 'reconcile-payout', reconciliation, { actorId: 'bidder-one', at: 216 }), /Host authority/);
  assert.throws(() => send(sim, 'reconcile-payout', { ...reconciliation, payoutId: 'sim-unknown' }, { at: 216 }), /previously recorded/);
  assert.equal(send(sim, 'reconcile-payout', reconciliation, { at: 216 }).payoutReviewRequired, true);
  assert.equal(lot(sim).totals.charityPaidSats, 25);
  assert.equal(lot(sim).totals.charityReservedSats, 25);
  assert.equal(sim.visitorSummary().lots[0].payoutReviewRequired, true);
  assert.throws(() => send(sim, 'payout-update', { ...second, status: 'settled' }, { at: 217 }), /review blocks/);
  // The replacement's observed settlement must also remain visible, even though
  // the combined result exceeds the agreed obligation. Neither action sends money.
  send(sim, 'reconcile-payout', { payoutId: second.payoutId, reason: 'Replacement also settled in the simulated provider' }, { at: 217 });
  send(sim, 'reconcile-payout', reconciliation, { at: 218 });
  assert.equal(lot(sim).totals.charityPaidSats, 50);
  assert.equal(lot(sim).totals.charityReservedSats, 0);
  assert.equal(lot(sim).journal.filter(entry => entry.type === 'simulated-charity-payout').length, 2);
  assert.equal(lot(sim).payoutAuthorization.charity, 25);
  assert.equal(lot(sim).proceeds.charitySats, 25);
  assert.deepEqual(replayAuctionSimulation(sim.exportLog()).snapshot(), sim.snapshot());
});

test('cancellation and refund preserve pending payout recovery and late settlement evidence', () => {
  const { sim } = paidLot();
  send(sim, 'authorize-payout', { role: 'charity', amountSats: 25 }, { actorId: 'artist', at: 212 });
  const payout = { payoutId: 'sim-charity', role: 'charity', amountSats: 25, status: 'pending' };
  send(sim, 'payout-update', payout, { at: 213 });
  send(sim, 'cancel', { reason: 'Rehearsal cancellation' }, { at: 214 });
  const refunded = send(sim, 'refund', { refundId: 'sim-refund', amountSats: 100, reason: 'Buyer refund' }, { at: 215 });
  assert.equal(refunded.payoutRecoveryReviewRequired, true);
  send(sim, 'payout-update', { ...payout, status: 'failed' }, { at: 216 });
  assert.equal(lot(sim).totals.charityReservedSats, 0);
  assert.throws(() => send(sim, 'payout-update', { ...payout, status: 'settled' }, { at: 217 }), /exactly paid/);
  send(sim, 'reconcile-payout', { payoutId: payout.payoutId, reason: 'Provider corrected a late settlement after cancellation' }, { at: 217 });
  assert.equal(lot(sim).paymentState, 'refunded');
  assert.equal(lot(sim).totals.charityPaidSats, 25);
  assert.equal(lot(sim).status, 'cancelled');
  assert.ok(lot(sim).payoutReview);
});

test('dispute and refund handling freezes further payouts and retains payout recovery needs', () => {
  const { sim } = paidLot();
  send(sim, 'dispute', { reason: 'Delivery problem in rehearsal' }, { actorId: 'bidder-one', at: 212 });
  send(sim, 'authorize-payout', { role: 'charity', amountSats: 25 }, { actorId: 'artist', at: 213 });
  const payout = { payoutId: 'sim-charity-payout', role: 'charity', amountSats: 25, status: 'settled' };
  assert.throws(() => send(sim, 'payout-update', payout, { at: 214 }), /undisputed/);
  send(sim, 'resolve-dispute', { reason: 'Rehearsal resolution approved' }, { at: 214 });
  send(sim, 'payout-update', payout, { at: 215 });
  const refund = send(sim, 'refund', { refundId: 'sim-refund', amountSats: 100, reason: 'Full rehearsal refund' }, { at: 216 });
  assert.equal(refund.payoutRecoveryReviewRequired, true); assert.equal(lot(sim).paymentState, 'refunded');
  assert.equal(lot(sim).totals.charityPaidSats, 25);
  assert.throws(() => send(sim, 'refund', { refundId: 'sim-refund', amountSats: 100, reason: 'Duplicate' }, { at: 217 }), /already recorded/);
});

test('winner default requires host review and never awards the next bidder automatically', () => {
  const sim = new AuctionSimulation(config()), revision = ready(sim); send(sim, 'open', { revision });
  send(sim, 'bid', { revision, amountSats: 100 }, { actorId: 'bidder-one', at: 110 });
  send(sim, 'bid', { revision, amountSats: 150 }, { actorId: 'bidder-two', at: 120 });
  send(sim, 'close', {}, { at: 200 }); send(sim, 'open-invoice', {}, { at: 201 });
  assert.throws(() => send(sim, 'review-default', { reason: 'Too soon' }, { at: 250 }), /expired/);
  const review = send(sim, 'review-default', { reason: 'No simulated payment after notice' }, { at: 262 });
  assert.equal(review.automaticNextBidderAward, false); assert.equal(lot(sim).winner.bidderId, 'bidder-two');
  send(sim, 'cancel', { reason: 'Re-auction under a new ID after review' }, { at: 263 });
  assert.equal(lot(sim).status, 'cancelled');
});

test('cancellation after payment records a refund review rather than silently reversing money', () => {
  const { sim } = paidLot();
  const receipt = send(sim, 'cancel', { reason: 'Artist withdrew the lot in rehearsal' }, { at: 212 });
  assert.equal(receipt.refundReviewRequired, true); assert.equal(lot(sim).totals.buyerReceivedSats, 100);
  assert.equal(lot(sim).refundedSats, 0);
});

test('split arithmetic conserves all sats, exposes rounding, and never adds a gate referral', () => {
  const result = splitAuctionProceeds(101, { artist: 7000, charity: 2500, curator: 500 });
  assert.equal(result.artistNetBeforeFeesSats, 71); assert.equal(result.charitySats, 25); assert.equal(result.curatorSats, 5); assert.equal(result.gateReferralSats, 0);
  const huge = splitAuctionProceeds(2_100_000_000_000_000, { artist: 3334, charity: 3333, curator: 3333 });
  assert.equal(huge.artistNetBeforeFeesSats + huge.charitySats + huge.curatorSats, huge.grossSaleSats);
});

test('private audit export detects altered/reordered entries; visitor view exposes no bidder or payment IDs', () => {
  const { sim } = paidLot(), archive = sim.exportLog();
  const altered = structuredClone(archive); altered.events.at(-1).command.amountSats = 99;
  assert.throws(() => replayAuctionSimulation(altered), /replay differs/);
  const reordered = structuredClone(archive); [reordered.events[0], reordered.events[1]] = [reordered.events[1], reordered.events[0]];
  assert.throws(() => replayAuctionSimulation(reordered), /reordered/);
  const visitor = JSON.stringify(sim.visitorSummary()); assert.doesNotMatch(visitor, /bidder-one|sim-payment-one|invoiceId/);
  assert.throws(() => send(sim, 'dispute', { reason: 'x', buyerAddress: 'Private address' }, { at: 212 }), /Unexpected command field/);
  assert.equal(archive.private, true); assert.equal(archive.simulation, true);
});

test('one simulated payment reference cannot pay two different lots', () => {
  const sim = new AuctionSimulation(config([terms('lot-one'), terms('lot-two')]));
  const revisions = { 'lot-one': ready(sim, 'lot-one'), 'lot-two': ready(sim, 'lot-two') };
  for (const [lotId, revision] of Object.entries(revisions)) send(sim, 'open', { revision }, { lotId });
  for (const [lotId, revision] of Object.entries(revisions)) send(sim, 'bid', { revision, amountSats: 100 }, { actorId: 'bidder-one', at: 110, lotId });
  for (const lotId of Object.keys(revisions)) send(sim, 'close', {}, { at: 200, lotId });
  const invoices = Object.fromEntries(Object.keys(revisions).map(lotId => [lotId, send(sim, 'open-invoice', {}, { at: 201, lotId }).invoice]));
  send(sim, 'payment-update', { paymentId: 'sim-shared-reference', invoiceId: invoices['lot-one'].id, amountSats: 100, status: 'settled', settledAt: 210 }, { at: 211 });
  assert.throws(() => send(sim, 'payment-update', { paymentId: 'sim-shared-reference', invoiceId: invoices['lot-two'].id, amountSats: 100, status: 'settled', settledAt: 210 }, { at: 212, lotId: 'lot-two' }), /already bound/);
  assert.equal(lot(sim, 'lot-two').totals.buyerReceivedSats, 0);
});

test('outbound snapshots cannot mutate host state or change agreed sale-referral policy', () => {
  const sim = new AuctionSimulation(config()), view = sim.snapshot();
  view.lots[0].terms.reserveSats = 1; view.lots[0].consent.artist = true;
  assert.equal(lot(sim).terms.reserveSats, 100); assert.equal(lot(sim).consent.artist, undefined);
  assert.throws(() => new AuctionSimulation(config([{ ...terms(), gateReferralBps: 1000 }])), /remain zero/);
  assert.throws(() => new AuctionSimulation(config([{ ...terms(), defaultPolicy: 'auto-award-next-bidder' }])), /default policy/);
});
