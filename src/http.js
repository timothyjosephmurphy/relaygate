// Polite HTTP: identifying UA, global rate limit, robots.txt.
export const UA = 'RelayGateImporter/0.1 (+https://tjm.art/relaygate; artist-run site importer)';
const UA_TOKEN = 'relaygateimporter';

export class Client {
  constructor({ delayMs = 1000, timeoutMs = 60000, log = () => {} } = {}) {
    this.delayMs = delayMs; this.timeoutMs = timeoutMs; this.log = log;
    this.last = 0; this.robots = new Map(); this.queue = Promise.resolve();
  }
  async _slot() {
    const p = this.queue.then(async () => {
      const wait = this.last + this.delayMs - Date.now();
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      this.last = Date.now();
    });
    this.queue = p.catch(() => {});
    return p;
  }
  async raw(url, { skipRobots = false } = {}) {
    if (!skipRobots && !(await this.allowed(url))) { this.log(`robots.txt disallows ${url}`); return null; }
    await this._slot();
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow', signal: ctl.signal });
      if (res.status === 401 || res.status === 403) { this.log(`skip (auth/forbidden ${res.status}) ${url}`); return null; }
      if (!res.ok) { this.log(`HTTP ${res.status} ${url}`); return null; }
      return res;
    } catch (e) { this.log(`fetch failed ${url}: ${e.message}`); return null; }
    finally { clearTimeout(t); }
  }
  async text(url, o) { const r = await this.raw(url, o); return r ? { url: r.url, text: await r.text(), type: r.headers.get('content-type') || '' } : null; }
  async buffer(url, o) { const r = await this.raw(url, o); return r ? { url: r.url, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || '' } : null; }

  async robotsFor(origin) {
    if (!this.robots.has(origin)) {
      const r = await this.text(origin + '/robots.txt', { skipRobots: true });
      this.robots.set(origin, parseRobots(r ? r.text : ''));
    }
    return this.robots.get(origin);
  }
  async allowed(url) {
    const u = new URL(url);
    const rb = await this.robotsFor(u.origin);
    return rb.allows(u.pathname + u.search);
  }
}

export function parseRobots(txt) {
  const groups = []; let cur = null, lastWasUA = false; const sitemaps = [];
  for (let line of txt.split(/\r?\n/)) {
    line = line.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasUA = true; continue; }
    lastWasUA = false;
    if (k === 'sitemap') sitemaps.push(v);
    else if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v });
  }
  const mine = groups.filter(g => g.agents.some(a => a !== '*' && UA_TOKEN.includes(a)));
  const rules = (mine.length ? mine : groups.filter(g => g.agents.includes('*'))).flatMap(g => g.rules);
  const compiled = rules.filter(r => r.path).map(r => ({ ...r, re: new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, m => m === '$' ? m : '\\' + m).replace(/\*/g, '.*').replace(/\\\$$/, '$')), len: r.path.length }));
  return {
    sitemaps,
    allows(path) {
      let best = null;
      for (const r of compiled) if (r.re.test(path) && (!best || r.len > best.len || (r.len === best.len && r.allow))) best = r;
      return !best || best.allow;
    },
  };
}
