#!/usr/bin/env node
import { importSite } from '../src/importer.js';
const a = process.argv.slice(2); const opt = { out: 'relaygate-out' }; let url;
for (let i = 0; i < a.length; i++) {
  const k = a[i];
  if (k === '--out') opt.out = a[++i]; else if (k === '--name') opt.name = a[++i];
  else if (k === '--gate-to') (opt.gateTo ??= []).push(a[++i]);
  else if (k === '--max-pages') opt.maxPages = +a[++i]; else if (k === '--delay') opt.delayMs = +a[++i];
  else if (k === '--no-download') opt.download = false; else if (!k.startsWith('--')) url = k;
}
if (!url) { console.error('usage: relaygate <url> [--out dir] [--name "Artist"] [--gate-to <url>] [--max-pages N] [--delay ms] [--no-download]\nRun this only on your own site.'); process.exit(1); }
const g = await importSite(url, opt);
console.error(`\n${g.works.length} works -> ${opt.out}/gallery.json`);
console.error('build step (engine core) not wired yet; see SPEC.md "Engine core interface".');
