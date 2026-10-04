import { randomUUID } from 'node:crypto';
import { isLoggedIn, noStore } from './_adminAuth.js';
import { redis } from './_redis.js';
import { K, LISTS, SUPPORT_STATUSES, PRODUCT_IDS, PRODUCT_STATUSES, rows, str, isEmail, cleanLink, richToHtml, richToText, emailHtml, unsubUrl } from './_store.js';

// ADMIN endpoint for every dashboard tab. Requires the admin login cookie.
//   GET  ?r=support|announcement|products|posts|promos|broadcast|badge
//   POST { r, action, ... }
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const byDateDesc = (a, b) => String(b.date || b.created || '').localeCompare(String(a.date || a.created || ''));
const today = () => new Date().toISOString().slice(0, 10);
const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
const FROM = () => process.env.RESEND_FROM || 'Debt Free Empire <hello@debtfreeempire.com>';
const TEST_TO = 'hello@debtfreeempire.com';

async function getHash(key) { const [flat] = await redis([['HGETALL', key]]); return flat || []; }

// ---------- GET ----------
const readers = {
  async support() { const m = rows(await getHash(K.support)).sort(byDateDesc); return { messages: m, unread: m.filter((x) => x.status === 'unread').length }; },
  async badge() {
    const [flat, h] = await redis([['HGETALL', K.support], ['HGET', 'health:last', 'count']]);
    return { unread: rows(flat).filter((x) => x.status === 'unread').length, healthFails: Number(h) || 0 };
  },
  async announcement() {
    const flat = await getHash(K.announcement); const a = {};
    for (let i = 0; i + 1 < flat.length; i += 2) a[flat[i]] = flat[i + 1];
    return { config: { enabled: a.enabled === '1', message: a.message || '', link: a.link || '', linkText: a.linkText || '', color: a.color || '#FAF3E3' } };
  },
  async products() {
    const flat = await getHash(K.products); const products = {};
    for (let i = 0; i + 1 < flat.length; i += 2) { try { products[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) { /* skip */ } }
    return { products };
  },
  async posts() { return { posts: rows(await getHash(K.posts)).sort(byDateDesc) }; },
  async promos() { return { promos: rows(await getHash(K.promos)).sort(byDateDesc) }; },
  async broadcast() {
    const [a, b, log] = await redis([['SCARD', LISTS['eld-ios']], ['SCARD', LISTS.newsletter], ['LRANGE', K.broadcasts, 0, 49]]);
    return { configured: Boolean(process.env.RESEND_API_KEY), counts: { 'eld-ios': a, newsletter: b }, testTo: TEST_TO, log: (log || []).map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean) };
  }
};

// ---------- POST ----------
const writers = {
  async support({ action, id, status }) {
    if (typeof id !== 'string' || !id || id.length > 64) return ['Unknown message.'];
    if (action === 'delete') { await redis([['HDEL', K.support, id]]); return [null, {}]; }
    if (action === 'status') {
      if (!SUPPORT_STATUSES.includes(status)) return ['Unknown status.'];
      const [raw] = await redis([['HGET', K.support, id]]);
      if (!raw) return ['That message no longer exists.', null, 404];
      const m = JSON.parse(raw); m.status = status;
      await redis([['HSET', K.support, id, JSON.stringify(m)]]);
      return [null, {}];
    }
    return ['Unknown action.'];
  },

  async announcement(b) {
    const message = str(b.message, 200), linkText = str(b.linkText, 40), color = str(b.color, 7);
    const link = cleanLink(b.link);
    if (link === null) return ['The link must start with https:// (or / for a page on this site).'];
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return ['Pick a valid color.'];
    if (b.enabled && !message) return ['Type a message before turning the bar on.'];
    await redis([['HSET', K.announcement, 'enabled', b.enabled ? '1' : '0', 'message', message, 'link', link, 'linkText', linkText, 'color', color]]);
    return [null, {}];
  },

  async products(b) {
    if (!PRODUCT_IDS.includes(b.id)) return ['Unknown product.'];
    if (!PRODUCT_STATUSES.includes(b.status)) return ['Unknown status.'];
    const rec = { status: b.status, price: str(b.price, 30), cta: str(b.cta, 40), featured: Boolean(b.featured), isNew: Boolean(b.isNew) };
    await redis([['HSET', K.products, b.id, JSON.stringify(rec)]]);
    return [null, { product: rec }];
  },
  async 'products-reset'(b) {
    if (!PRODUCT_IDS.includes(b.id)) return ['Unknown product.'];
    await redis([['HDEL', K.products, b.id]]);
    return [null, {}];
  },

  async posts(b) {
    if (b.action === 'delete') { if (typeof b.id !== 'string' || !b.id) return ['Unknown post.']; await redis([['HDEL', K.posts, b.id]]); return [null, {}]; }
    if (b.action !== 'save') return ['Unknown action.'];
    const title = str(b.title, 150), body = String(b.body || '').slice(0, 20000).trim(), date = str(b.date, 10) || today();
    if (!title || !body) return ['A post needs a title and some text.'];
    if (!validDate(date)) return ['Enter a valid date.'];
    const id = typeof b.id === 'string' && b.id && b.id.length <= 64 ? b.id : randomUUID();
    const [old] = await redis([['HGET', K.posts, id]]);
    const prev = old ? JSON.parse(old) : {};
    const post = { id, title, date, body, status: b.status === 'published' ? 'published' : 'draft', visible: b.visible !== false, created: prev.created || new Date().toISOString() };
    await redis([['HSET', K.posts, id, JSON.stringify(post)]]);
    return [null, { post }];
  },

  async promos(b) {
    if (b.action === 'create') {
      const code = str(b.code, 30).toUpperCase();
      if (!/^[A-Z0-9_-]{2,30}$/.test(code)) return ['Code names use letters, numbers, dashes and underscores (2 to 30 characters).'];
      const type = b.type === 'fixed' ? 'fixed' : 'percent';
      const amount = Number(b.amount);
      if (!(amount > 0) || amount > 100000 || (type === 'percent' && amount > 100)) return [type === 'percent' ? 'A percentage must be between 1 and 100.' : 'Enter a discount amount greater than 0.'];
      const expires = str(b.expires, 10);
      if (expires && !validDate(expires)) return ['Enter a valid expiry date.'];
      const limit = Math.max(0, Math.floor(Number(b.limit) || 0));
      const product = ['all', ...PRODUCT_IDS].includes(b.product) ? b.product : 'all';
      const existing = rows(await getHash(K.promos));
      if (existing.some((p) => p.code === code)) return ['That code already exists.'];
      const id = randomUUID();
      await redis([['HSET', K.promos, id, JSON.stringify({ id, code, type, amount, expires, limit, product, active: true, used: 0, created: new Date().toISOString() })]]);
      return [null, {}];
    }
    if (typeof b.id !== 'string' || !b.id) return ['Unknown code.'];
    if (b.action === 'delete') { await redis([['HDEL', K.promos, b.id]]); return [null, {}]; }
    const [raw] = await redis([['HGET', K.promos, b.id]]);
    if (!raw) return ['That code no longer exists.', null, 404];
    const p = JSON.parse(raw);
    if (b.action === 'toggle') p.active = !p.active;
    else if (b.action === 'use') p.used = Math.max(0, p.used + (Number(b.delta) < 0 ? -1 : 1));
    else return ['Unknown action.'];
    await redis([['HSET', K.promos, b.id, JSON.stringify(p)]]);
    return [null, {}];
  },

  async broadcast(b) {
    if (b.action === 'finish') {
      const entry = { date: new Date().toISOString(), subject: str(b.subject, 200), lists: (b.lists || []).filter((l) => LISTS[l]), recipients: Math.max(0, Number(b.sent) || 0), failed: Math.max(0, Number(b.failed) || 0) };
      await redis([['LPUSH', K.broadcasts, JSON.stringify(entry)], ['LTRIM', K.broadcasts, 0, 199]]);
      return [null, {}];
    }
    if (b.action === 'count') {
      const ls = (Array.isArray(b.lists) ? b.lists : []).filter((l) => LISTS[l]);
      if (!ls.length) return [null, { total: 0 }];
      const sets = await redis(ls.map((l) => ['SMEMBERS', LISTS[l]]));
      return [null, { total: new Set(sets.flat().map((e) => String(e).toLowerCase()).filter(isEmail)).size }];
    }
    const key = process.env.RESEND_API_KEY;
    if (!key) return ['Email sending is not set up yet. Add RESEND_API_KEY in Vercel (see the steps at the top of this page).', null, 503];
    const subject = str(b.subject, 200), body = String(b.body || '').slice(0, 20000).trim();
    if (!subject || !body) return ['Write a subject line and a message first.'];
    const html = richToHtml(body), text = richToText(body);

    const send = async (emails) => {
      const msgs = emails.map((to) => ({
        from: FROM(), to: [to], subject: (b.action === 'test' ? '[TEST] ' : '') + subject,
        html: emailHtml(subject, html, b.action === 'test' ? '' : to),
        text: text + (b.action === 'test' ? '' : `\n\nUnsubscribe: ${unsubUrl(to)}`),
        headers: b.action === 'test' ? {} : { 'List-Unsubscribe': `<${unsubUrl(to)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      }));
      const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(msgs) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || `Resend error ${r.status}`); }
    };

    if (b.action === 'test') {
      try { await send([TEST_TO]); return [null, { sentTo: TEST_TO }]; } catch (e) { return ['Test failed: ' + e.message, null, 502]; }
    }
    if (b.action !== 'send') return ['Unknown action.'];
    if (b.confirm !== true) return ['Please confirm before sending.'];
    const lists = (Array.isArray(b.lists) ? b.lists : []).filter((l) => LISTS[l]);
    if (!lists.length) return ['Choose at least one list.'];
    const sets = await redis(lists.map((l) => ['SMEMBERS', LISTS[l]]));
    const all = [...new Set(sets.flat().map((e) => String(e).toLowerCase()).filter(isEmail))].sort();
    const offset = Math.max(0, Math.floor(Number(b.offset) || 0)), size = 50;
    const slice = all.slice(offset, offset + size);
    let failed = 0, error = '';
    if (slice.length) { try { await send(slice); } catch (e) { failed = slice.length; error = e.message; } }
    return [null, { total: all.length, processed: offset + slice.length, sent: slice.length - failed, failed, error, done: offset + slice.length >= all.length }];
  }
};

export default async function handler(req, res) {
  noStore(res);
  if (!isLoggedIn(req)) return bad(res, 'Please log in.', 401);
  try {
    if (req.method === 'GET') {
      const read = readers[req.query && req.query.r];
      if (!read) return bad(res, 'Unknown section.');
      return res.status(200).json(await read());
    }
    if (req.method !== 'POST') return bad(res, 'Method not allowed', 405);
    const b = req.body || {};
    const write = writers[b.r === 'products' && b.action === 'reset' ? 'products-reset' : b.r];
    if (!write) return bad(res, 'Unknown section.');
    const [err, data, code] = await write(b);
    if (err) return bad(res, err, code || 400);
    return res.status(200).json({ ok: true, ...(data || {}) });
  } catch (e) {
    return bad(res, 'Something went wrong. Please try again.', 500);
  }
}
