#!/usr/bin/env node
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createCertificateProofs } from '../src/certificate-proofs.js';

const [inputFile, outputDir, profileFile, ...extra] = process.argv.slice(2);
try {
  if (!inputFile || !outputDir || extra.length) throw new Error('Usage: node bin/certificate-proofs.js <reviewed-demo.json> <new-output-folder> [print-profile.json]');
  const input = await readFile(inputFile);
  if (input.length > 1024 * 1024) throw new Error('Input exceeds 1 MiB');
  let profiles = {};
  if (profileFile) {
    const profileBytes = await readFile(profileFile);
    if (profileBytes.length > 128 * 1024) throw new Error('Print profile exceeds 128 KiB');
    profiles = JSON.parse(profileBytes.toString('utf8'));
    if (profiles.fontFile) {
      profiles.fontBytes = await readFile(profiles.fontFile);
      if (profiles.fontBytes.length > 16 * 1024 * 1024) throw new Error('Font exceeds 16 MiB');
    }
  }
  const result = await createCertificateProofs(JSON.parse(input.toString('utf8')), profiles);
  await mkdir(outputDir);
  try { for (const [name, bytes] of result.files) await writeFile(path.join(outputDir, name), bytes, { flag: 'wx' }); }
  catch (error) { await rm(outputDir, { recursive: true, force: true }); throw error; }
  console.log(`Created ${result.records.length} unsigned DEMO proofs. No master event, signature, publication or certificate issuance was created.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
