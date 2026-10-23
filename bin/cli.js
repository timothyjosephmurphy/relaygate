#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { importSite } from '../src/importer.js';
const usage = 'usage: relaygate <url> [--out dir] [--name "Artist"] [--gate-to <url>] [--max-pages N] [--delay ms] [--concurrency N] [--no-download]';
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    out: { type: 'string', default: 'relaygate-out' }, name: { type: 'string' }, 'gate-to': { type: 'string', multiple: true },
    'max-pages': { type: 'string', default: '600' }, delay: { type: 'string', default: '1000' }, concurrency: { type: 'string', default: '3' },
    'no-download': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) console.log(usage + '\nImports public website metadata into a local, unsigned gallery config.');
  else {
    if (positionals.length !== 1) throw new Error(usage);
    const gallery = await importSite(positionals[0], { out: values.out, name: values.name, gateTo: values['gate-to'] || [], maxPages: Number(values['max-pages']), delayMs: Number(values.delay), concurrency: Number(values.concurrency), download: !values['no-download'] });
    console.error(`${gallery.works.length} candidates -> ${values.out}/gallery.json (${gallery.warnings.length} warnings)`);
    console.error('Review titles, sizes and image rights before use. The 3D engine and Nostr publisher are not invoked.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
