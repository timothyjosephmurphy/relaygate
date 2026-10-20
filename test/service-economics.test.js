import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateServiceScenario } from '../src/service-economics.js';

const scenarios = JSON.parse(await readFile(new URL('../examples/service-scenarios.json', import.meta.url), 'utf8'));
const scenario = id => structuredClone(scenarios.find(s => s.id === id));
const baseline = () => scenario('setup-issue-baseline');
const run = args => spawnSync(process.execPath, [new URL('../bin/service-economics.js', import.meta.url).pathname, ...args], { encoding: 'utf8' });

test('issue examples reproduce contribution while keeping acquisition and fixed costs separate', () => {
  const results = scenarios.slice(0, 4).map(evaluateServiceScenario);
  assert.deepEqual(results.map(r => r.perUnit.contributionCents), [10400, 400, 27000, 50000]);
  assert.equal(results[0].totals.grossServiceRevenueCents, 2400000);
  assert.equal(results[0].totals.contributionCents, 1040000);
  assert.equal(results[0].capacity.requiredMinutes, 12000);
  assert.equal(results[1].capacity.maximumUnits, 50);
  assert.equal(results[1].capacity.exceedsAvailableTime, true);
});

test('fees, refund reserve and acquisition reduce contribution without inventing demand', () => {
  const input = scenario('hosting-loaded'), saved = structuredClone(input);
  const r = evaluateServiceScenario(input);
  assert.deepEqual(input, saved);
  assert.equal(r.perUnit.refundReserveCents, 1200);
  assert.equal(r.perUnit.paymentFeesCents, 750);
  assert.equal(r.perUnit.contributionCents, 8450);
  assert.equal(r.perUnit.afterAcquisitionCents, 4950);
  assert.equal(r.totals.operatingSurplusBeforeTaxCents, 195000);
  assert.equal(r.capacity.maximumUnits, 80);
  assert.equal(r.capacity.exceedsAvailableTime, true);
  assert.deepEqual(r.breakEven, { units: 61, achievableWithinTime: true });
  const doubled = evaluateServiceScenario(scenario('hosting-loaded-double-support'));
  assert.equal(doubled.perUnit.afterAcquisitionCents, -5050);
  assert.equal(doubled.totals.operatingSurplusBeforeTaxCents, -805000);
  assert.deepEqual(doubled.breakEven, { units: null, achievableWithinTime: false });
});

test('positive per-job contribution can still miss fixed-cost break-even or exceed capacity', () => {
  const r = evaluateServiceScenario(scenario('setup-loaded'));
  assert.equal(r.perUnit.afterAcquisitionCents, 9670);
  assert.equal(r.totals.operatingSurplusBeforeTaxCents, -201650);
  assert.deepEqual(r.breakEven, { units: 26, achievableWithinTime: false });
  assert.equal(r.capacity.maximumUnits, 5);
  assert.equal(r.capacity.exceedsAvailableTime, false);
  const six = evaluateServiceScenario({ ...scenario('setup-loaded'), units: 6 });
  assert.equal(six.capacity.exceedsAvailableTime, true);
});

test('rounding is explicit for fractional-cent rates and partial-hour labor', () => {
  const r = evaluateServiceScenario({ ...baseline(), priceCents: 1, refundBps: 5000, paymentFeeBps: 5000, paymentFeeFixedCents: 2, hourlyLaborCents: 1, deliveryMinutes: 1, supportMinutes: 61, acquisitionMinutes: 1, otherVariableCents: 0, refundHandlingCents: 3 });
  assert.equal(r.perUnit.refundReserveCents, 1);
  assert.equal(r.perUnit.paymentFeesCents, 3);
  assert.equal(r.perUnit.deliveryLaborCents, 1);
  assert.equal(r.perUnit.supportLaborCents, 2);
  assert.equal(r.perUnit.acquisitionLaborCents, 1);
  assert.equal(r.perUnit.contributionCents, -9);
});

test('zero jobs, full refunds and unmeasured time remain explicit', () => {
  const noJobs = evaluateServiceScenario({ ...baseline(), units: 0, fixedPeriodCents: 10000 });
  assert.equal(noJobs.totals.operatingSurplusBeforeTaxCents, -10000);
  assert.equal(noJobs.capacity.requiredMinutes, 0);
  const refunded = evaluateServiceScenario({ ...baseline(), refundBps: 10000, paymentFeeFixedCents: 30 });
  assert.equal(refunded.perUnit.netServiceRevenueCents, 0);
  assert.equal(refunded.perUnit.paymentFeesCents, 30);
  assert.ok(refunded.perUnit.contributionCents < 0);
  const noTime = evaluateServiceScenario({ ...baseline(), deliveryMinutes: 0 });
  assert.equal(noTime.capacity.maximumUnits, null);
  assert.equal(noTime.breakEven.achievableWithinTime, null);
});

test('unsupported billing fields, rates, currencies and unsafe arithmetic fail closed', () => {
  for (const changes of [{ hypothetical: false }, { currency: 'BTC' }, { schema: 'invoice' }, { priceCents: 1.1 }, { units: -1 }, { refundBps: 10001 }, { paymentFeeBps: NaN }, { id: '../price' }, { period: 'monthly' }, { visitorTracking: true }]) {
    assert.throws(() => evaluateServiceScenario({ ...baseline(), ...changes }), TypeError);
  }
  const missing = baseline(); delete missing.supportMinutes;
  assert.throws(() => evaluateServiceScenario(missing), /supportMinutes/);
  assert.throws(() => evaluateServiceScenario({ ...baseline(), priceCents: Number.MAX_SAFE_INTEGER, units: 2 }), RangeError);
  assert.throws(() => evaluateServiceScenario({ ...baseline(), hourlyLaborCents: Number.MAX_SAFE_INTEGER, deliveryMinutes: Number.MAX_SAFE_INTEGER }), RangeError);
});

test('CLI emits all hypothetical scenarios, a selected scenario, and useful argument errors', () => {
  const all = run(['--all', '--json']); assert.equal(all.status, 0, all.stderr);
  const output = JSON.parse(all.stdout); assert.equal(output.length, 8); assert.ok(output.every(r => r.hypothetical));
  const one = run(['--scenario', 'hosting-loaded']); assert.equal(one.status, 0, one.stderr);
  assert.match(one.stdout, /HYPOTHETICAL/); assert.match(one.stdout, /\$49\.50/); assert.match(one.stdout, /OVER CAPACITY/);
  for (const args of [['--scenario', 'missing'], ['--scenario'], ['--all', '--input', 'file'], ['--json', '--json'], ['--unknown']]) {
    const error = run(args); assert.equal(error.status, 1); assert.ok(error.stderr); assert.equal(error.stdout, '');
  }
});

test('CLI reads bounded user scenarios and keeps extreme cent values exact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relaygate-economics-'));
  try {
    const path = join(dir, 'scenario.json');
    await writeFile(path, JSON.stringify({ ...baseline(), priceCents: Number.MAX_SAFE_INTEGER, units: 1, hourlyLaborCents: 0, otherVariableCents: 0 }));
    const valid = run(['--input', path]); assert.equal(valid.status, 0, valid.stderr); assert.match(valid.stdout, /\$90071992547409\.91 gross/);
    await writeFile(path, '{broken'); const malformed = run(['--input', path]); assert.equal(malformed.status, 1); assert.match(malformed.stderr, /Invalid JSON/);
    await writeFile(path, ' '.repeat(65537)); const large = run(['--input', path]); assert.equal(large.status, 1); assert.match(large.stderr, /64 KiB/);
    const directory = run(['--input', dir]); assert.equal(directory.status, 1); assert.match(directory.stderr, /JSON file/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
