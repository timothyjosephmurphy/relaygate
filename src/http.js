// Bounded, identifying, robots-aware GETs. Each redirect is a new checked request.
export const UA = 'RelayGateImporter/0.2 (+https://github.com/timothyjosephmurphy/relaygate; artist website importer)';
const TOKEN = 'relaygateimporter';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function httpUrl(value, base) {
  try {
    if (typeof value !== 'string' || !value.trim()) return null;
    const u = new URL(value, base);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}

function normalized(value) {
  return value.replace(/[^\x00-\x7f]/gu, c => encodeURIComponent(c)).replace(/%[0-9a-f]{2}/gi, s => {
    const c = String.fromCharCode(parseInt(s.slice(1), 16));
    return /[a-z0-9._~-]/i.test(c) ? c : s.toUpperCase();
  });
}

export function parseRobots(text) {
  const groups = [], sitemaps = [];
  let group, hasRules = false;
  for (const line of text.split(/\r\n|\n|\r/)) {
    const m = line.replace(/#.*/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === 'user-agent') {
      if (!group || hasRules) { group = { agents: [], rules: [], delayMs: 0 }; groups.push(group); }
      group.agents.push(value.toLowerCase()); hasRules = false;
    } else if (key === 'sitemap') sitemaps.push(value);
    else if (group && ['allow', 'disallow', 'crawl-delay'].includes(key)) {
      hasRules = true;
      if (key === 'crawl-delay') {
        if (/^\d+(\.\d+)?$/.test(value)) group.delayMs = Math.max(group.delayMs, Number(value) * 1000);
      } else if (value.startsWith('/')) group.rules.push({ allow: key === 'allow', path: normalized(value) });
    }
  }
  // RFC 9309 product-token matching: merge all exact case-insensitive groups.
  const mine = groups.filter(g => g.agents.includes(TOKEN));
  const selected = mine.length ? mine : groups.filter(g => g.agents.includes('*'));
  const rules = selected.flatMap(g => g.rules).map(r => {
    const end = r.path.endsWith('$');
    const body = end ? r.path.slice(0, -1) : r.path;
    const pattern = body.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return { allow: r.allow, length: Buffer.byteLength(body.replace(/\*/g, '').replace(/%[0-9A-F]{2}/g, 'x')), re: new RegExp('^' + pattern + (end ? '$' : '')) };
  });
  return {
    sitemaps: [...new Set(sitemaps)], delayMs: Math.max(0, ...selected.map(g => g.delayMs)),
    allows(path) {
      let best;
      for (const r of rules) if (r.re.test(normalized(path)) && (!best || r.length > best.length || (r.length === best.length && r.allow))) best = r;
      return !best || best.allow;
    },
  };
}

export class Client {
  constructor({ delayMs = 1000, timeoutMs = 20000, maxBytes = 5 * 1024 * 1024, retries = 1, fetchImpl = fetch, log = () => {}, now = Date.now, wait = sleep } = {}) {
    for (const [key, value] of Object.entries({ delayMs, timeoutMs, maxBytes, retries })) {
      if (!Number.isFinite(value) || value < 0 || (key !== 'delayMs' && !Number.isInteger(value))) throw new Error(`Invalid ${key}`);
    }
    if (!timeoutMs || !maxBytes || retries > 3) throw new Error('Invalid request limits');
    Object.assign(this, { delayMs, timeoutMs, maxBytes, retries, fetchImpl, log, now, wait });
    this.stoppedOrigins = new Set(); this.last = -Infinity; this.origins = new Map(); this.cooldown = new Map(); this.robots = new Map(); this.queue = Promise.resolve();
  }
  async _slot(origin, crawlDelay, send) {
    const turn = this.queue.then(async () => {
      while (true) {
        if (this.stoppedOrigins.has(origin)) throw new Error('Origin deferred after Retry-After');
        const due = Math.max(this.last + this.delayMs, (this.origins.get(origin) ?? -Infinity) + crawlDelay, this.cooldown.get(origin) || 0);
        if (due <= this.now()) break;
        await this.wait(due - this.now());
      }
      this.last = this.now(); this.origins.set(origin, this.last);
      return { response: send() };
    });
    this.queue = turn.catch(() => {});
    return turn;
  }
  async _get(value, { skipRobots = false, maxBytes = this.maxBytes, accept = '*/*', allowedOrigin } = {}) {
    let url = httpUrl(value);
    if (!url) { this.log('Skipped invalid or credential-bearing HTTP URL'); return null; }
    const seen = new Set();
    for (let redirects = 0; redirects <= 5; redirects++) {
      const u = new URL(url);
      if (this.stoppedOrigins.has(u.origin)) { this.log(`Origin deferred after Retry-After: ${u.origin}`); return null; }
      if (allowedOrigin && u.origin !== allowedOrigin) { this.log(`Skipped off-site redirect: ${url}`); return null; }
      if (seen.has(url)) { this.log(`Redirect cycle: ${url}`); return null; }
      seen.add(url);
      const robots = skipRobots ? null : await this.robotsFor(u.origin);
      if (robots && !robots.allows(u.pathname + u.search)) { this.log(`robots.txt disallows ${url}`); return null; }
      if (robots?.delayMs > 60000) { this.log(`Crawl-delay exceeds this import's 60-second wait limit: ${url}`); return null; }
      let redirected = false;
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        const ctl = new AbortController();
        let timer;
        try {
          const request = await this._slot(u.origin, robots?.delayMs || 0, () => {
            timer = setTimeout(() => ctl.abort(), this.timeoutMs);
            return this.fetchImpl(url, { headers: { 'user-agent': UA, accept }, redirect: 'manual', signal: ctl.signal });
          });
          const res = await request.response;
          if ([301, 302, 303, 307, 308].includes(res.status)) {
            const next = httpUrl(res.headers.get('location'), url);
            await res.body?.cancel();
            if (!next) throw new Error('Invalid redirect');
            url = next; redirected = true; break;
          }
          if ([429, 503].includes(res.status)) {
            const raw = res.headers.get('retry-after');
            const delay = raw === null ? 1000 * 2 ** attempt : /^\d+$/.test(raw) ? Number(raw) * 1000 : Math.max(0, Date.parse(raw) - this.now());
            const backoff = Number.isFinite(delay) ? delay : 1000;
            this.cooldown.set(u.origin, this.now() + backoff);
            await res.body?.cancel();
            if (backoff > 60000) { this.stoppedOrigins.add(u.origin); this.log(`Retry-After exceeds wait limit: ${url}`); return { url, status: res.status, type: '', buf: Buffer.alloc(0) }; }
            if (attempt < this.retries) continue;
          }
          if (!res.ok) { await res.body?.cancel(); return { url, status: res.status, type: '', buf: Buffer.alloc(0) }; }
          if (Number(res.headers.get('content-length')) > maxBytes) throw new Error('Response exceeds byte limit');
          const reader = res.body?.getReader(), chunks = []; let length = 0;
          if (reader) {
            try {
              while (true) {
                const { done, value: chunk } = await reader.read();
                if (done) break;
                length += chunk.byteLength;
                if (length > maxBytes) throw new Error('Response exceeds byte limit');
                chunks.push(Buffer.from(chunk));
              }
            } catch (e) { await reader.cancel().catch(() => {}); throw e; }
          }
          return { url, status: res.status, type: res.headers.get('content-type') || '', buf: Buffer.concat(chunks) };
        } catch (e) {
          ctl.abort();
          this.log(`Request failed: ${url} (${e.name === 'AbortError' ? 'timeout' : e.message})`);
          return null;
        } finally { clearTimeout(timer); }
      }
      if (!redirected) return null;
    }
    this.log(`Too many redirects: ${url}`); return null;
  }
  async buffer(url, options) {
    const result = await this._get(url, options);
    if (result && result.status >= 200 && result.status < 300) return result;
    if (result) this.log(`HTTP ${result.status}: ${result.url}`);
    return null;
  }
  async text(url, options) {
    const result = await this.buffer(url, options);
    return result ? { ...result, text: result.buf.toString('utf8') } : null;
  }
  robotsFor(origin) {
    if (!this.robots.has(origin)) this.robots.set(origin, (async () => {
      const r = await this._get(origin + '/robots.txt', { skipRobots: true, maxBytes: 512 * 1024 });
      if (r?.status >= 200 && r.status < 300) return parseRobots(r.buf.toString('utf8'));
      if (r?.status >= 400 && r.status < 500 && ![401, 403, 429].includes(r.status)) return parseRobots('');
      this.log(`robots.txt unavailable; skipping origin ${origin}`);
      return parseRobots('User-agent: *\nDisallow: /');
    })());
    return this.robots.get(origin);
  }
  async allowed(value) {
    const url = httpUrl(value);
    if (!url) return false;
    const u = new URL(url);
    return (await this.robotsFor(u.origin)).allows(u.pathname + u.search);
  }
}
