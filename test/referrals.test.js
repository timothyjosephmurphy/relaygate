import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { acceptGate, clearReferral, createVisit, msat, planReferral, referralShare, sats } from '../src/referrals.js';
import { applySimulationEvent, createSimulationLedger, exportReviewCsv, referralSummary, replaySimulation } from '../src/referral-ledger.js';

const artist = 'a'.repeat(64), referrer = 'b'.repeat(64), other = 'c'.repeat(64), now = 1800000000;
const payment = digit => digit.repeat(64);
const terms = model => ({ mode: 'simulation', version: 'terms-v1', artistKey: artist, referrerKey: referrer, artistAccepted: true, model, paymentType: 'zap', rateBps: 1000, validFrom: now - 1, expiresAt: now + 3600, refundPolicy: 'proportional-net-support' });
const visit = () => acceptGate(createVisit(artist), { sourceKey: referrer, destinationKey: artist, gateId: 'gate-one', visitorAccepted: true, now });
const plan = (model = 'two-tips', extra = {}) => planReferral({ id: 'support-one', artistKey: artist, amountMsat: '1000000', paymentType: 'zap', now, visit: visit(), terms: terms(model), model, visitorAccepted: true, ...extra });
const event = (type, id, legId = 'artist', fields = {}) => ({ mode: 'simulation', type, id, legId, at: now + 10, ...fields });
const rate = () => ({ usdPerBtc: '100000.000000', source: 'simulation-fixed-rate', at: now + 10 });
function settled(state, legId = 'artist', hash = '1', amountMsat, fields = {}) {
  const attemptId = `${legId}-attempt-${hash}`;
  state = applySimulationEvent(state, event('attempt', `start-${attemptId}`, legId, { attemptId, approvalId: fields.approvalId }));
  const leg = state.plan.legs.find(l => l.id === legId);
  return applySimulationEvent(state, event('settled', `paid-${attemptId}`, legId, { attemptId, recipientKey: leg.recipientKey, paymentHash: payment(hash), amountMsat: amountMsat || leg.amountMsat, feeMsat: '0', quote: rate(), ...fields }));
}
function approve(state, amountMsat = '100000', id = 'approval-one') {
  return applySimulationEvent(state, event('approve-payout', id, 'referrer', { ownerKey: artist, amountMsat, expiresAt: now + 100 }));
}
function refund(state, legId, originalHash, refundHash, amountMsat, fields = {}) {
  return applySimulationEvent(state, event('refunded', `refund-${refundHash}`, legId, { originalPaymentHash: payment(originalHash), refundHash: payment(refundHash), amountMsat, feeMsat: '0', quote: rate(), ...fields }));
}

test('1000 sats divides exactly; millisatoshi rounding never loses funds', () => {
  assert.deepEqual(referralShare('1000000'), { artistMsat: '900000', referralMsat: '100000' });
  for (const amount of ['1', '9', '11', '101', '999999999999999999', '2100000000000000000']) {
    const split = referralShare(amount); assert.equal(BigInt(split.artistMsat) + BigInt(split.referralMsat), BigInt(amount));
  }
  assert.deepEqual(referralShare('11'), { artistMsat: '10', referralMsat: '1' });
  assert.equal(sats('1000001'), '1000.001');
  for (const value of [1, '01', '-1', '1.0', '1e3', '2100000000000000001', '']) assert.throws(() => msat(value));
});

test('only the last explicitly accepted gate survives and visitors can clear it', () => {
  const first = visit();
  const latest = acceptGate(first, { sourceKey: other, destinationKey: artist, gateId: 'gate-two', visitorAccepted: true, now: now + 10 });
  assert.equal(latest.attribution.sourceKey, other); assert.equal(latest.attribution.gateId, 'gate-two');
  assert.equal(first.attribution.sourceKey, referrer); assert.equal(clearReferral(latest).attribution, null);
  assert.equal(JSON.stringify(latest).includes('visitorId'), false);
  assert.throws(() => acceptGate(first, { sourceKey: artist, destinationKey: artist, gateId: 'self', visitorAccepted: true, now }), /Self/);
  assert.throws(() => acceptGate(first, { sourceKey: other, destinationKey: artist, gateId: 'copied', visitorAccepted: false, now }), /explicit/);
});

test('referrals require current terms, matching recipients, exact percentage and visitor consent', () => {
  for (const changed of [{ referrerKey: other }, { artistKey: other }, { rateBps: 2000 }, { expiresAt: now }, { revokedAt: now - 1 }, { artistAccepted: false }]) {
    assert.throws(() => plan('two-tips', { terms: { ...terms('two-tips'), ...changed } }));
  }
  assert.throws(() => plan('two-tips', { visit: null }), /accepted gate/);
  assert.throws(() => plan('two-tips', { now: now + 1800 }), /expired/);
  assert.equal(plan('two-tips', { visitorAccepted: false }).legs.length, 1);
  assert.equal(plan('two-tips', { visitorAccepted: false }).legs[0].amountMsat, '1000000');
  assert.equal(plan('artist-commission', { referralsEnabled: false }).model, 'direct');
  assert.equal(plan('two-tips', { amountMsat: '9' }).model, 'direct');
  assert.throws(() => plan('artist-commission', { terms: { ...terms('artist-commission'), refundPolicy: undefined } }), /refund policy/);
});

test('sale policy cannot be changed through a referring URL, terms or plan mutation', () => {
  assert.throws(() => plan('two-tips', { paymentType: 'sale' }), /0%/);
  assert.throws(() => plan('artist-commission', { paymentType: 'sale' }), /0%/);
  const direct = plan('direct', { paymentType: 'sale' }); assert.equal(direct.referralMsat, '0');
  const changed = plan(); changed.legs[0].recipientKey = referrer; assert.throws(() => createSimulationLedger(changed), /Artist recipient/);
  const saleChanged = plan(); saleChanged.paymentType = 'sale'; assert.throws(() => createSimulationLedger(saleChanged), /Sales/);
});

test('independent tips record 900 artist and 100 referrer; fees remain sender-paid', () => {
  let state = createSimulationLedger(plan()); state = settled(state); state = settled(state, 'referrer', '2');
  const summary = referralSummary(state); assert.equal(summary.complete, true); assert.equal(summary.grossArtistMsat, '900000');
  assert.deepEqual(state.entries.filter(e => e.ownerKey === artist).map(e => [e.category, e.amountMsat]), [['support-income', '900000']]);
  assert.equal(state.entries.find(e => e.ownerKey === referrer).amountMsat, '100000');
  assert.equal(state.entries[0].usdValue, '0.900000');
  assert.match(state.plan.disclosure, /Two payments can fail separately/);
});

test('first tip settled, second failed stays honestly incomplete and can retry', () => {
  let state = settled(createSimulationLedger(plan()));
  state = applySimulationEvent(state, event('attempt', 'start-second', 'referrer', { attemptId: 'second' }));
  state = applySimulationEvent(state, event('failed', 'fail-second', 'referrer', { attemptId: 'second' }));
  assert.equal(referralSummary(state).complete, false); assert.equal(referralSummary(state).legs[1].status, 'failed');
  state = settled(state, 'referrer', '2'); assert.equal(referralSummary(state).complete, true);
});

test('cancelled and expired legs stay unpaid; a confirmed late simulation is recorded', () => {
  for (const outcome of ['cancelled', 'expired']) {
    let state = createSimulationLedger(plan('direct'));
    state = applySimulationEvent(state, event('attempt', 'start', 'artist', { attemptId: 'one' }));
    state = applySimulationEvent(state, event(outcome, 'outcome', 'artist', { attemptId: 'one' }));
    assert.equal(referralSummary(state).legs[0].status, outcome);
    state = applySimulationEvent(state, event('settled', 'late', 'artist', { attemptId: 'one', recipientKey: artist, paymentHash: payment('1'), amountMsat: '1000000', feeMsat: '0', quote: rate() }));
    assert.equal(referralSummary(state).complete, true);
  }
});

test('commission books gross artist income and a separate approved commission expense', () => {
  let state = createSimulationLedger(plan('artist-commission'));
  assert.throws(() => approve(state), /liability/);
  state = settled(state); assert.equal(referralSummary(state).commissionLiabilityMsat, '100000');
  assert.throws(() => settled(state, 'referrer', '2'), /approval/);
  state = approve(state);
  state = settled(state, 'referrer', '2', '100000', { approvalId: 'approval-one', feeMsat: '2000' });
  assert.equal(referralSummary(state).complete, true);
  assert.deepEqual(state.entries.filter(e => e.ownerKey === artist).map(e => [e.category, e.direction, e.amountMsat]), [['support-income', 'in', '1000000'], ['referral-commissions', 'out', '100000'], ['payment-fees', 'out', '2000']]);
  assert.equal(state.entries.filter(e => e.ownerKey === referrer).length, 1);
});

test('pending payout attempts and expired/wrong-owner approvals cannot authorize a retry', () => {
  let state = settled(createSimulationLedger(plan('artist-commission'))); state = approve(state);
  assert.throws(() => applySimulationEvent(state, event('approve-payout', 'bad', 'referrer', { ownerKey: referrer, amountMsat: '100000', expiresAt: now + 100 })), /artist/);
  assert.throws(() => applySimulationEvent(state, event('attempt', 'late', 'referrer', { attemptId: 'late', approvalId: 'approval-one', at: now + 100 })), /approval/);
  state = applySimulationEvent(state, event('attempt', 'start-payout', 'referrer', { attemptId: 'payout', approvalId: 'approval-one' }));
  assert.throws(() => applySimulationEvent(state, event('attempt', 'duplicate-payout', 'referrer', { attemptId: 'payout-two', approvalId: 'approval-one' })), /unresolved/);
});

test('duplicate events and payment hashes never duplicate income; conflicting copies fail', () => {
  const initial = createSimulationLedger(plan('direct'));
  const started = applySimulationEvent(initial, event('attempt', 'start', 'artist', { attemptId: 'one' }));
  const paid = event('settled', 'paid', 'artist', { attemptId: 'one', recipientKey: artist, paymentHash: payment('1'), amountMsat: '1000000', feeMsat: '0', quote: rate() });
  const state = applySimulationEvent(started, paid);
  assert.equal(applySimulationEvent(state, paid), state);
  const alias = applySimulationEvent(state, { ...paid, id: 'same-provider-retry' });
  assert.deepEqual(alias.entries, state.entries);
  assert.throws(() => applySimulationEvent(alias, { ...paid, id: 'same-provider-retry', feeMsat: '1' }), /Conflicting/);
  assert.throws(() => applySimulationEvent(state, { ...paid, feeMsat: '1' }), /Conflicting/);
  assert.throws(() => applySimulationEvent(state, { ...paid, id: 'different-copy', feeMsat: '1' }), /different observation/);
  assert.deepEqual(replaySimulation(plan('direct'), state.events).entries, state.entries);
});

test('real-looking settlements, recipient replacement, amount changes and absent rate provenance fail', () => {
  let state = createSimulationLedger(plan('direct')); state = applySimulationEvent(state, event('attempt', 'start', 'artist', { attemptId: 'one' }));
  const paid = event('settled', 'paid', 'artist', { attemptId: 'one', recipientKey: artist, paymentHash: payment('1'), amountMsat: '1000000', feeMsat: '0', quote: rate() });
  for (const patch of [{ mode: 'live' }, { recipientKey: referrer }, { amountMsat: '1000001' }, { quote: null }]) assert.throws(() => applySimulationEvent(state, { ...paid, ...patch }));
  assert.equal(state.entries.length, 0);
});

test('partial refund reduces unpaid commission under the explicitly simulated proportional-refund rule', () => {
  let state = settled(createSimulationLedger(plan('artist-commission')));
  state = refund(state, 'artist', '1', '3', '500000');
  assert.equal(referralSummary(state).commissionLiabilityMsat, '50000');
  state = approve(state, '50000'); state = settled(state, 'referrer', '2', '50000', { approvalId: 'approval-one' });
  assert.equal(referralSummary(state).commissionLiabilityMsat, '0');
  assert.equal(referralSummary(state).complete, false);
  assert.equal(state.entries.filter(e => e.ownerKey === artist && e.category === 'support-income').length, 2);
});

test('refund after payout surfaces a recoverable overpayment without silently undoing the payout', () => {
  let state = settled(createSimulationLedger(plan('artist-commission'))); state = approve(state); state = settled(state, 'referrer', '2', '100000', { approvalId: 'approval-one' });
  state = refund(state, 'artist', '1', '3', '1000000');
  assert.equal(referralSummary(state).commissionRecoveryMsat, '100000');
  assert.equal(referralSummary(state).legs[0].outstandingMsat, '0');
  const withReturn = refund(state, 'referrer', '2', '4', '100000');
  assert.equal(referralSummary(withReturn).commissionRecoveryMsat, '0');
  assert.equal(withReturn.entries.find(e => e.ownerKey === artist && e.category === 'referral-commissions' && e.direction === 'in').amountMsat, '100000');
  assert.throws(() => refund(withReturn, 'referrer', '2', '5', '1'), /exceeds/);
  assert.equal(applySimulationEvent(withReturn, withReturn.refunds.at(-1)), withReturn);
  const alias = applySimulationEvent(withReturn, { ...withReturn.refunds.at(-1), id: 'same-refund-new-delivery' });
  assert.deepEqual(alias.entries, withReturn.entries);
});

test('two late payments after a failed attempt are flagged for reconciliation, not hidden', () => {
  let state = createSimulationLedger(plan('direct'));
  state = applySimulationEvent(state, event('attempt', 'start-old', 'artist', { attemptId: 'old' }));
  state = applySimulationEvent(state, event('expired', 'expire-old', 'artist', { attemptId: 'old' }));
  state = settled(state, 'artist', '1', '1000000');
  state = applySimulationEvent(state, event('settled', 'late-old', 'artist', { attemptId: 'old', recipientKey: artist, paymentHash: payment('2'), amountMsat: '1000000', feeMsat: '0', quote: rate() }));
  assert.equal(referralSummary(state).legs[0].excessMsat, '1000000'); assert.equal(referralSummary(state).complete, false);
});

test('private review CSV separates owners, neutralizes formulas and excludes payment hashes and payer fields', () => {
  const inputPlan = plan('artist-commission'); inputPlan.payerName = 'Private collector';
  let state = settled(createSimulationLedger(inputPlan), 'artist', '1', '1000000', { quote: { ...rate(), source: '=IMPORTDATA("bad")' } });
  state = approve(state); state = settled(state, 'referrer', '2', '100000', { approvalId: 'approval-one' });
  const csv = exportReviewCsv(state, artist);
  assert.match(csv, /simulation/); assert.match(csv, /referral-commissions/); assert.match(csv, /'=IMPORTDATA/);
  assert.doesNotMatch(csv, /Private collector|payer|payment_hash|referral-service-income/);
  assert.equal(state.plan.payerName, undefined); assert.equal(state.plan.attribution, undefined);
  assert.throws(() => exportReviewCsv(state, other), /participant/);
});

test('demo command exposes the incomplete second leg and labels its CSV as simulation', () => {
  const result = spawnSync(process.execPath, ['bin/referral-demo.js', '--model', 'two-tips', '--scenario', 'second-fails'], { encoding: 'utf8' });
  assert.equal(result.status, 0); const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'simulation'); assert.equal(report.summary.complete, false); assert.equal(report.summary.legs[1].status, 'failed');
  const csv = spawnSync(process.execPath, ['bin/referral-demo.js', '--model', 'artist-commission', '--format', 'csv'], { encoding: 'utf8' });
  assert.equal(csv.status, 0); assert.match(csv.stdout, /"simulation"/); assert.match(csv.stdout, /"referral-commissions"/);
  const bad = spawnSync(process.execPath, ['bin/referral-demo.js', '--model', 'automatic-live-split'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
