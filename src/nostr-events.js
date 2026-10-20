import { verifyEvent, getEventHash } from 'nostr-tools/pure';
import { decode, naddrEncode } from 'nostr-tools/nip19';

export const GALLERY_KIND = 37440; // Experimental and unreserved; not an accepted NIP.
export const EVENT_LIMIT = 512 * 1024;
export const MANIFEST_LIMIT = 256 * 1024;
const hex = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(message); };
const bytes = text => new TextEncoder().encode(text).length;
const text = (value, name, max = 1000) => typeof value === 'string' && value.length <= max ? value : fail(`${name} must be text of at most ${max} characters`);
const int = (value, min, max, name) => Number.isSafeInteger(value) && value >= min && value <= max ? value : fail(`Invalid ${name}`);
const sameSet = (a, b) => a.size === b.size && [...a].every(value => b.has(value));

export function publicKey(value) {
  if (typeof value !== 'string' || value.length > 100) fail('Expected a public key');
  if (hex.test(value)) return value;
  if (!value.startsWith('npub1')) fail('Expected lowercase hex or npub public key');
  const decoded = decode(value);
  if (decoded.type !== 'npub' || !hex.test(decoded.data)) fail('Invalid public key');
  return decoded.data;
}

export function relayUrl(value) {
  text(value, 'Relay URL', 2048);
  let url;
  try { url = new URL(value); } catch { fail('Invalid relay URL'); }
  if (url.protocol !== 'wss:' || url.username || url.password || url.hash || url.search) fail('Relays must be WSS URLs without credentials, query or fragment');
  return url.href;
}

export function httpsUrl(value) {
  text(value, 'Web URL', 4096);
  let url;
  try { url = new URL(value); } catch { fail('Invalid web URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || /[\u0000-\u0020\u007f]/.test(value)) fail('Web URLs must use HTTPS without credentials or whitespace');
  return url.href;
}

export function galleryCoordinate(value) {
  text(value, 'Gallery coordinate', 4096);
  let kind, pubkey, identifier, relays = [];
  if (value.startsWith('naddr1')) {
    const decoded = decode(value);
    if (decoded.type !== 'naddr') fail('Expected a gallery naddr');
    ({ kind, pubkey, identifier, relays = [] } = decoded.data);
  } else {
    const match = value.match(/^(\d+):([a-f0-9]{64}):(.*)$/s);
    if (!match) fail('Invalid gallery coordinate');
    kind = Number(match[1]); pubkey = match[2]; identifier = match[3];
  }
  if (kind !== GALLERY_KIND || !hex.test(pubkey) || !identifier || identifier.length > 128 || /[\u0000-\u001f\u007f]/.test(identifier)) fail('Expected experimental kind 37440 with a public key and nonempty identifier');
  if (!Array.isArray(relays) || relays.length > 8) fail('Too many relay hints');
  return { kind, pubkey, identifier, relays: [...new Set(relays.map(relayUrl))], coordinate: `${kind}:${pubkey}:${identifier}` };
}

export function encodeGalleryAddress(coordinate, relays = []) {
  const parsed = galleryCoordinate(coordinate);
  if (!Array.isArray(relays) || relays.length > 8) fail('Too many relay hints');
  return naddrEncode({ kind: parsed.kind, pubkey: parsed.pubkey, identifier: parsed.identifier, relays: [...new Set(relays.map(relayUrl))] });
}

export function eventEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Event must be an object');
  if (!hex.test(input.id) || !hex.test(input.pubkey) || typeof input.sig !== 'string' || !/^[a-f0-9]{128}$/.test(input.sig)) fail('Invalid event ID, public key or signature encoding');
  const template = unsignedEnvelope(input);
  const event = { ...template, id: input.id, pubkey: input.pubkey, sig: input.sig };
  if (bytes(JSON.stringify(event)) > EVENT_LIMIT) fail('Event exceeds 512 KiB');
  return event; // Deliberately drop unknown fields and cached verification symbols.
}

export function unsignedEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Unsigned event must be an object');
  int(input.kind, 0, 65535, 'event kind'); int(input.created_at, 0, Number.MAX_SAFE_INTEGER, 'event timestamp');
  text(input.content, 'Event content', EVENT_LIMIT);
  if (!Array.isArray(input.tags) || input.tags.length > 2000) fail('Too many event tags');
  const tags = input.tags.map(tag => {
    if (!Array.isArray(tag) || !tag.length || tag.length > 100) fail('Invalid event tag');
    return tag.map(value => text(value, 'Tag value', 8192));
  });
  const event = { kind: input.kind, created_at: input.created_at, tags, content: input.content };
  if (bytes(JSON.stringify(event)) > EVENT_LIMIT) fail('Event exceeds 512 KiB');
  return event;
}

export function inspectEvent(input, { expectedPubkey, expectedId, now = Math.floor(Date.now() / 1000), futureTolerance = 300 } = {}) {
  let event;
  try { event = eventEnvelope(input); } catch (error) { return { status: 'invalid', reason: error.message, signatureVerified: false }; }
  if (expectedPubkey != null && event.pubkey !== publicKey(expectedPubkey)) return { status: 'wrong-author', signatureVerified: false };
  if (expectedId != null && event.id !== expectedId) return { status: 'wrong-id', signatureVerified: false };
  // Always hash and verify a fresh envelope. A cached verifiedSymbol on an
  // imported object must never authorize a changed event.
  if (!verifyEvent(event)) return { status: 'invalid-signature', signatureVerified: false };
  int(now, 0, Number.MAX_SAFE_INTEGER, 'current time'); int(futureTolerance, 0, 3600, 'future tolerance');
  if (event.created_at > now + futureTolerance) return { status: 'future', signatureVerified: true, event };
  return { status: 'verified', signatureVerified: true, event };
}

// Pure ordering helper. Callers must verify signatures before selecting a record.
export function compareRevisions(a, b) { return b.created_at - a.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }

export function manifestContent(event) {
  const envelope = unsignedEnvelope(event);
  if (event.kind !== GALLERY_KIND || !hex.test(event.pubkey)) fail('Expected a gallery event with its author public key');
  if (bytes(envelope.content) > MANIFEST_LIMIT) fail('Manifest exceeds 256 KiB');
  const dTags = envelope.tags.filter(tag => tag[0] === 'd');
  if (dTags.length !== 1 || !dTags[0][1]) fail('Gallery requires exactly one nonempty d tag');
  const target = galleryCoordinate(`${GALLERY_KIND}:${event.pubkey}:${dTags[0][1]}`);
  const source = JSON.parse(envelope.content);
  if (source?.schema !== 'relaygate/manifest/1') fail('Unsupported gallery manifest schema');
  const title = text(source.title, 'Gallery title');
  if (!title.trim()) fail('Gallery title is required');
  if (source.layout?.algorithm !== 'walls-v1') fail('Unsupported layout algorithm');
  const layout = { algorithm: 'walls-v1', seed: text(source.layout.seed, 'Layout seed', 128) };
  if (!Array.isArray(source.works) || source.works.length > 500) fail('Manifest needs at most 500 works');
  if (!Array.isArray(source.gates) || source.gates.length > 32) fail('Manifest needs at most 32 gates');
  const ids = new Set(), expectedE = new Set(), expectedA = new Set(), expectedP = new Set();
  const works = source.works.map(work => {
    if (!work || typeof work.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(work.id) || ids.has(work.id)) fail('Missing, invalid or duplicate artwork ID');
    ids.add(work.id);
    if (!hex.test(work.eventId)) fail('Invalid picture event ID');
    expectedE.add(work.eventId); int(work.imageIndex, 0, 15, 'image index');
    let sizeIn = null;
    if (work.sizeIn != null) {
      if (![work.sizeIn.w, work.sizeIn.h].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 4000)) fail('Invalid physical dimensions');
      sizeIn = { w: work.sizeIn.w, h: work.sizeIn.h };
    }
    let listing = null;
    if (work.listing != null) {
      listing = text(work.listing, 'Listing coordinate', 256);
      if (!listing.startsWith(`30402:${event.pubkey}:`) || !listing.slice(71) || /[\u0000-\u001f\u007f]/.test(listing)) fail('Listing must belong to the gallery artist and have an identifier');
      expectedA.add(listing);
    }
    return { id: work.id, eventId: work.eventId, imageIndex: work.imageIndex, sizeIn, sizeSource: work.sizeSource == null ? null : text(work.sizeSource, 'Size source', 100), listing };
  });
  const gateTargets = new Set();
  const gates = source.gates.map(gate => {
    const destination = galleryCoordinate(gate?.target);
    if (gateTargets.has(destination.coordinate)) fail('Duplicate gate destination');
    gateTargets.add(destination.coordinate); expectedA.add(destination.coordinate); expectedP.add(destination.pubkey);
    if (!Array.isArray(gate.relays) || gate.relays.length > 8) fail('Invalid gate relay hints');
    return { target: destination.coordinate, label: text(gate.label, 'Gate label', 300), relays: [...new Set(gate.relays.map(relayUrl))] };
  });
  const tagged = name => new Set(envelope.tags.filter(tag => tag[0] === name).map(tag => tag[1]));
  if (!sameSet(expectedE, tagged('e')) || !sameSet(expectedA, tagged('a')) || !sameSet(expectedP, tagged('p'))) fail('Manifest references and e/a/p tags disagree');
  let location = null;
  const locationTags = envelope.tags.filter(tag => tag[0] === 'r' && tag[2] === 'gallery');
  if (source.webUrl != null) {
    const url = httpsUrl(source.webUrl);
    if (source.webUrl !== url || locationTags.length !== 1 || locationTags[0].length !== 3 || locationTags[0][1] !== url) fail('Gallery webUrl must match one exact r/gallery tag');
    location = { url }; // Schema parsing alone makes no signature assertion.
  } else if (locationTags.length) fail('Gallery location tag has no matching webUrl');
  let referral = { enabled: false, shareBasisPoints: 0, scope: 'zaps' };
  if (source.referral != null) {
    if (typeof source.referral.enabled !== 'boolean' || source.referral.scope !== 'zaps') fail('Invalid referral policy');
    int(source.referral.shareBasisPoints, 0, 10000, 'referral basis points');
    referral = { enabled: source.referral.enabled, shareBasisPoints: source.referral.shareBasisPoints, scope: 'zaps' };
  }
  return { schema: source.schema, coordinate: target.coordinate, title, layout, works, gates, referral, location };
}

export function buildGalleryDraft({ pubkey, identifier = 'main', createdAt, title, webUrl, works = [], gates = [], layout = { algorithm: 'walls-v1', seed: 'main' }, referral }) {
  const key = publicKey(pubkey), tags = [['d', identifier], ['title', title], ['t', 'relaygate']];
  for (const id of new Set(works.map(work => work.eventId))) tags.push(['e', id]);
  const a = new Set(works.filter(w => w.listing).map(w => w.listing)), p = new Set();
  for (const gate of gates) { const target = galleryCoordinate(gate.target); a.add(target.coordinate); p.add(target.pubkey); }
  for (const value of a) tags.push(['a', value]); for (const value of p) tags.push(['p', value]);
  const source = { schema: 'relaygate/manifest/1', title, layout, works, gates };
  if (referral != null) source.referral = referral;
  if (webUrl != null) { source.webUrl = httpsUrl(webUrl); tags.push(['r', source.webUrl, 'gallery']); }
  const event = { kind: GALLERY_KIND, created_at: createdAt, tags, content: JSON.stringify(source) };
  const parsed = manifestContent({ ...event, pubkey: key });
  const canonical = { schema: parsed.schema, title: parsed.title, layout: parsed.layout, works: parsed.works, gates: parsed.gates, referral: parsed.referral };
  if (parsed.location) canonical.webUrl = parsed.location.url;
  event.content = JSON.stringify(canonical); // Allowlist fields; do not publish private import annotations.
  manifestContent({ ...event, pubkey: key });
  return event; // unsigned: no id or signature fabricated
}

export function verifiesReviewedReturn(returned, reviewed, expectedPubkey) {
  const expected = unsignedEnvelope(reviewed), key = publicKey(expectedPubkey);
  const result = inspectEvent(returned, { expectedPubkey: key });
  if (result.status !== 'verified') fail('External signer returned an invalid event or unexpected author');
  const event = result.event;
  if (event.id !== getEventHash({ ...expected, pubkey: key })) fail('External signer changed the reviewed event');
  return event;
}
