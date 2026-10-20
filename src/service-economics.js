// Offline planning arithmetic. These are hypothetical service scenarios, not invoices.
const SCHEMA = 'relaygate/service-scenario/1';
const MONEY = [
  'priceCents', 'paymentFeeFixedCents', 'refundHandlingCents', 'hourlyLaborCents',
  'infrastructureCents', 'materialsCents', 'otherVariableCents',
  'acquisitionCashCents', 'fixedPeriodCents'
];
const MINUTES = ['deliveryMinutes', 'supportMinutes', 'acquisitionMinutes', 'availableMinutes'];
const KEYS = new Set(['schema', 'hypothetical', 'id', 'currency', 'period', 'units',
  'refundBps', 'paymentFeeBps', ...MONEY, ...MINUTES]);

function integer(value, name, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new TypeError(`${name} must be a non-negative safe integer within its limit`);
  }
  return BigInt(value);
}
function safe(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('Scenario result exceeds safe integer range');
  }
  return Number(value);
}
const ceil = (value, divisor) => (value + divisor - 1n) / divisor;
const halfUpBps = (cents, bps) => (cents * bps + 5000n) / 10000n;

/** Money in integer USD cents; time in integer minutes; rates in basis points. */
export function evaluateServiceScenario(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new TypeError('Expected a scenario object');
  if (Object.keys(input).some(key => !KEYS.has(key))) throw new TypeError('Unknown scenario field');
  if (input.schema !== SCHEMA || input.hypothetical !== true || input.currency !== 'USD') {
    throw new TypeError('Expected a hypothetical USD service scenario');
  }
  if (typeof input.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(input.id)) throw new TypeError('Invalid scenario id');
  if (!['one-time', 'annual'].includes(input.period)) throw new TypeError('Period must be one-time or annual');
  const values = {};
  for (const key of [...MONEY, ...MINUTES, 'units']) values[key] = integer(input[key], key);
  for (const key of ['refundBps', 'paymentFeeBps']) values[key] = integer(input[key], key, 10000);
  const v = values;
  const refundReserve = halfUpBps(v.priceCents, v.refundBps);
  // Retain the original collection fee even after a refund; adjust assumptions explicitly.
  const paymentFees = halfUpBps(v.priceCents, v.paymentFeeBps) + v.paymentFeeFixedCents;
  const labor = minutes => ceil(minutes * v.hourlyLaborCents, 60n);
  const deliveryLabor = labor(v.deliveryMinutes);
  const supportLabor = labor(v.supportMinutes);
  const acquisitionLabor = labor(v.acquisitionMinutes);
  const netRevenue = v.priceCents - refundReserve;
  const variableDelivery = paymentFees + v.refundHandlingCents + deliveryLabor + supportLabor +
    v.infrastructureCents + v.materialsCents + v.otherVariableCents;
  const contribution = netRevenue - variableDelivery;
  const acquisitionCost = acquisitionLabor + v.acquisitionCashCents;
  const afterAcquisition = contribution - acquisitionCost;
  const totalMinutesPerUnit = v.deliveryMinutes + v.supportMinutes + v.acquisitionMinutes;
  const maxUnits = totalMinutesPerUnit === 0n ? null : v.availableMinutes / totalMinutesPerUnit;
  // Break-even is a volume under these assumptions, never a demand forecast.
  const breakEvenUnits = v.fixedPeriodCents === 0n ? 0n :
    afterAcquisition > 0n ? ceil(v.fixedPeriodCents, afterAcquisition) : null;
  const perUnit = {
    grossServiceRevenueCents: v.priceCents, refundReserveCents: refundReserve,
    netServiceRevenueCents: netRevenue, paymentFeesCents: paymentFees,
    refundHandlingCents: v.refundHandlingCents, deliveryLaborCents: deliveryLabor,
    supportLaborCents: supportLabor, infrastructureCents: v.infrastructureCents,
    materialsCents: v.materialsCents, otherVariableCents: v.otherVariableCents,
    variableDeliveryCents: variableDelivery, contributionCents: contribution,
    acquisitionLaborCents: acquisitionLabor, acquisitionCashCents: v.acquisitionCashCents,
    afterAcquisitionCents: afterAcquisition
  };
  return {
    schema: 'relaygate/service-economics/1', hypothetical: true, currency: 'USD',
    id: input.id, period: input.period, units: input.units,
    assumptions: { ...input },
    perUnit: Object.fromEntries(Object.entries(perUnit).map(([key, value]) => [key, safe(value)])),
    totals: {
      grossServiceRevenueCents: safe(v.priceCents * v.units),
      refundReserveCents: safe(refundReserve * v.units),
      netServiceRevenueCents: safe(netRevenue * v.units),
      contributionCents: safe(contribution * v.units),
      acquisitionCostCents: safe(acquisitionCost * v.units),
      afterAcquisitionCents: safe(afterAcquisition * v.units),
      fixedPeriodCents: input.fixedPeriodCents,
      operatingSurplusBeforeTaxCents: safe(afterAcquisition * v.units - v.fixedPeriodCents)
    },
    capacity: {
      requiredMinutes: safe(totalMinutesPerUnit * v.units), availableMinutes: input.availableMinutes,
      maximumUnits: maxUnits === null ? null : safe(maxUnits),
      exceedsAvailableTime: totalMinutesPerUnit * v.units > v.availableMinutes
    },
    breakEven: {
      units: breakEvenUnits === null ? null : safe(breakEvenUnits),
      achievableWithinTime: breakEvenUnits === null ? false : maxUnits === null ? null : breakEvenUnits <= maxUnits
    }
  };
}
