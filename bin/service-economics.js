#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { evaluateServiceScenario } from '../src/service-economics.js';

const usage = 'usage: node bin/service-economics.js [--scenario ID | --input FILE | --all] [--json]';
const dollars = cents => {
  const value = BigInt(cents), magnitude = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}$${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
};

try {
  const args = process.argv.slice(2);
  let id, inputPath, all = false, json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' && args.length === 1) { console.log(usage); process.exit(0); }
    if (arg === '--json' && !json) json = true;
    else if (arg === '--all' && !all) all = true;
    else if (arg === '--scenario' && id === undefined && args[i + 1] && !args[i + 1].startsWith('--')) id = args[++i];
    else if (arg === '--input' && inputPath === undefined && args[i + 1] && !args[i + 1].startsWith('--')) inputPath = args[++i];
    else throw new TypeError(usage);
  }
  if ([id !== undefined, inputPath !== undefined, all].filter(Boolean).length > 1) throw new TypeError(usage);
  let scenarios;
  if (inputPath !== undefined) {
    const info = await stat(inputPath);
    if (!info.isFile() || info.size > 65536) throw new TypeError('Input must be a JSON file no larger than 64 KiB');
    const source = await readFile(inputPath, 'utf8');
    if (Buffer.byteLength(source) > 65536) throw new TypeError('Input exceeds 64 KiB');
    scenarios = [JSON.parse(source)];
  } else {
    scenarios = JSON.parse(await readFile(new URL('../examples/service-scenarios.json', import.meta.url), 'utf8'));
    if (id !== undefined) {
      scenarios = scenarios.filter(s => s.id === id);
      if (!scenarios.length) throw new TypeError('Unknown scenario id; use --all to list examples');
    }
  }
  const results = scenarios.map(evaluateServiceScenario);
  if (json) console.log(JSON.stringify(results, null, 2));
  else for (const r of results) {
    console.log(`HYPOTHETICAL — ${r.id} (${r.period}, ${r.units} units)`);
    console.log(`Per unit: ${dollars(r.perUnit.grossServiceRevenueCents)} gross; ${dollars(r.perUnit.refundReserveCents)} refund reserve; ${dollars(r.perUnit.contributionCents)} contribution before acquisition/fixed costs.`);
    console.log(`After acquisition: ${dollars(r.perUnit.afterAcquisitionCents)}/unit. Period surplus before tax: ${dollars(r.totals.operatingSurplusBeforeTaxCents)}.`);
    console.log(`Capacity: ${r.capacity.requiredMinutes}/${r.capacity.availableMinutes} minutes; maximum units ${r.capacity.maximumUnits ?? 'not measured'}${r.capacity.exceedsAvailableTime ? ' — OVER CAPACITY' : ''}.`);
    console.log(`Fixed-cost break-even: ${r.breakEven.units ?? 'unreachable'} units; within available time: ${r.breakEven.achievableWithinTime ?? 'not measured'}.`);
  }
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Invalid JSON scenario' : error.code ? 'Could not read scenario file' : error.message);
  process.exitCode = 1;
}
