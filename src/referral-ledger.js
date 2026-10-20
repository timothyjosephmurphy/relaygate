import { createHash } from 'node:crypto';
import { fail, identifier, key, msat, time, REFERRAL_BPS } from './referrals.js';

const copy = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const paymentHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : fail('Invalid simulated payment hash');
const integer = value => String(value);

function quote(input) {
  if (!input || typeof input.usdPerBtc !== 'string' || !/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$/.test(input.usdPerBtc) || Number(input.usdPerBtc) <= 0) fail('A positive USD/BTC quote with at most six decimal places is required');
  if (typeof input.source !== 'string' || !input.source.trim() || input.source.length > 200 || /[\r\n\u0000]/.test(input.source)) fail('A bounded rate source is required');
  time(input.at);
  return { usdPerBtc: input.usdPerBtc, source: input.source, at: input.at };
}
function usdMicros(amount, rate) {
  const [whole, fraction = ''] = rate.usdPerBtc.split('.');
  const perBtc = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  return (amount * perBtc + 50000000000n) / 100000000000n;
}
const decimalUsd = micros => `${micros / 1000000n}.${String(micros % 1000000n).padStart(6, '0')}`;

function checkPlan(plan) {
  if (!plan || plan.mode !== 'simulation' || plan.schema !== 'relaygate/referral-plan/1') fail('Only offline simulation plans are accepted');
  identifier(plan.id); key(plan.artistKey); time(plan.createdAt); msat(plan.amountMsat, { positive: true }); msat(plan.referralMsat);
  if (!['direct', 'two-tips', 'artist-commission'].includes(plan.model) || !['zap', 'sale'].includes(plan.paymentType)) fail('Invalid plan classification');
  if (plan.paymentType === 'sale' && plan.model !== 'direct') fail('Sales cannot have referrals');
  const expectedShare = BigInt(plan.amountMsat) * BigInt(REFERRAL_BPS) / 10000n;
  const two = plan.model !== 'direct';
  if (!Array.isArray(plan.legs) || plan.legs.length !== (two ? 2 : 1)) fail('Invalid payment legs');
  const artist = plan.legs[0];
  if (artist.id !== 'artist' || artist.role !== 'artist-receipt' || artist.recipientKey !== plan.artistKey || artist.payer !== 'visitor' || artist.feePayer !== 'visitor' || msat(artist.amountMsat) !== BigInt(plan.amountMsat) - (plan.model === 'two-tips' ? expectedShare : 0n)) fail('Artist recipient or amount was altered');
  if (!two) {
    if (plan.referralMsat !== '0' || plan.agreement != null || plan.attribution != null) fail('Direct plans cannot carry referral liabilities');
  } else {
    const ref = plan.legs[1], terms = plan.agreement;
    if (!terms || terms.mode !== 'simulation' || terms.artistAccepted !== true || terms.artistKey !== plan.artistKey || terms.model !== plan.model || terms.rateBps !== REFERRAL_BPS || terms.paymentType !== 'zap' || terms.validFrom > plan.createdAt || terms.expiresAt <= plan.createdAt || terms.revokedAt != null || terms.refundPolicy !== (plan.model === 'artist-commission' ? 'proportional-net-support' : 'recipient-independent')) fail('Invalid simulated terms');
    identifier(terms.version); time(terms.validFrom); time(terms.expiresAt); key(terms.referrerKey);
    if (terms.referrerKey === plan.artistKey || expectedShare === 0n || BigInt(plan.referralMsat) !== expectedShare || ref.id !== 'referrer' || ref.recipientKey !== terms.referrerKey || ref.amountMsat !== plan.referralMsat || ref.role !== (plan.model === 'two-tips' ? 'independent-tip' : 'commission-payout') || ref.payer !== (plan.model === 'two-tips' ? 'visitor' : plan.artistKey) || ref.feePayer !== ref.payer) fail('Referrer recipient, role or amount was altered');
  }
}

export function createSimulationLedger(plan) {
  checkPlan(plan);
  const safe = Object.fromEntries(['schema', 'mode', 'id', 'artistKey', 'paymentType', 'model', 'createdAt', 'amountMsat', 'referralMsat', 'agreement', 'legs', 'reason', 'disclosure'].filter(k => plan[k] !== undefined).map(k => [k, copy(plan[k])]));
  safe.legs = plan.legs.map(l => Object.fromEntries(['id', 'role', 'payer', 'recipientKey', 'amountMsat', 'feePayer'].map(k => [k, l[k]])));
  if (plan.agreement) safe.agreement = Object.fromEntries(['mode', 'version', 'artistKey', 'referrerKey', 'model', 'paymentType', 'rateBps', 'validFrom', 'expiresAt', 'artistAccepted', 'refundPolicy'].map(k => [k, plan.agreement[k]]));
  // Keep an agreement reference for reconciliation, not a visitor trail.
  delete safe.attribution;
  return { schema: 'relaygate/referral-ledger/1', mode: 'simulation', plan: safe, events: [], attempts: [], approvals: [], payments: [], refunds: [], entries: [] };
}

function totals(state, legId) {
  const payments = state.payments.filter(p => p.legId === legId);
  const paid = payments.reduce((sum, p) => sum + BigInt(p.amountMsat), 0n);
  const refunded = state.refunds.filter(r => payments.some(p => p.paymentHash === r.originalPaymentHash)).reduce((sum, r) => sum + BigInt(r.amountMsat), 0n);
  return { paid, refunded, net: paid - refunded };
}
function commissionDue(state) {
  if (state.plan.model !== 'artist-commission') return 0n;
  const net = totals(state, 'artist').net, expected = BigInt(state.plan.amountMsat);
  // Accidental duplicate receipts do not create a larger commission agreement.
  return (net < expected ? net : expected) * BigInt(REFERRAL_BPS) / 10000n;
}
function remaining(state, leg) {
  return (leg.role === 'commission-payout' ? commissionDue(state) : BigInt(leg.amountMsat)) - totals(state, leg.id).net;
}
function post(state, { ownerKey, category, direction, amount, event, leg, reference }) {
  if (amount === 0n || ownerKey === 'visitor') return;
  state.entries.push({ id: `${event.id}:${state.entries.length}`, mode: 'simulation', at: event.at, ownerKey, planId: state.plan.id, legId: leg.id, category, direction, amountMsat: integer(amount), usdValue: decimalUsd(usdMicros(amount, event.quote)), quote: event.quote, reference, agreementVersion: state.plan.agreement?.version ?? null });
}

// Only simulated observations are accepted. Provider adapters, webhook auth,
// signature checks and actual payments are deliberately not implemented here.
export function applySimulationEvent(input, supplied) {
  if (input?.schema !== 'relaygate/referral-ledger/1' || input.mode !== 'simulation') fail('Unsupported simulation ledger');
  if (!supplied || supplied.mode !== 'simulation') fail('Real or unverified settlement claims are not accepted');
  identifier(supplied.id); time(supplied.at);
  if (supplied.at < input.plan.createdAt) fail('Event predates the payment plan');
  const event = { mode: 'simulation', id: supplied.id, type: supplied.type, at: supplied.at, legId: supplied.legId };
  const leg = input.plan.legs.find(l => l.id === event.legId);
  if (!leg) fail('Unknown payment leg');
  if (event.type === 'approve-payout') {
    event.ownerKey = key(supplied.ownerKey); event.amountMsat = String(msat(supplied.amountMsat, { positive: true })); event.expiresAt = time(supplied.expiresAt);
  } else if (event.type === 'attempt') {
    event.attemptId = identifier(supplied.attemptId); event.approvalId = supplied.approvalId == null ? null : identifier(supplied.approvalId);
  } else if (['failed', 'cancelled', 'expired'].includes(event.type)) {
    event.attemptId = identifier(supplied.attemptId);
  } else if (event.type === 'settled') {
    event.attemptId = identifier(supplied.attemptId); event.recipientKey = key(supplied.recipientKey); event.paymentHash = paymentHash(supplied.paymentHash);
    event.amountMsat = String(msat(supplied.amountMsat, { positive: true })); event.feeMsat = String(msat(supplied.feeMsat)); event.quote = quote(supplied.quote);
  } else if (event.type === 'refunded') {
    event.originalPaymentHash = paymentHash(supplied.originalPaymentHash); event.refundHash = paymentHash(supplied.refundHash);
    event.amountMsat = String(msat(supplied.amountMsat, { positive: true })); event.feeMsat = String(msat(supplied.feeMsat)); event.quote = quote(supplied.quote);
  } else fail('Unsupported simulation event');
  const fingerprint = hash(event), replay = input.events.find(e => e.id === event.id);
  if (replay) { if (replay.fingerprint !== fingerprint) fail('Conflicting event ID'); return input; }
  if (input.events.length >= 10000) fail('Simulation event limit reached');
  const state = copy(input);
  if (event.type === 'approve-payout') {
    if (leg.role !== 'commission-payout' || event.ownerKey !== state.plan.artistKey || BigInt(event.amountMsat) !== remaining(state, leg) || event.expiresAt <= event.at || event.expiresAt - event.at > 86400) fail('Payout approval must match the artist and current positive liability');
    state.approvals.push(event);
  } else if (event.type === 'attempt') {
    if (state.attempts.some(a => a.id === event.attemptId)) fail('Duplicate payout/payment attempt ID');
    if (state.attempts.some(a => a.legId === leg.id && a.status === 'pending')) fail('A payment attempt is unresolved; reconcile it before retrying');
    const due = remaining(state, leg);
    if (due <= 0n || (leg.role !== 'commission-payout' && totals(state, leg.id).paid > 0n)) fail('No unpaid amount is available for this leg');
    if (leg.role === 'commission-payout') {
      const approval = state.approvals.find(a => a.id === event.approvalId);
      if (!approval || approval.at > event.at || approval.expiresAt <= event.at || BigInt(approval.amountMsat) !== due || approval.ownerKey !== state.plan.artistKey) fail('A current explicit artist payout approval is required');
    }
    state.attempts.push({ id: event.attemptId, legId: leg.id, createdAt: event.at, amountMsat: integer(due), status: 'pending', approvalId: event.approvalId });
  } else if (['failed', 'cancelled', 'expired'].includes(event.type)) {
    const attempt = state.attempts.find(a => a.id === event.attemptId && a.legId === leg.id);
    if (!attempt || attempt.status !== 'pending' || event.at < attempt.createdAt) fail('Only a pending attempt can fail, expire or be cancelled');
    attempt.status = event.type;
  } else if (event.type === 'settled') {
    const attempt = state.attempts.find(a => a.id === event.attemptId && a.legId === leg.id);
    if (!attempt || event.at < attempt.createdAt || attempt.amountMsat !== event.amountMsat || event.recipientKey !== leg.recipientKey) fail('Settlement does not match its attempt, amount and recipient');
    const prior = state.payments.find(p => p.paymentHash === event.paymentHash);
    if (prior) {
      const { eventId, ...previous } = prior;
      const comparable = { legId: leg.id, attemptId: event.attemptId, paymentHash: event.paymentHash, amountMsat: event.amountMsat, feeMsat: event.feeMsat, quote: event.quote, at: event.at };
      if (hash(previous) !== hash(comparable)) fail('Payment hash already belongs to a different observation');
      state.events.push({ fingerprint, ...event });
      return state;
    }
    if (state.refunds.some(r => r.refundHash === event.paymentHash)) fail('Transaction reference already belongs to a refund');
    if (state.payments.some(p => p.attemptId === attempt.id)) fail('An attempt already has a settlement; reconcile a new payment separately');
    attempt.status = 'settled';
    state.payments.push({ eventId: event.id, legId: leg.id, attemptId: event.attemptId, paymentHash: event.paymentHash, amountMsat: event.amountMsat, feeMsat: event.feeMsat, quote: event.quote, at: event.at });
    const amount = BigInt(event.amountMsat);
    post(state, { ownerKey: leg.recipientKey, category: leg.role === 'commission-payout' ? 'referral-service-income' : state.plan.paymentType === 'sale' ? 'art-sales-income' : 'support-income', direction: 'in', amount, event, leg, reference: event.paymentHash });
    if (leg.role === 'commission-payout') post(state, { ownerKey: leg.payer, category: 'referral-commissions', direction: 'out', amount, event, leg, reference: event.paymentHash });
    post(state, { ownerKey: leg.feePayer, category: 'payment-fees', direction: 'out', amount: BigInt(event.feeMsat), event, leg, reference: event.paymentHash });
  } else {
    const original = state.payments.find(p => p.paymentHash === event.originalPaymentHash && p.legId === leg.id);
    if (!original || event.at < original.at) fail('Refund must reference an earlier settled payment');
    const prior = state.refunds.find(r => r.refundHash === event.refundHash);
    if (prior) {
      const { id, ...previous } = prior, { id: ignored, ...comparable } = event;
      if (hash(previous) !== hash(comparable)) fail('Refund hash already belongs to a different observation');
      state.events.push({ fingerprint, ...event });
      return state;
    }
    if (state.payments.some(p => p.paymentHash === event.refundHash) || event.refundHash === event.originalPaymentHash) fail('Refund must have its own transaction reference');
    const refunded = state.refunds.filter(r => r.originalPaymentHash === original.paymentHash).reduce((sum, r) => sum + BigInt(r.amountMsat), 0n);
    if (refunded + BigInt(event.amountMsat) > BigInt(original.amountMsat)) fail('Refund exceeds the settled amount');
    state.refunds.push(event);
    const amount = BigInt(event.amountMsat);
    post(state, { ownerKey: leg.recipientKey, category: leg.role === 'commission-payout' ? 'referral-service-income' : state.plan.paymentType === 'sale' ? 'art-sales-income' : 'support-income', direction: 'out', amount, event, leg, reference: event.refundHash });
    if (leg.role === 'commission-payout') post(state, { ownerKey: leg.payer, category: 'referral-commissions', direction: 'in', amount, event, leg, reference: event.refundHash });
    post(state, { ownerKey: leg.recipientKey, category: 'payment-fees', direction: 'out', amount: BigInt(event.feeMsat), event, leg, reference: event.refundHash });
  }
  state.events.push({ id: event.id, fingerprint, ...event });
  return state;
}

export function replaySimulation(plan, events) {
  if (!Array.isArray(events) || events.length > 10000) fail('Invalid simulation event log');
  return events.reduce(applySimulationEvent, createSimulationLedger(plan));
}

export function referralSummary(state) {
  if (state?.mode !== 'simulation' || state.schema !== 'relaygate/referral-ledger/1') fail('Expected a simulation ledger');
  const legs = state.plan.legs.map(leg => {
    const t = totals(state, leg.id), target = leg.role === 'commission-payout' ? commissionDue(state) : BigInt(leg.amountMsat);
    const due = target - (leg.role === 'commission-payout' ? t.net : t.paid);
    const excess = t.net > target ? t.net - target : 0n;
    const last = state.attempts.filter(a => a.legId === leg.id).at(-1);
    return { id: leg.id, role: leg.role, recipientKey: leg.recipientKey, expectedMsat: integer(target), settledMsat: integer(t.paid), refundedMsat: integer(t.refunded), netMsat: integer(t.net), outstandingMsat: integer(due > 0n ? due : 0n), excessMsat: integer(excess), status: excess > 0n ? 'reconciliation-required' : t.refunded > 0n ? 'refunded-or-partially-refunded' : due <= 0n && t.paid > 0n ? 'settled' : last?.status || 'not-started' };
  });
  const commission = legs.find(l => l.role === 'commission-payout');
  const grossArtistMsat = integer(totals(state, 'artist').paid);
  const complete = legs.every(l => l.outstandingMsat === '0' && l.excessMsat === '0' && l.refundedMsat === '0');
  return { mode: 'simulation', model: state.plan.model, grossArtistMsat, legs, complete, commissionLiabilityMsat: commission?.outstandingMsat || '0', commissionRecoveryMsat: commission?.excessMsat || '0', message: complete ? 'All planned simulated payments settled; no real money moved.' : 'Not complete. Review each simulated recipient, unpaid liability and refund separately.' };
}

function csvCell(value) {
  let text = String(value ?? '');
  // Quoting alone does not prevent spreadsheet formula execution.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function exportReviewCsv(state, ownerKey) {
  key(ownerKey);
  if (state?.mode !== 'simulation' || state.schema !== 'relaygate/referral-ledger/1' || !state.plan.legs.some(l => l.recipientKey === ownerKey)) fail('Select a participant in this simulation');
  const header = ['mode', 'entry_id', 'date_utc', 'plan_id', 'leg', 'category', 'direction', 'amount_msat', 'usd_value', 'rate_usd_per_btc', 'rate_source', 'rate_time_utc', 'agreement_version'];
  const rows = state.entries.filter(e => e.ownerKey === ownerKey).map(e => [e.mode, e.id, new Date(e.at * 1000).toISOString(), e.planId, e.legId, e.category, e.direction, e.amountMsat, e.usdValue, e.quote.usdPerBtc, e.quote.source, new Date(e.quote.at * 1000).toISOString(), e.agreementVersion]);
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
