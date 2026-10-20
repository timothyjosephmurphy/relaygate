import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { npubEncode } from 'nostr-tools/nip19';
import { verifyEvent } from 'nostr-tools/pure';
import { buildGalleryDraft, compareRevisions, encodeGalleryAddress, eventEnvelope, galleryCoordinate, inspectEvent, manifestContent, publicKey, relayUrl, unsignedEnvelope } from '../src/nostr-events.js';
import { deletionApplies, galleryDeletionFilters, queryVerifiedEvents, resolveGallery, resolveGalleryWorks, selectGalleryRevisions, websocketQuery } from '../src/nostr-relays.js';
import { externalSigner, signReviewedEvent } from '../src/nostr-signer.js';

// Existing public event from https://nostr.how/en/the-protocol (retrieved
// 2026-10-20). No signing keys are generated, stored or used by these tests.
const note = JSON.parse(readFileSync(new URL('./fixtures/nostr-public-note.json', import.meta.url), 'utf8'));
const key = note.pubkey, otherKey = 'b'.repeat(64), coordinate = `37440:${key}:main`;
const now = note.created_at + 1000;
const copy = value => structuredClone(value);
const relay = async () => ({ events: [], complete: true, reason: 'eose' });
const draft = overrides => buildGalleryDraft({ pubkey: key, createdAt: now, title: 'Studio', ...overrides });
const parse = event => manifestContent({ ...event, pubkey: key });

describe('public event verification', () => {
  it('checks a genuine public signature and expected author and event ID', () => {
    assert.equal(inspectEvent(note, { expectedPubkey: npubEncode(key), expectedId: note.id, now }).status, 'verified');
    assert.equal(inspectEvent(note, { expectedPubkey: otherKey, now }).status, 'wrong-author');
    assert.equal(inspectEvent(note, { expectedId: 'a'.repeat(64), now }).status, 'wrong-id');
  });

  it('rechecks altered data even after nostr-tools has cached verification', () => {
    const poisoned = copy(note);
    assert.equal(verifyEvent(poisoned), true);
    poisoned.content = 'Changed after verification';
    assert.equal(inspectEvent(poisoned, { now }).status, 'invalid-signature');
    assert.equal(inspectEvent({ ...note, id: 'a'.repeat(64) }, { now }).status, 'invalid-signature');
    assert.equal(inspectEvent({ ...note, sig: '0'.repeat(128) }, { now }).status, 'invalid-signature');
  });

  it('distinguishes a valid signature from an unacceptable future timestamp', () => {
    const result = inspectEvent(note, { now: note.created_at - 301 });
    assert.equal(result.status, 'future');
    assert.equal(result.signatureVerified, true);
    assert.equal(inspectEvent(note, { now: note.created_at - 300 }).status, 'verified');
  });

  it('bounds input and discards unknown flags without treating them as proof', () => {
    assert.equal(inspectEvent({ signatureVerified: true }).status, 'invalid');
    assert.throws(() => unsignedEnvelope({ ...note, content: 'x'.repeat(512 * 1024) }), /512 KiB/);
    assert.throws(() => unsignedEnvelope({ ...note, tags: [['x', 1]] }), /Tag value/);
    const clean = eventEnvelope({ ...note, verified: true, privateAnnotation: 'do not export' });
    assert.equal(clean.verified, undefined);
    assert.equal(clean.privateAnnotation, undefined);
  });

  it('supports public keys and bounded gallery addresses without accepting other identifier types', () => {
    assert.equal(publicKey(npubEncode(key)), key);
    assert.throws(() => publicKey('not-a-public-key'), /public key/);
    const encoded = encodeGalleryAddress(coordinate, ['wss://relay.example', 'wss://relay.example/']);
    assert.deepEqual(galleryCoordinate(encoded), { kind: 37440, pubkey: key, identifier: 'main', coordinate, relays: ['wss://relay.example/'] });
    for (const invalid of [`37441:${key}:main`, `37440:${key}:`, `37440:${key}:a\nb`]) assert.throws(() => galleryCoordinate(invalid));
    for (const invalid of ['http://relay.example', 'wss://user:password@relay.example', 'wss://relay.example/?token=value']) assert.throws(() => relayUrl(invalid));
  });
});

describe('experimental gallery drafts and schema', () => {
  it('builds an unsigned allowlisted draft with explicit location and gate references', () => {
    const event = draft({
      webUrl: 'https://artist.example/gallery',
      works: [{ id: 'work-1', eventId: note.id, imageIndex: 0, sizeIn: null, privateAnnotation: 'customer data' }],
      gates: [{ target: `37440:${otherKey}:studio`, label: 'Other studio', relays: [], privateAnnotation: 'omit' }],
    });
    assert.equal(event.id, undefined); assert.equal(event.sig, undefined); assert.equal(event.pubkey, undefined);
    assert.equal(event.content.includes('privateAnnotation'), false);
    const manifest = parse(event);
    assert.deepEqual(manifest.location, { url: 'https://artist.example/gallery' });
    assert.equal(manifest.location.assertion, undefined); // Parsing is not verification.
    assert.equal(manifest.works[0].sizeIn, null);
    assert.equal(manifest.referral.enabled, false);
    assert.deepEqual(event.tags.filter(t => t[0] === 'p'), [['p', otherKey]]);
  });

  it('rejects mismatched references, duplicate IDs and cross-artist listings', () => {
    const event = draft({ works: [{ id: 'a', eventId: note.id, imageIndex: 0 }] });
    assert.throws(() => parse({ ...event, tags: event.tags.filter(t => t[0] !== 'e') }), /disagree/);
    const work = { id: 'a', eventId: note.id, imageIndex: 0 };
    assert.throws(() => draft({ works: [work, work] }), /duplicate/);
    assert.throws(() => draft({ works: [{ ...work, id: 1 }] }), /artwork ID/);
    assert.throws(() => draft({ works: [{ ...work, listing: `30402:${otherKey}:a` }] }), /gallery artist/);
    assert.throws(() => draft({ works: [{ ...work, listing: `30402:${key}:` }] }), /identifier/);
  });

  it('keeps unknown physical size unknown and rejects impossible values and unsupported schema', () => {
    for (const sizeIn of [{ w: 0, h: 10 }, { w: 10, h: -1 }, { w: 4001, h: 1 }]) {
      assert.throws(() => draft({ works: [{ id: 'a', eventId: note.id, imageIndex: 0, sizeIn }] }), /dimensions/);
    }
    const event = draft(), source = JSON.parse(event.content);
    source.schema = 'relaygate/manifest/2';
    assert.throws(() => parse({ ...event, content: JSON.stringify(source) }), /Unsupported/);
    assert.throws(() => draft({ layout: { algorithm: 'custom-script', seed: 'x' } }), /layout/);
    assert.throws(() => draft({ works: Array.from({ length: 501 }, (_, i) => ({ id: `w${i}`, eventId: note.id, imageIndex: 0 })) }), /500/);
  });

  it('requires an explicit exact gallery URL tag and never infers it from the artist website', () => {
    const ordinary = draft(); ordinary.tags.push(['r', 'https://artist.example/']);
    assert.equal(parse(ordinary).location, null);
    const event = draft({ webUrl: 'https://artist.example/' });
    event.tags.find(t => t[0] === 'r')[1] = 'https://other.example/';
    assert.throws(() => parse(event), /exact/);
    assert.throws(() => draft({ webUrl: 'https://user:password@artist.example/' }), /credentials/);
    assert.throws(() => draft({ webUrl: 'javascript:alert(1)' }), /HTTPS/);
    const missing = draft(); missing.tags.push(['r', 'https://artist.example/', 'gallery']);
    assert.throws(() => parse(missing), /no matching/);
  });

  it('chooses NIP-01 revisions by timestamp then lexically lowest ID', () => {
    // Pure ordering records, not fabricated signed events.
    const records = [{ id: 'b', created_at: 2 }, { id: 'a', created_at: 2 }, { id: '0', created_at: 1 }];
    assert.deepEqual(records.sort(compareRevisions).map(r => r.id), ['a', 'b', '0']);
  });

  it('keeps a newer duplicate-d revision for rejection instead of reviving older content', () => {
    // Pure selection-policy records, deliberately unsigned. Cryptography is
    // independently tested above; these are not signed-gallery fixtures.
    const older = { ...draft(), pubkey: key, id: 'a'.repeat(64), created_at: now - 1 };
    const newer = { ...draft(), pubkey: key, id: 'b'.repeat(64), tags: [['d', 'other'], ['d', 'main']] };
    const otherAuthor = { ...newer, pubkey: otherKey, id: 'c'.repeat(64) };
    const revisions = selectGalleryRevisions([older, newer, older, otherAuthor], coordinate);
    assert.deepEqual(revisions.map(event => event.id), [newer.id, older.id]);
    assert.throws(() => manifestContent(revisions[0]), /exactly one/);
  });

  it('applies same-author NIP-09 deletion requests with address timestamp boundaries', () => {
    // Pure policy fixtures; these are never passed off as valid signatures.
    const event = { id: 'target', kind: 37440, pubkey: key, created_at: 20, tags: [['d', 'main']] };
    const deletion = { kind: 5, pubkey: key, created_at: 20, tags: [['a', coordinate]] };
    assert.equal(deletionApplies(event, deletion), true);
    assert.equal(deletionApplies(event, { ...deletion, created_at: 19 }), false);
    assert.equal(deletionApplies(event, { ...deletion, pubkey: otherKey }), false);
    assert.equal(deletionApplies(event, { ...deletion, tags: [['e', 'target']] }), true);
    assert.equal(deletionApplies({ ...event, kind: 5 }, { ...deletion, tags: [['e', 'target']] }), false);
  });

  it('keeps deletion queries bounded with more than one thousand observed revisions', async () => {
    // Policy-only history, not signed events. The outbound filters themselves
    // pass through the real verified-query boundary with an empty test relay.
    const history = Array.from({ length: 1201 }, (_, index) => ({ kind: 37440, pubkey: key, tags: [['d', 'main']], created_at: index, id: index.toString(16).padStart(64, '0') }));
    const selected = selectGalleryRevisions(history, coordinate)[0];
    const filters = galleryDeletionFilters(selected.id, coordinate);
    assert.deepEqual(filters.map(filter => filter['#e']).filter(Boolean), [[selected.id]]);
    assert.deepEqual(filters[0]['#a'], [coordinate]);
    let calls = 0;
    await queryVerifiedEvents(['wss://relay.example'], filters, { query: async (_url, sent) => { calls++; assert.deepEqual(sent, filters); return { events: [], complete: true }; } });
    assert.equal(calls, 1);
    assert.throws(() => galleryDeletionFilters('short-id', coordinate), /exact selected event ID/);
  });
});

describe('bounded verified relay reads', () => {
  it('verifies and deduplicates a public event from two test transports', async () => {
    const query = async () => ({ events: [copy(note), { ...note, content: 'tampered' }], complete: true, reason: 'eose' });
    const result = await queryVerifiedEvents(['wss://one.example', 'wss://two.example'], [{ kinds: [1], authors: [key] }], { query, now });
    assert.equal(result.events.length, 1);
    assert.deepEqual(result.events[0].relays, ['wss://one.example/', 'wss://two.example/']);
    assert.deepEqual(result.observations.map(o => o.rejectedEvents), [1, 1]);
  });

  it('does not trust relay filtering or accept valid far-future events', async () => {
    const query = async () => ({ events: [note], complete: true });
    const wrongKind = await queryVerifiedEvents(['wss://one.example'], [{ kinds: [20] }], { query, now });
    assert.equal(wrongKind.events.length, 0); assert.equal(wrongKind.observations[0].rejectedEvents, 1);
    const future = await queryVerifiedEvents(['wss://one.example'], [{ kinds: [1] }], { query, now: note.created_at - 1000 });
    assert.equal(future.events.length, 0); assert.equal(future.observations[0].futureEvents, 1);
  });

  it('aborts unresponsive transports and distinguishes timeout from invalid signature', async () => {
    let aborted = false;
    const query = (_url, _filters, { signal }) => new Promise(() => signal.addEventListener('abort', () => { aborted = true; }));
    const result = await queryVerifiedEvents(['wss://one.example'], [{ kinds: [1] }], { query, timeoutMs: 5, now });
    assert.equal(aborted, true); assert.equal(result.observations[0].reason, 'timeout');
    assert.equal(result.observations[0].rejectedEvents, 0);
  });

  it('caps concurrency and checks input before opening transports', async () => {
    let active = 0, peak = 0;
    const query = async () => { active++; peak = Math.max(active, peak); await new Promise(resolve => setTimeout(resolve, 2)); active--; return { events: [], complete: true }; };
    await queryVerifiedEvents(Array.from({ length: 8 }, (_, i) => `wss://r${i}.example`), [{ kinds: [1] }], { query, concurrency: 2, now });
    assert.equal(peak, 2);
    await assert.rejects(queryVerifiedEvents(['wss://one.example'], [{ unsupported: true }], { query }), /Unsupported filter/);
    await assert.rejects(queryVerifiedEvents(['wss://one.example'], [{ kinds: [1] }], { query, concurrency: 5 }), /concurrency/);
    for (const field of ['authors', 'ids', '#e', '#p']) {
      await assert.rejects(queryVerifiedEvents(['wss://one.example'], [{ [field]: ['a-prefix'] }], { query }), /exact lowercase hex/);
    }
  });

  it('guest resolution makes public reads without any signer and reports missing versus offline', async () => {
    const missing = await resolveGallery(coordinate, { relays: ['wss://one.example'], query: relay, now });
    assert.equal(missing.status, 'unavailable'); assert.equal(missing.availability, 'not-found-on-queried-relays');
    assert.equal(missing.signatureStatus, 'not-observed'); assert.equal(missing.location, null);
    const offline = await resolveGallery(coordinate, { relays: ['wss://one.example'], query: async () => { throw new Error('offline'); }, now });
    assert.equal(offline.availability, 'offline-or-incomplete'); assert.equal(offline.signatureStatus, 'not-observed');
  });

  it('rejects unsigned cached manifests and forged resolver status flags', async () => {
    const forged = { ...draft({ webUrl: 'https://artist.example/' }), pubkey: key, signatureVerified: true, status: 'verified' };
    const result = await resolveGallery(coordinate, { relays: [], cachedEvents: [forged], query: relay, now });
    assert.equal(result.status, 'unavailable'); assert.equal(result.location, null);
    await assert.rejects(resolveGalleryWorks({ status: 'verified', pubkey: key, event: forged, eventId: note.id, relays: [] }, { query: relay, now }), /no longer valid/);
  });

  it('bounds cached data before verification or relay reads', async () => {
    let queries = 0;
    const query = async () => { queries++; return { events: [], complete: true }; };
    const large = { ...note, content: 'x'.repeat(512 * 1024) };
    await assert.rejects(resolveGallery(coordinate, { relays: [], cachedEvents: Array(33).fill(large), query, now }), /16 MiB/);
    assert.equal(queries, 0);
  });
});

class FakeSocket extends EventTarget {
  static instances = [];
  constructor(url) { super(); this.url = url; this.readyState = 0; this.sent = []; FakeSocket.instances.push(this); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.closed = true; }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  frame(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
}

describe('read-only WebSocket adapter', () => {
  it('opens REQ, collects public events, then sends CLOSE and disposes on EOSE', async () => {
    const query = websocketQuery(FakeSocket);
    const pending = query('wss://relay.example', [{ kinds: [1] }]);
    const socket = FakeSocket.instances.at(-1); socket.open();
    const subscription = socket.sent[0][1];
    socket.frame(['EVENT', 'another-subscription', note]);
    socket.frame(['EVENT', subscription, note]); socket.frame(['EOSE', subscription]);
    const result = await pending;
    assert.equal(result.complete, true); assert.equal(result.events.length, 1);
    assert.deepEqual(socket.sent.map(frame => frame[0]), ['REQ', 'CLOSE']); assert.equal(socket.closed, true);
  });

  it('refuses authentication without calling a signer and cleans up on abort', async () => {
    const query = websocketQuery(FakeSocket), pending = query('wss://relay.example', [{ kinds: [1] }]);
    const socket = FakeSocket.instances.at(-1); socket.open(); socket.frame(['AUTH', 'challenge']);
    assert.equal((await pending).reason, 'authentication-required');
    assert.deepEqual(socket.sent.map(frame => frame[0]), ['REQ', 'CLOSE']);
    const controller = new AbortController(), next = query('wss://relay.example', [{ kinds: [1] }], { signal: controller.signal });
    const second = FakeSocket.instances.at(-1); controller.abort();
    assert.equal((await next).reason, 'aborted'); assert.equal(second.closed, true);
  });

  it('bounds message counts and returns incomplete data when a relay disconnects', async () => {
    const query = websocketQuery(FakeSocket), pending = query('wss://relay.example', [{ kinds: [1] }], { maxEvents: 1 });
    const socket = FakeSocket.instances.at(-1); socket.open(); const sub = socket.sent[0][1];
    socket.frame(['EVENT', sub, note]); socket.frame(['EVENT', sub, note]);
    assert.equal((await pending).reason, 'event-limit');
    const next = query('wss://relay.example', [{ kinds: [1] }]);
    const second = FakeSocket.instances.at(-1); second.open(); second.frame(['EVENT', second.sent[0][1], note]); second.dispatchEvent(new Event('close'));
    const result = await next; assert.equal(result.complete, false); assert.equal(result.events.length, 1);
  });
});

describe('external signer boundary', () => {
  const request = unsignedEnvelope(note);
  const options = { approved: true, expectedPubkey: key };
  // Test-only replay of the existing public fixture: this provider never signs.
  const replayProvider = () => ({ getPublicKey: async () => key, signEvent: async () => copy(note) });

  it('requires explicit review before any signer call, including a missing provider', async () => {
    let calls = 0;
    const provider = { getPublicKey: () => { calls++; }, signEvent: () => { calls++; } };
    assert.equal((await signReviewedEvent(provider, request, { expectedPubkey: key })).status, 'review-required');
    assert.equal((await signReviewedEvent(provider, request, { ...options, approved: 'yes' })).status, 'review-required');
    assert.equal(calls, 0);
    assert.equal((await signReviewedEvent(null, request, options)).status, 'signer-unavailable');
    assert.equal(externalSigner({}), null);
  });

  it('allows reviewed NIP-23 narration while rejecting unsupported kinds before provider calls', async () => {
    let identityCalls = 0, signCalls = 0;
    const narration = { kind: 30023, created_at: now, tags: [['d', 'relaygate-story:work-1:en']], content: 'Artist-reviewed story.' };
    const provider = {
      getPublicKey: async () => { identityCalls++; return key; },
      signEvent: async event => { signCalls++; assert.deepEqual(event, narration); return copy(note); },
    };
    assert.equal((await signReviewedEvent(provider, narration, { expectedPubkey: key })).status, 'review-required');
    assert.equal(identityCalls, 0); assert.equal(signCalls, 0);
    await assert.rejects(signReviewedEvent(provider, { ...narration, kind: 22242 }, options), /does not support/);
    assert.equal(identityCalls, 0); assert.equal(signCalls, 0);
    // The kind-1 fixture is not a valid return for this story. This proves the
    // allowed handoff without pretending to generate a new signature.
    assert.equal((await signReviewedEvent(provider, narration, options)).status, 'invalid-return');
    assert.equal(identityCalls, 1); assert.equal(signCalls, 1);
  });

  it('checks returned signatures and exact reviewed content without publishing', async () => {
    const signed = await signReviewedEvent(replayProvider(), request, options);
    assert.equal(signed.status, 'signed'); assert.equal(signed.published, false); assert.equal(signed.event.id, note.id);
    const changed = await signReviewedEvent(replayProvider(), { ...request, content: 'New reviewed text' }, options);
    assert.equal(changed.status, 'invalid-return');
    const bad = replayProvider(); bad.signEvent = async () => ({ ...note, sig: '0'.repeat(128) });
    assert.equal((await signReviewedEvent(bad, request, options)).status, 'invalid-return');
  });

  it('isolates reviewed input from provider mutation and requires the expected key', async () => {
    const provider = replayProvider();
    provider.signEvent = async event => { event.content = note.content; return copy(note); };
    assert.equal((await signReviewedEvent(provider, { ...request, content: 'Actual reviewed content' }, options)).status, 'invalid-return');
    let signCalls = 0;
    assert.equal((await signReviewedEvent({ getPublicKey: () => otherKey, signEvent: () => { signCalls++; } }, request, options)).status, 'wrong-identity');
    assert.equal(signCalls, 0);
  });

  it('handles declined and unresponsive providers without exposing their error text', async () => {
    const declined = { getPublicKey: () => { throw new Error('provider internal details'); }, signEvent() {} };
    assert.deepEqual(await signReviewedEvent(declined, request, options), { status: 'signer-declined-or-failed' });
    const unresponsive = { getPublicKey: () => new Promise(() => {}), signEvent() {} };
    assert.deepEqual(await signReviewedEvent(unresponsive, request, { ...options, timeoutMs: 5 }), { status: 'signer-timeout' });
  });

  it('does not open a new signing prompt when identity approval arrives after timeout', async () => {
    let resolveIdentity, signCalls = 0;
    const provider = {
      getPublicKey: () => new Promise(resolve => { resolveIdentity = resolve; }),
      signEvent: async () => { signCalls++; return copy(note); },
    };
    const result = await signReviewedEvent(provider, request, { ...options, timeoutMs: 5 });
    assert.equal(result.status, 'signer-timeout');
    resolveIdentity(key);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(signCalls, 0);
  });
});
