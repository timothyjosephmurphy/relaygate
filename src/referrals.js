// Offline referral design and simulation helpers. Nothing here signs, fetches,
// creates an invoice, authorizes a real fee, or proves a gate was traversed.
export const REFERRAL_BPS = 1000; // Existing policy: 10% of zaps, 0% of sales.
export const MAX_MSAT = 2100000000000000000n;
export const fail = message => { throw new Error(message); };
export const key = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : fail('Expected a lowercase hex public key');
export const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value) ? value : fail('Invalid record identifier');
export const time = value => Number.isSafeInteger(value) && value >= 0 && value <= 253402300799 ? value : fail('Expected a Unix timestamp in seconds');
export function msat(value, { positive = false } = {}) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value)) fail('Amounts must be canonical integer millisatoshi strings');
  const amount = BigInt(value);
  if (amount > MAX_MSAT || (positive && amount === 0n)) fail('Amount is outside the supported range');
  return amount;
}
export function sats(value) {
  const amount = msat(value);
  return `${amount / 1000n}.${String(amount % 1000n).padStart(3, '0')}`;
}
export function referralShare(amountMsat) {
  const amount = msat(amountMsat, { positive: true });
  // Round down to one millisatoshi; the remainder stays with the artist.
  const referral = amount * BigInt(REFERRAL_BPS) / 10000n;
  return { artistMsat: String(amount - referral), referralMsat: String(referral) };
}

export function createVisit(destinationKey) {
  return { schema: 'relaygate/referral-visit/1', destinationKey: key(destinationKey), attribution: null };
}
export function clearReferral(visit) { return createVisit(visit.destinationKey); }
export function acceptGate(visit, { sourceKey, destinationKey, gateId, visitorAccepted, now, ttlSeconds = 1800 }) {
  if (visit?.schema !== 'relaygate/referral-visit/1') fail('Unsupported referral visit');
  key(visit.destinationKey); key(sourceKey); key(destinationKey); identifier(gateId); time(now);
  if (destinationKey !== visit.destinationKey) fail('Gate destination does not match this gallery');
  if (sourceKey === destinationKey) fail('Self-referrals are not eligible');
  if (visitorAccepted !== true) fail('Gate attribution needs an explicit visitor choice');
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86400) fail('Attribution lifetime must be between 1 second and 24 hours');
  time(now + ttlSeconds);
  // One attribution per visit; no chain, browser fingerprint or visitor key.
  return { ...createVisit(destinationKey), attribution: { sourceKey, destinationKey, gateId, acceptedAt: now, expiresAt: now + ttlSeconds, evidence: 'simulated-explicit-gate' } };
}

function approvedTerms(terms, artistKey, referrerKey, model, now) {
  if (!terms || terms.mode !== 'simulation' || terms.artistAccepted !== true) fail('Simulated artist consent and terms are required');
  if (key(terms.artistKey) !== artistKey || key(terms.referrerKey) !== referrerKey) fail('Terms recipients do not match the accepted gate');
  if (terms.model !== model || terms.paymentType !== 'zap' || terms.rateBps !== REFERRAL_BPS) fail('Unsupported referral model, payment type or percentage');
  if (model === 'artist-commission' && terms.refundPolicy !== 'proportional-net-support') fail('The commission simulation requires an explicit proportional refund policy');
  time(terms.validFrom); time(terms.expiresAt);
  if (terms.validFrom > now || terms.expiresAt <= now || terms.expiresAt <= terms.validFrom) fail('Referral terms are not currently valid');
  if (terms.revokedAt != null) { time(terms.revokedAt); fail('Referral terms have been revoked'); }
  return { mode: 'simulation', version: identifier(terms.version), artistKey, referrerKey, model, paymentType: 'zap', rateBps: REFERRAL_BPS, validFrom: terms.validFrom, expiresAt: terms.expiresAt, artistAccepted: true, refundPolicy: model === 'artist-commission' ? 'proportional-net-support' : 'recipient-independent' };
}

export function planReferral({ id, artistKey, amountMsat, paymentType, now, visit = null, terms = null, model = 'direct', referralsEnabled = true, visitorAccepted = false }) {
  identifier(id); key(artistKey); msat(amountMsat, { positive: true }); time(now);
  if (!['zap', 'sale'].includes(paymentType)) fail('Payment type must be zap or sale');
  if (!['direct', 'two-tips', 'artist-commission'].includes(model)) fail('Select an explicit payment classification');
  if (paymentType === 'sale' && model !== 'direct') fail('Painting sales have a 0% referral policy');
  const direct = reason => ({ schema: 'relaygate/referral-plan/1', mode: 'simulation', id, artistKey, paymentType, model: 'direct', createdAt: now, amountMsat, referralMsat: '0', agreement: null, attribution: null, reason, legs: [{ id: 'artist', role: 'artist-receipt', payer: 'visitor', recipientKey: artistKey, amountMsat, feePayer: 'visitor' }], disclosure: `The artist receives ${sats(amountMsat)} sats. There is no referral payment. Any sender fee is additional.` });
  if (model === 'direct') return direct('direct-choice');
  if (!referralsEnabled) return direct('artist-disabled-referrals');
  if (!visitorAccepted) return direct('visitor-declined-referral');
  const a = visit?.attribution;
  if (visit?.schema !== 'relaygate/referral-visit/1' || key(visit.destinationKey) !== artistKey || !a || a.evidence !== 'simulated-explicit-gate') fail('An accepted gate in this visit is required; a copied URL is not consent');
  key(a.sourceKey); key(a.destinationKey); identifier(a.gateId); time(a.acceptedAt); time(a.expiresAt);
  if (a.destinationKey !== artistKey || a.sourceKey === artistKey || a.acceptedAt > now || a.expiresAt <= now || a.expiresAt - a.acceptedAt > 86400) fail('Invalid, self-referred or expired gate attribution');
  const agreement = approvedTerms(terms, artistKey, a.sourceKey, model, now);
  const { artistMsat, referralMsat } = referralShare(amountMsat);
  if (referralMsat === '0') return direct('amount-below-one-millisatoshi-share');
  const artistAmount = model === 'two-tips' ? artistMsat : amountMsat;
  return {
    schema: 'relaygate/referral-plan/1', mode: 'simulation', id, artistKey, paymentType, model, createdAt: now, amountMsat, referralMsat, agreement,
    // Expiring visit details are omitted from the eventual private ledger.
    attribution: { gateId: a.gateId, referrerKey: a.sourceKey },
    legs: [
      { id: 'artist', role: 'artist-receipt', payer: 'visitor', recipientKey: artistKey, amountMsat: artistAmount, feePayer: 'visitor' },
      { id: 'referrer', role: model === 'two-tips' ? 'independent-tip' : 'commission-payout', payer: model === 'two-tips' ? 'visitor' : artistKey, recipientKey: a.sourceKey, amountMsat: referralMsat, feePayer: model === 'two-tips' ? 'visitor' : artistKey },
    ],
    disclosure: model === 'two-tips'
      ? `Two independent optional tips: ${sats(artistMsat)} sats to the artist and ${sats(referralMsat)} sats to the referrer. Two payments can fail separately. Sender fees are additional. The artist does not receive the referrer's tip.`
      : `The artist receives ${sats(amountMsat)} sats gross and owes ${sats(referralMsat)} sats as a separately approved commission. The artist pays the payout fee. No automatic split or payout is promised.`,
  };
}
