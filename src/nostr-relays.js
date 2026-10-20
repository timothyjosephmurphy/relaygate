import { EVENT_LIMIT, GALLERY_KIND, compareRevisions, galleryCoordinate, inspectEvent, manifestContent, relayUrl, publicKey, httpsUrl } from './nostr-events.js';

export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const utf8 = value => new TextEncoder().encode(value).length;
const READ_LIMIT = 16 * 1024 * 1024;

// Browser-compatible transport; constructing it does not connect anywhere.
// No EVENT/publish or AUTH signing path is implemented.
export function websocketQuery(WebSocketType = globalThis.WebSocket) {
  if (typeof WebSocketType !== 'function') throw new Error('A WebSocket implementation is required');
  let counter = 0;
  return (url, filters, { signal, maxEvents = 600, maxMessages = 1200, timeoutMs = 8000 } = {}) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Relay read aborted')); return; }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || !Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 1000 || !Number.isSafeInteger(maxMessages) || maxMessages < 1 || maxMessages > 2000) { reject(new Error('Invalid transport limits')); return; }
    const socket = new WebSocketType(relayUrl(url)), subscription = `relaygate-${++counter}`;
    const events = []; let messages = 0, receivedBytes = 0, finished = false, opened = false, timer;
    function finish(complete, reason) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      socket.removeEventListener('open', onOpen); socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose); socket.removeEventListener('error', onError);
      try { if (opened && socket.readyState === 1) socket.send(JSON.stringify(['CLOSE', subscription])); } catch {}
      try { socket.close(); } catch {}
      resolve({ events, complete, reason });
    }
    const abort = () => finish(false, 'aborted');
    const onOpen = () => { opened = true; try { socket.send(JSON.stringify(['REQ', subscription, ...filters])); } catch { finish(false, 'send-failed'); } };
    const onClose = () => finish(false, 'closed-before-eose');
    const onError = () => finish(false, 'connection-failed');
    const onMessage = message => {
      const size = typeof message.data === 'string' ? utf8(message.data) : Infinity;
      receivedBytes += size;
      if (++messages > maxMessages || size > EVENT_LIMIT + 1024 || receivedBytes > READ_LIMIT) { finish(false, 'message-limit'); return; }
      let frame; try { frame = JSON.parse(message.data); } catch { finish(false, 'invalid-json'); return; }
      if (!Array.isArray(frame)) { finish(false, 'invalid-frame'); return; }
      if (frame[0] === 'AUTH') { finish(false, 'authentication-required'); return; }
      if (frame[1] !== subscription) return;
      if (frame[0] === 'EVENT') {
        if (events.length >= maxEvents) { finish(false, 'event-limit'); return; }
        events.push(frame[2]);
      } else if (frame[0] === 'EOSE') finish(true, 'eose');
      else if (frame[0] === 'CLOSED') finish(false, 'relay-refused');
    };
    signal?.addEventListener('abort', abort, { once: true });
    socket.addEventListener('open', onOpen); socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose); socket.addEventListener('error', onError);
    timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);
    if (signal?.aborted) abort();
  });
}

function matches(event, filter) {
  for (const [key, values] of Object.entries(filter)) {
    if (key === 'limit') continue;
    if (key === 'since' && event.created_at < values || key === 'until' && event.created_at > values) return false;
    if (['authors', 'ids', 'kinds'].includes(key) && !values.includes(event[{ authors: 'pubkey', ids: 'id', kinds: 'kind' }[key]])) return false;
    if (key.startsWith('#') && !event.tags.some(tag => tag[0] === key.slice(1) && values.includes(tag[1]))) return false;
  }
  return true;
}

export async function queryVerifiedEvents(relays, filters, { query, timeoutMs = 8000, now = Math.floor(Date.now() / 1000), maxEvents = 600, concurrency = 4 } = {}) {
  if (typeof query !== 'function') throw new Error('Pass an explicit relay query transport');
  if (!Array.isArray(relays) || relays.length > 8) throw new Error('Use at most eight relays');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('Invalid relay timeout');
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Relay concurrency must be between one and four');
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 1000) throw new Error('Invalid event limit');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid current time');
  if (!Array.isArray(filters) || !filters.length || filters.length > 8) throw new Error('Use one to eight filters');
  for (const filter of filters) {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) throw new Error('Invalid filter');
    for (const [key, value] of Object.entries(filter)) {
      if (['since', 'until', 'limit'].includes(key)) {
        if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid filter limit or timestamp');
      } else if (['authors', 'ids', 'kinds'].includes(key) || /^#[A-Za-z]$/.test(key)) {
        if (!Array.isArray(value) || !value.length || value.length > 1000 || value.some(item => key === 'kinds' ? !Number.isSafeInteger(item) || item < 0 || item > 65535 : typeof item !== 'string' || item.length > 8192)) throw new Error('Invalid filter values');
        if (['authors', 'ids', '#e', '#p'].includes(key) && value.some(item => !/^[a-f0-9]{64}$/.test(item))) throw new Error('Filter IDs and public keys require exact lowercase hex');
      } else throw new Error('Unsupported filter field');
    }
  }
  const urls = [...new Set(relays.map(relayUrl))], observations = new Array(urls.length), accepted = new Map();
  let cursor = 0, acceptedBytes = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++, url = urls[index], controller = new AbortController(); let timer;
      try {
        const response = await Promise.race([
          Promise.resolve().then(() => query(url, structuredClone(filters), { signal: controller.signal, maxEvents, maxMessages: maxEvents * 2, timeoutMs })),
          new Promise(resolve => { timer = setTimeout(() => { resolve({ events: [], complete: false, reason: 'timeout' }); controller.abort(); }, timeoutMs); }),
        ]);
        if (!response || !Array.isArray(response.events) || response.events.length > maxEvents) throw new Error('Invalid relay result');
        let rejected = 0, future = 0, matching = 0, limited = false, responseBytes = 0;
        for (const value of response.events) {
          responseBytes += utf8(JSON.stringify(value));
          if (responseBytes > READ_LIMIT) { limited = true; break; }
          const result = inspectEvent(value, { now });
          if (result.status === 'future') { future++; continue; }
          if (result.status !== 'verified' || !filters.some(filter => matches(result.event, filter))) { rejected++; continue; }
          const event = result.event; matching++;
          const previous = accepted.get(event.id);
          if (previous) previous.relays.add(url);
          else {
            const size = utf8(JSON.stringify(event));
            if (acceptedBytes + size > READ_LIMIT) { limited = true; break; }
            acceptedBytes += size;
            accepted.set(event.id, { event, relays: new Set([url]) });
          }
        }
        observations[index] = { relay: url, complete: !limited && response.complete === true, reason: limited ? 'byte-limit' : typeof response.reason === 'string' ? response.reason.slice(0, 80) : 'unknown', verifiedEvents: matching, rejectedEvents: rejected, futureEvents: future };
      } catch { observations[index] = { relay: url, complete: false, reason: 'read-failed', verifiedEvents: 0, rejectedEvents: 0, futureEvents: 0 }; }
      finally { clearTimeout(timer); controller.abort(); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return { events: [...accepted.values()].map(value => ({ event: value.event, relays: [...value.relays] })), observations };
}

// Pure decision helper: callers supply already verified public events.
export function deletionApplies(event, deletion) {
  if (deletion.kind !== 5 || event.kind === 5 || deletion.pubkey !== event.pubkey) return false;
  if (deletion.tags.some(tag => tag[0] === 'e' && tag[1] === event.id)) return true;
  const d = event.tags.find(tag => tag[0] === 'd')?.[1];
  return event.kind >= 30000 && event.kind < 40000 && d != null && deletion.created_at >= event.created_at && deletion.tags.some(tag => tag[0] === 'a' && tag[1] === `${event.kind}:${event.pubkey}:${d}`);
}

// Pure selection policy for already verified events. Preserve malformed
// duplicate-d candidates so schema rejection cannot resurrect an older record.
export function selectGalleryRevisions(events, address) {
  const target = galleryCoordinate(address);
  return [...new Map(events.filter(event => event.kind === GALLERY_KIND && event.pubkey === target.pubkey && event.tags.some(tag => tag[0] === 'd' && tag[1] === target.identifier)).map(event => [event.id, event])).values()].sort(compareRevisions);
}

// The current result depends on deletion of this exact revision or its
// coordinate. Older revision IDs do not expand the outbound request.
export function galleryDeletionFilters(selectedId, address) {
  if (typeof selectedId !== 'string' || !/^[a-f0-9]{64}$/.test(selectedId)) throw new Error('Expected an exact selected event ID');
  const target = galleryCoordinate(address);
  return [{ kinds: [5], authors: [target.pubkey], '#a': [target.coordinate], limit: 128 }, { kinds: [5], authors: [target.pubkey], '#e': [selectedId], limit: 128 }];
}

export async function resolveGallery(address, { relays = DEFAULT_RELAYS, query, cachedEvents = [], now = Math.floor(Date.now() / 1000), timeoutMs = 8000, staleAfterSeconds = 86400 } = {}) {
  const target = galleryCoordinate(address);
  if (!Array.isArray(cachedEvents) || cachedEvents.length > 1000) throw new Error('Too many cached events');
  let cachedBytes = 0;
  for (const event of cachedEvents) {
    cachedBytes += utf8(JSON.stringify(event));
    if (cachedBytes > READ_LIMIT) throw new Error('Cached events exceed 16 MiB');
  }
  if (!Number.isSafeInteger(staleAfterSeconds) || staleAfterSeconds < 0) throw new Error('Invalid stale interval');
  if (!Array.isArray(relays) || relays.length > 8) throw new Error('Use at most eight relays');
  // Explicit visitor choices/default fallbacks retain slots even when an
  // untrusted address supplies the maximum number of hints.
  const initial = [...new Set([...relays.map(relayUrl), ...target.relays])].slice(0, 8);
  const options = { query, timeoutMs, now }, cache = cachedEvents.map(e => inspectEvent(e, { expectedPubkey: target.pubkey, now })).filter(r => r.status === 'verified').map(r => r.event);
  const relayLists = await queryVerifiedEvents(initial, [{ kinds: [10002], authors: [target.pubkey], limit: 8 }], options);
  const latestList = [...relayLists.events.map(r => r.event), ...cache.filter(e => e.kind === 10002)].sort(compareRevisions)[0];
  const writeRelays = [];
  for (const tag of latestList?.tags || []) if (tag[0] === 'r' && (!tag[2] || tag[2] === 'write')) { try { writeRelays.push(relayUrl(tag[1])); } catch {} }
  const selectedRelays = [...new Set([...writeRelays.slice(0, 4), ...initial])].slice(0, 8);
  const manifests = await queryVerifiedEvents(selectedRelays, [{ kinds: [GALLERY_KIND], authors: [target.pubkey], '#d': [target.identifier], limit: 32 }], options);
  const revisions = selectGalleryRevisions([...cache, ...manifests.events.map(r => r.event)], target.coordinate);
  const base = { pubkey: target.pubkey, coordinate: target.coordinate, checkedAt: now, signatureStatus: 'not-observed', identityMeaning: 'control of the expected public key; not legal identity', latestStatus: 'latest-observed-only', location: null, relays: selectedRelays, observations: [...relayLists.observations, ...manifests.observations] };
  if (!revisions.length) return { ...base, status: 'unavailable', availability: manifests.observations.some(o => o.complete) ? 'not-found-on-queried-relays' : 'offline-or-incomplete', freshness: 'unknown', deletionStatus: 'unknown' };
  const selected = revisions[0];
  const deleteFilters = galleryDeletionFilters(selected.id, target.coordinate);
  const deletionRead = await queryVerifiedEvents(selectedRelays, deleteFilters, { ...options, maxEvents: 256 });
  const deletions = [...cache.filter(e => e.kind === 5), ...deletionRead.events.map(r => r.event)];
  const observations = [...base.observations, ...deletionRead.observations], complete = manifests.observations.every(o => o.complete) && deletionRead.observations.every(o => o.complete);
  const online = manifests.events.some(r => r.event.id === selected.id);
  const statusBase = { ...base, eventId: selected.id, event: selected, signatureStatus: 'verified', signatureVerified: true, observations, freshness: now - selected.created_at > staleAfterSeconds ? 'stale-event' : 'recent-event', availability: online ? complete ? 'online' : 'partial' : 'cached', revisionIds: revisions.map(e => e.id), sameTimestampConflict: revisions.some(e => e.id !== selected.id && e.created_at === selected.created_at), deletionStatus: deletionRead.observations.length && deletionRead.observations.every(o => o.complete) ? 'not-observed-on-queried-relays' : 'unknown' };
  const deletion = deletions.find(e => deletionApplies(selected, e));
  if (deletion) return { ...statusBase, status: 'withdrawn', deletionStatus: 'requested', deletionEventId: deletion.id };
  let manifest;
  try { manifest = manifestContent(selected); } catch (error) { return { ...statusBase, status: 'unsupported-or-invalid-manifest', schemaError: error.message }; }
  const location = manifest.location ? { ...manifest.location, assertion: 'artist-signed', reachability: 'not-checked' } : null;
  return { ...statusBase, status: 'verified', manifest, location };
}

export async function resolveGalleryWorks(resolution, { query, now = Math.floor(Date.now() / 1000), timeoutMs = 8000 } = {}) {
  if (resolution?.status !== 'verified') throw new Error('Resolve a verified gallery before requesting its works');
  // Recheck the event instead of trusting a serializable status flag supplied by a caller.
  const checked = inspectEvent(resolution.event, { expectedPubkey: publicKey(resolution.pubkey), expectedId: resolution.eventId, now });
  if (checked.status !== 'verified') throw new Error('Gallery event is no longer valid');
  const manifest = manifestContent(checked.event), ids = [...new Set(manifest.works.map(work => work.eventId))];
  const records = new Map(), observations = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = await queryVerifiedEvents(resolution.relays, [{ ids: ids.slice(offset, offset + 100), kinds: [20], authors: [checked.event.pubkey], limit: 100 }], { query, now, timeoutMs, maxEvents: 120 });
    for (const { event } of result.events) records.set(event.id, event);
    observations.push(...result.observations);
  }
  const works = manifest.works.map(work => {
    const event = records.get(work.eventId);
    if (!event) return { ...work, status: 'picture-unavailable', title: work.id, image: null, description: null };
    const imeta = event.tags.filter(tag => tag[0] === 'imeta')[work.imageIndex];
    if (!imeta) return { ...work, status: 'image-index-unavailable', title: work.id, image: null, description: event.content };
    const fields = new Map(imeta.slice(1).map(value => { const index = value.indexOf(' '); return [value.slice(0, index), value.slice(index + 1)]; }));
    let image;
    try { image = httpsUrl(fields.get('url')); } catch { return { ...work, status: 'image-url-rejected', title: work.id, image: null, description: event.content }; }
    if (fields.has('m') && !['image/apng', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(fields.get('m'))) return { ...work, status: 'image-type-rejected', title: work.id, image: null, description: event.content };
    return { ...work, status: 'verified-picture-reference', title: event.tags.find(tag => tag[0] === 'title')?.[1] || work.id, image, description: event.content, alt: fields.get('alt') || null, sha256: /^[a-f0-9]{64}$/.test(fields.get('x')) ? fields.get('x') : null, mediaVerification: 'not-fetched', event };
  });
  return { works, observations, mediaFetched: false, listingResolution: 'not-implemented' };
}
