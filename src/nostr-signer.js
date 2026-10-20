import { publicKey, unsignedEnvelope, verifiesReviewedReturn } from './nostr-events.js';

const kinds = new Set([1, 5, 20, 10002, 30023, 30402, 37440, 37441]);

// Pass window.nostr, a NIP-55 wrapper or an already connected external NIP-46
// bridge. Relay Gate never pairs, encrypts transport messages or owns credentials.
export function externalSigner(provider) {
  if (!provider || typeof provider.getPublicKey !== 'function' || typeof provider.signEvent !== 'function') return null;
  return { getPublicKey: () => provider.getPublicKey(), signEvent: event => provider.signEvent(event) };
}

export async function signReviewedEvent(provider, request, { expectedPubkey, approved = false, timeoutMs = 60000 } = {}) {
  if (approved !== true) return { status: 'review-required' }; // No signer calls on guest visits.
  const signer = externalSigner(provider);
  if (!signer) return { status: 'signer-unavailable' };
  const reviewed = unsignedEnvelope(request), expected = publicKey(expectedPubkey);
  if (!kinds.has(reviewed.kind)) throw new Error('This signer adapter does not support the requested event kind');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('Invalid signer timeout');
  let timer, expired = false;
  try {
    const run = async () => {
      const returnedKey = await signer.getPublicKey();
      // An identity prompt may resolve after our timeout. Do not initiate a new
      // signing prompt after the application has already abandoned this action.
      if (expired) return { status: 'signer-timeout' };
      if (publicKey(returnedKey) !== expected) return { status: 'wrong-identity' };
      const snapshot = structuredClone(reviewed);
      const returned = await signer.signEvent(snapshot);
      try { return { status: 'signed', event: verifiesReviewedReturn(returned, reviewed, expected), published: false }; }
      catch { return { status: 'invalid-return' }; }
    };
    return await Promise.race([run(), new Promise(resolve => { timer = setTimeout(() => { expired = true; resolve({ status: 'signer-timeout' }); }, timeoutMs); })]);
  } catch { return { status: 'signer-declined-or-failed' }; }
  finally { clearTimeout(timer); }
}
