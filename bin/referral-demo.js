#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { acceptGate, createVisit, planReferral } from '../src/referrals.js';
import { applySimulationEvent, createSimulationLedger, exportReviewCsv, referralSummary } from '../src/referral-ledger.js';

try {
  const { values, positionals } = parseArgs({ options: { model: { type: 'string', default: 'two-tips' }, scenario: { type: 'string', default: 'complete' }, format: { type: 'string', default: 'json' } }, strict: true, allowPositionals: false });
  if (positionals.length || !['two-tips', 'artist-commission'].includes(values.model) || !['complete', 'second-fails', 'artist-refund'].includes(values.scenario) || !['json', 'csv'].includes(values.format)) throw new Error('Use --model two-tips|artist-commission --scenario complete|second-fails|artist-refund --format json|csv');
  const artist = 'a'.repeat(64), referrer = 'b'.repeat(64), now = 1800000000;
  const visit = acceptGate(createVisit(artist), { sourceKey: referrer, destinationKey: artist, gateId: 'simulated-gate', visitorAccepted: true, now });
  const terms = { mode: 'simulation', version: 'simulated-terms-v1', artistKey: artist, referrerKey: referrer, artistAccepted: true, model: values.model, paymentType: 'zap', rateBps: 1000, validFrom: now, expiresAt: now + 3600, refundPolicy: 'proportional-net-support' };
  const plan = planReferral({ id: 'simulation-1000-sats', artistKey: artist, amountMsat: '1000000', paymentType: 'zap', now, visit, terms, model: values.model, visitorAccepted: true });
  let state = createSimulationLedger(plan);
  const send = event => { state = applySimulationEvent(state, { mode: 'simulation', at: now + 10, ...event }); };
  const quote = { usdPerBtc: '100000', source: 'fictional-fixed-demo-rate', at: now + 10 };
  for (const leg of plan.legs) {
    if (leg.role === 'commission-payout') send({ type: 'approve-payout', id: 'approve', legId: leg.id, ownerKey: artist, amountMsat: leg.amountMsat, expiresAt: now + 300 });
    send({ type: 'attempt', id: `start-${leg.id}`, legId: leg.id, attemptId: leg.id, approvalId: leg.role === 'commission-payout' ? 'approve' : null });
    if (leg.id === 'referrer' && values.scenario === 'second-fails') send({ type: 'failed', id: 'failed-second', legId: leg.id, attemptId: leg.id });
    else send({ type: 'settled', id: `settled-${leg.id}`, legId: leg.id, attemptId: leg.id, recipientKey: leg.recipientKey, amountMsat: leg.amountMsat, paymentHash: (leg.id === 'artist' ? '1' : '2').repeat(64), feeMsat: leg.role === 'commission-payout' ? '2000' : '1000', quote });
  }
  if (values.scenario === 'artist-refund') send({ type: 'refunded', id: 'artist-refund', legId: 'artist', originalPaymentHash: '1'.repeat(64), refundHash: '3'.repeat(64), amountMsat: plan.legs[0].amountMsat, feeMsat: '1000', quote });
  if (values.format === 'csv') process.stdout.write(exportReviewCsv(state, artist));
  else console.log(JSON.stringify({ mode: 'simulation', notice: 'Fictional recipients and rate. No network requests or money movement. CSV is for review, not a QuickBooks import.', disclosure: plan.disclosure, summary: referralSummary(state), artistEntries: state.entries.filter(e => e.ownerKey === artist) }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
