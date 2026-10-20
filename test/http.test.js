import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, parseRobots, httpUrl, UA } from '../src/http.js';
const response = (body = '', status = 200, headers = {}) => new Response(body, { status, headers });

test('URL validation strips fragments and rejects credentials and non-HTTP inputs', () => {
  assert.equal(httpUrl('/work#detail', 'https://ex.test'), 'https://ex.test/work');
  for (const x of [null, '', 'javascript:alert(1)', 'file:///tmp/a', 'https://name:password@ex.test']) assert.equal(httpUrl(x), null);
});
test('robots merges exact product groups and uses longest rule with allow on ties', () => {
  const r = parseRobots('User-agent: *\nDisallow: /\nUser-agent: RelayGateImporter\nDisallow: /private\nAllow: /private/open\nUser-agent: RELAYGATEIMPORTER\nDisallow: /*.jpg$\nAllow: /ok.jpg$\nDisallow: /same\nAllow: /same\nCrawl-delay: 2');
  assert.equal(r.allows('/public'), true); assert.equal(r.allows('/private/x'), false); assert.equal(r.allows('/private/open/x'), true);
  assert.equal(r.allows('/a.jpg'), false); assert.equal(r.allows('/a.jpg?size=2'), true); assert.equal(r.allows('/ok.jpg'), true); assert.equal(r.allows('/same'), true); assert.equal(r.delayMs, 2000);
});
test('robots handles encoded unreserved characters, Unicode, and literal punctuation', () => {
  const r = parseRobots('User-agent: *\nDisallow: /café\nDisallow: /a%62\nDisallow: /a+b?x=1\nDisallow: /slash%2F');
  assert.equal(r.allows('/caf%C3%A9'), false); assert.equal(r.allows('/ab'), false); assert.equal(r.allows('/a+b?x=1'), false); assert.equal(r.allows('/aaab'), true); assert.equal(r.allows('/slash/'), true);
});
test('concurrent requests share robots fetch and all starts obey rate spacing', async () => {
  let clock = 0; const starts = [], calls = [];
  const c = new Client({ delayMs: 100, now: () => clock, wait: async n => { clock += n; }, fetchImpl: async (url, options) => {
    calls.push(url); starts.push(clock); assert.equal(options.headers['user-agent'], UA);
    return response(url.endsWith('/robots.txt') ? 'User-agent: *\nCrawl-delay: 0.2' : 'ok');
  } });
  await Promise.all(['/a', '/b', '/c'].map(p => c.text('https://ex.test' + p)));
  assert.equal(calls.filter(u => u.endsWith('/robots.txt')).length, 1);
  assert.deepEqual(starts, [0, 200, 400, 600]);
});
test('robots failure is closed for 5xx/auth and open for missing file', async () => {
  for (const status of [404, 403, 401, 500, 429]) {
    const calls = [];
    const c = new Client({ delayMs: 0, retries: 0, fetchImpl: async url => { calls.push(url); return response('', url.endsWith('/robots.txt') ? status : 200); } });
    const r = await c.text('https://ex.test/art');
    assert.equal(!!r, status === 404); assert.equal(calls.length, status === 404 ? 2 : 1);
  }
});
test('redirect checks destination robots before following, including a new image origin', async () => {
  const calls = [];
  const c = new Client({ delayMs: 0, fetchImpl: async url => {
    calls.push(url);
    if (url === 'https://cdn.test/robots.txt') return response('User-agent: *\nDisallow: /private');
    if (url.endsWith('/robots.txt')) return response('');
    return response('', 302, { location: 'https://cdn.test/private.jpg' });
  } });
  assert.equal(await c.buffer('https://ex.test/image'), null);
  assert.deepEqual(calls, ['https://ex.test/robots.txt', 'https://ex.test/image', 'https://cdn.test/robots.txt']);
});
test('redirect loops and off-site page redirects stop', async () => {
  for (const target of ['https://ex.test/a', 'https://outside.test/a']) {
    const calls = [];
    const c = new Client({ delayMs: 0, fetchImpl: async url => { calls.push(url); return url.endsWith('/robots.txt') ? response('') : response('', 302, { location: target }); } });
    assert.equal(await c.text('https://ex.test/a', { allowedOrigin: 'https://ex.test' }), null); assert.equal(calls.length, 2);
  }
});
test('Retry-After delays a bounded retry and long cooldown defers the origin', async () => {
  let time = 0, n = 0; const waits = [];
  const c = new Client({ delayMs: 0, now: () => time, wait: async ms => { waits.push(ms); time += ms; }, fetchImpl: async url => url.endsWith('/robots.txt') ? response('') : ++n === 1 ? response('', 429, { 'retry-after': '2' }) : response('ok') });
  assert.equal((await c.text('https://ex.test/a')).text, 'ok'); assert.deepEqual(waits, [2000]);
  const slow = new Client({ delayMs: 0, wait: async () => { throw Error('must not wait'); }, fetchImpl: async url => url.endsWith('/robots.txt') ? response('') : response('', 503, { 'retry-after': '900' }) });
  assert.equal(await slow.text('https://ex.test/a'), null); assert.equal(await slow.text('https://ex.test/b'), null);
});
test('response size limit covers headers and streamed bodies', async () => {
  for (const headers of [{}, { 'content-length': '20' }]) {
    const c = new Client({ delayMs: 0, maxBytes: 8, fetchImpl: async url => url.endsWith('/robots.txt') ? response('') : response('01234567890123456789', 200, headers) });
    assert.equal(await c.text('https://ex.test/a'), null);
  }
});
test('timeout remains active while reading a stalled response body', async () => {
  const c = new Client({ delayMs: 0, timeoutMs: 20, fetchImpl: async (url, { signal }) => {
    if (url.endsWith('/robots.txt')) return response('');
    return new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError'))); } }));
  } });
  assert.equal(await c.text('https://ex.test/a'), null);
});
