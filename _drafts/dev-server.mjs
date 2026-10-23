// Local dev rig (not deployed). Serves the site and runs the real /api handlers on top of an in-memory
// Redis, a fake Claude and a fake email service, so chats can be tested end to end without touching live data.
//   node _drafts/dev-server.mjs            -> http://localhost:8780
//   Admin password for the rig: test-admin-pass
//   GET /__dev/emails           emails the handlers tried to send
//   GET /__dev/advance?days=31  move the fake clock forward (to test the 30-day expiry)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8780;
process.env.ADMIN_PASSWORD = 'test-admin-pass';
process.env.ANTHROPIC_API_KEY = 'test';
process.env.RESEND_API_KEY = 're_test';
process.env.UPSTASH_REDIS_REST_URL = 'http://fake-redis.local';
process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';

// ---------- fake clock ----------
let skewMs = 0;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + skewMs); }
  static now() { return RealDate.now() + skewMs; }
};

// ---------- in-memory Redis (only the commands the handlers use) ----------
const db = new Map(); // key -> { type, v, exp }
const now = () => RealDate.now() + skewMs;
function live(k) { const e = db.get(k); if (!e) return null; if (e.exp && e.exp <= now()) { db.delete(k); return null; } return e; }
function ensure(k, type) { let e = live(k); if (!e) { e = { type, v: type === 'zset' ? new Map() : type === 'set' ? new Set() : type === 'hash' ? new Map() : null, exp: 0 }; db.set(k, e); } return e; }
const num = (x) => (x === '-inf' ? -Infinity : x === '+inf' ? Infinity : Number(x));
const cmds = {
  GET: (k) => { const e = live(k); return e ? e.v : null; },
  SET: (k, v, ...o) => {
    const prev = live(k); let exp = 0;
    const i = o.indexOf('EX'); if (i >= 0) exp = now() + Number(o[i + 1]) * 1000;
    else if (o.includes('KEEPTTL')) exp = prev ? prev.exp : 0;
    db.set(k, { type: 'string', v: String(v), exp }); return 'OK';
  },
  DEL: (...ks) => ks.filter((k) => db.delete(k)).length,
  EXISTS: (k) => (live(k) ? 1 : 0),
  TTL: (k) => { const e = live(k); return !e ? -2 : !e.exp ? -1 : Math.round((e.exp - now()) / 1000); },
  EXPIRE: (k, s) => { const e = live(k); if (!e) return 0; e.exp = now() + Number(s) * 1000; return 1; },
  INCR: (k) => { const e = ensure(k, 'string'); e.v = String((Number(e.v) || 0) + 1); return Number(e.v); },
  ZADD: (k, sc, m) => { const z = ensure(k, 'zset').v; const had = z.has(m); z.set(m, Number(sc)); return had ? 0 : 1; },
  ZREM: (k, m) => { const e = live(k); return e && e.v.delete(m) ? 1 : 0; },
  ZRANGEBYSCORE: (k, a, b) => { const e = live(k); if (!e) return []; return [...e.v].filter(([, s]) => s >= num(a) && s <= num(b)).sort((x, y) => x[1] - y[1]).map(([m]) => m); },
  ZREVRANGE: (k, a, b) => { const e = live(k); if (!e) return []; const arr = [...e.v].sort((x, y) => y[1] - x[1]).map(([m]) => m); return arr.slice(Number(a), Number(b) < 0 ? undefined : Number(b) + 1); },
  ZREMRANGEBYSCORE: (k, a, b) => { const e = live(k); if (!e) return 0; let n = 0; for (const [m, s] of [...e.v]) if (s >= num(a) && s <= num(b)) { e.v.delete(m); n++; } return n; },
  SADD: (k, m) => { const s = ensure(k, 'set').v; const had = s.has(m); s.add(m); return had ? 0 : 1; },
  SREM: (k, m) => { const e = live(k); return e && e.v.delete(m) ? 1 : 0; },
  SMEMBERS: (k) => { const e = live(k); return e ? [...e.v] : []; },
  SCARD: (k) => { const e = live(k); return e ? e.v.size : 0; },
  HGETALL: (k) => { const e = live(k); return e ? [...e.v].flat() : []; },
  HGET: (k, f) => { const e = live(k); return e && e.v.has(f) ? e.v.get(f) : null; },
  HSET: (k, ...kv) => { const h = ensure(k, 'hash').v; for (let i = 0; i < kv.length; i += 2) h.set(kv[i], String(kv[i + 1])); return kv.length / 2; },
  HSETNX: (k, f, v) => { const h = ensure(k, 'hash').v; if (h.has(f)) return 0; h.set(f, String(v)); return 1; },
  HDEL: (k, f) => { const e = live(k); return e && e.v.delete(f) ? 1 : 0; },
  LRANGE: () => [],
  LPUSH: () => 1, LTRIM: () => 'OK'
};
const emails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.startsWith('http://fake-redis.local/pipeline')) {
    const list = JSON.parse(opts.body);
    return json(list.map(([c, ...a]) => { try { if (!cmds[c]) throw new Error('unsupported ' + c); return { result: cmds[c](...a) }; } catch (e) { return { error: e.message }; } }));
  }
  if (u.startsWith('https://api.anthropic.com')) {
    const body = JSON.parse(opts.body); const q = body.messages[body.messages.length - 1].content;
    const text = /refund|lawyer|not sure/i.test(q) ? "I'm not certain about that one. [ESCALATE]" : `Test answer to: ${q.slice(0, 60)}`;
    return json({ content: [{ text }] });
  }
  if (u.startsWith('https://api.resend.com')) { emails.push(JSON.parse(opts.body)); return json({ id: 'x' }); }
  return realFetch(url, opts);
};

// ---------- tiny Vercel-style req/res ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__dev/emails') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(emails)); }
  if (url.pathname === '/__dev/advance') { skewMs += Number(url.searchParams.get('days') || 0) * 86400000; return res.end('ok ' + skewMs); }
  if (url.pathname === '/__dev/redis') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify([...db].filter(([k]) => live(k)).map(([k, e]) => [k, e.type, e.exp ? Math.round((e.exp - now()) / 1000) : -1]))); }
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/\/$/, '');
    const file = path.join(ROOT, 'api', name + '.js');
    if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('{"error":"no such endpoint"}'); }
    let raw = ''; for await (const c of req) raw += c;
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    res.send = (s) => { res.end(s); return res; };
    try { const mod = await import(pathToFileURL(file).href + '?t=' + RealDate.now()); await mod.default(req, res); }
    catch (e) { console.error('handler error', name, e); res.statusCode = 500; res.end('{"error":"handler crashed"}'); }
    return;
  }
  let p = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(p).pipe(res);
});
server.listen(PORT, () => console.log('dev rig on http://localhost:' + PORT));
