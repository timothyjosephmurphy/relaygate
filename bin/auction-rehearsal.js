#!/usr/bin/env node
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { AuctionSimulation, replayAuctionSimulation } from '../src/auction-simulation.js';

const [destination, ...extra] = process.argv.slice(2);
try {
  if (!destination || extra.length) throw new Error('Usage: node bin/auction-rehearsal.js <new-output-folder>');
  const makeLot = (id, reserveSats = 100) => ({ id, title: `Synthetic ${id}`, artworkRef: `demo:${id}`, certificateRevision: null, artistId: 'demo-artist', charityId: 'demo-charity', curatorId: 'demo-curator', currency: 'SAT', settlement: 'artist-direct', splitBps: { artist: 7000, charity: 2500, curator: 500 }, startingBidSats: 100, reserveSats, incrementSats: 10, startAt: 100, endAt: 200, antiSniping: { windowSeconds: 10, responseSeconds: 10, maxExtensionSeconds: 20 }, paymentWindowSeconds: 60, shippingTerms: 'No real artwork or delivery in this rehearsal.', taxTerms: 'No purchase, donation or tax receipt.' });
  let simulation = new AuctionSimulation({ simulation: true, auctionId: 'three-lot-rehearsal', hostId: 'demo-host', lots: [makeLot('lot-one'), makeLot('lot-two'), makeLot('lot-three', 1000)] });
  let counter = 0;
  const send = (type, lotId, payload, at, actorId = 'demo-host') => simulation.dispatch({ id: `command-${++counter}`, type, lotId, ...payload }, { actorId, at, expectedSequence: simulation.sequence });
  const revisions = Object.fromEntries(simulation.snapshot().lots.map(lot => [lot.terms.id, lot.revision]));
  for (const [lotId, revision] of Object.entries(revisions)) {
    for (const role of ['artist', 'charity', 'curator']) send('consent', lotId, { role, revision, approved: true }, 90, `demo-${role}`);
    for (let i = 1; i <= 10; i++) send('register', lotId, { bidderId: `visitor-${i}`, termsAccepted: true }, 90);
  }
  for (const [lotId, revision] of Object.entries(revisions)) send('open', lotId, { revision }, 100);
  for (const [lotId, revision] of Object.entries(revisions)) send('bid', lotId, { revision, amountSats: 100 }, 110, 'visitor-1');
  send('bid', 'lot-one', { revision: revisions['lot-one'], amountSats: 150 }, 190, 'visitor-2');
  const firstAtDeadline = send('bid', 'lot-two', { revision: revisions['lot-two'], amountSats: 200 }, 199, 'visitor-3');
  const tiedAtDeadline = send('bid', 'lot-two', { revision: revisions['lot-two'], amountSats: 200 }, 199, 'visitor-4');
  const beforeRestart = simulation.exportLog();
  simulation = replayAuctionSimulation(beforeRestart);
  const lateDisconnectedBid = send('bid', 'lot-two', { revision: revisions['lot-two'], amountSats: 500 }, 209, 'visitor-10');
  for (const lotId of Object.keys(revisions)) send('close', lotId, {}, 220);
  const invoiceOne = send('open-invoice', 'lot-one', {}, 221).invoice;
  send('payment-update', 'lot-one', { paymentId: 'sim-part-one', invoiceId: invoiceOne.id, amountSats: 100, status: 'settled', settledAt: 230 }, 231);
  send('payment-update', 'lot-one', { paymentId: 'sim-part-two', invoiceId: invoiceOne.id, amountSats: 50, status: 'settled', settledAt: 235 }, 236);
  send('authorize-payout', 'lot-one', { role: 'charity', amountSats: 37 }, 237, 'demo-artist');
  send('payout-update', 'lot-one', { payoutId: 'sim-charity-one', role: 'charity', amountSats: 37, status: 'failed' }, 238);
  send('payout-update', 'lot-one', { payoutId: 'sim-charity-one', role: 'charity', amountSats: 37, status: 'settled' }, 239);
  send('open-invoice', 'lot-two', {}, 240);
  send('expire-invoice', 'lot-two', {}, 300);
  const defaultReview = send('review-default', 'lot-two', { reason: 'No payment after the simulated payment window and notice.' }, 301);
  const archive = simulation.exportLog(), replayed = replayAuctionSimulation(archive);
  const report = { simulation: true, actualPeopleParticipating: 0, simulatedVisitorIdentities: 10, actualMoneyMovedSats: 0, assertions: { firstBidAccepted: firstAtDeadline.status === 'accepted', tiedBidRejected: tiedAtDeadline.status === 'rejected', disconnectedLateBidRejected: lateDisconnectedBid.status === 'rejected', hostRestartReplays: JSON.stringify(simulation.snapshot()) === JSON.stringify(replayed.snapshot()), defaultDoesNotAutoAward: defaultReview.automaticNextBidderAward === false }, lots: simulation.snapshot().lots.map(lot => ({ id: lot.terms.id, winningBidId: lot.winner?.id ?? null, winningAmountSats: lot.winner?.amountSats ?? null, paymentState: lot.paymentState, totals: lot.totals, proceeds: lot.proceeds })) };
  if (!Object.values(report.assertions).every(Boolean)) throw new Error('Rehearsal assertion failed');
  await mkdir(destination);
  try {
    for (const [name, value] of [['private-simulation-log.json', archive], ['visitor-summary.json', simulation.visitorSummary()], ['rehearsal-report.json', report]]) await writeFile(path.join(destination, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
  console.log(`Simulation complete: 3 lots, 10 simulated visitor identities, 0 real payments. Private audit log saved to ${destination}.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
