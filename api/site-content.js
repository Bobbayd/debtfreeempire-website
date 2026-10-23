import { randomUUID } from 'node:crypto';
import { countRequestToday, getClientIp } from './_rateLimit.js';
import { redis, redisConfig } from './_redis.js';
import { K, LISTS, SUPPORT_PRODUCTS, PRODUCT_IDS, rows, str, isEmail, unsubToken } from './_store.js';
import { saveAnswer } from './_survey.js';

// PUBLIC endpoint.
//   GET                -> announcement bar, product overrides and the 3 latest published updates (cached ~30s)
//   POST               -> contact form (saved to the admin Support tab)
//   GET/POST ?unsub=.. -> one-click unsubscribe from email broadcasts
const LIMIT = 5;

function page(res, title, text) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Montserrat,-apple-system,Arial,sans-serif;background:#FFF9F3;color:#1A1A1A;text-align:center;padding:60px 20px"><h1 style="font-size:22px">${title}</h1><p style="color:#55515B">${text}</p><p><a href="/" style="color:#725C9F">Back to Debt Free Empire</a></p></body>`);
}

async function unsubscribe(req, res) {
  const email = str(req.query.unsub, 254).toLowerCase();
  if (!isEmail(email) || str(req.query.t, 64) !== unsubToken(email)) return page(res, 'Link not valid', 'This unsubscribe link is not valid. Use the contact form at debtfreeempire.com/support and we will remove you.');
  try {
    await redis(Object.values(LISTS).flatMap((k) => [['SREM', k, email], ['HDEL', `${k}:times`, email]]));
    return page(res, 'You are unsubscribed', 'You will not get any more emails from us.');
  } catch (e) {
    return page(res, 'Something went wrong', 'Please try again in a little while.');
  }
}

// Emails each new support message to the owner. Reply-To is the visitor, so "Reply" in any mail app answers them.
const OWNER = 'hello@debtfreeempire.com';
const h = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function notify(m) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Debt Free Empire <hello@debtfreeempire.com>', to: [OWNER], reply_to: m.email,
        subject: `[Support] ${m.product}: ${m.subject}`.replace(/[\r\n]+/g, ' ').slice(0, 200),
        text: `From: ${m.name} <${m.email}>\nProduct: ${m.product}\nSubject: ${m.subject}\n\n${m.message}\n\n(Reply to this email to answer them. It is also in your admin Support tab.)`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1A1A1A"><p><b>${h(m.name)}</b> &lt;${h(m.email)}&gt;<br>Product: ${h(m.product)}<br>Subject: ${h(m.subject)}</p><p style="white-space:pre-wrap;border-left:3px solid #E4C590;padding-left:12px">${h(m.message)}</p><p style="color:#55515B;font-size:13px">Reply to this email to answer them. It is also in your admin Support tab.</p></div>`
      })
    });
    clearTimeout(t);
  } catch (e) { /* ignore: the admin Support tab still has the message */ }
}

export default async function handler(req, res) {
  if (req.query && req.query.unsub) return unsubscribe(req, res);

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=60');
    const empty = { announcement: null, products: {}, updates: [] };
    if (!redisConfig()) return res.status(200).json(empty);
    try {
      const [ann, prods, posts] = await redis([['HGETALL', K.announcement], ['HGETALL', K.products], ['HGETALL', K.posts]]);
      const a = {}; for (let i = 0; i + 1 < (ann || []).length; i += 2) a[ann[i]] = ann[i + 1];
      const announcement = a.enabled === '1' && a.message ? { message: a.message, link: a.link || '', linkText: a.linkText || '', color: a.color || '#FAF3E3' } : null;
      const products = {};
      for (let i = 0; i + 1 < (prods || []).length; i += 2) if (PRODUCT_IDS.includes(prods[i])) { try { products[prods[i]] = JSON.parse(prods[i + 1]); } catch (e) { /* skip */ } }
      const updates = rows(posts).filter((p) => p.status === 'published' && p.visible !== false)
        .sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(y.created).localeCompare(String(x.created))).slice(0, 3)
        .map((p) => ({ id: p.id, title: p.title, date: p.date, body: p.body }));
      return res.status(200).json({ announcement, products, updates });
    } catch (e) {
      return res.status(200).json(empty);
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = req.body || {};
  // One-question survey on the app pages ("what is holding you back from downloading?"). Stored without any contact details.
  if (b.type === 'survey') {
    if ((await countRequestToday('survey', getClientIp(req))) > 6) return res.status(429).json({ error: 'Thanks, we already have your answers.' });
    if (!redisConfig()) return res.status(200).json({ ok: true });
    try {
      const saved = await saveAnswer(b);
      return saved ? res.status(200).json({ ok: true }) : res.status(400).json({ error: 'Please pick one of the options.' });
    } catch (e) { return res.status(200).json({ ok: true }); }
  }
  if (b.website) return res.status(200).json({ ok: true }); // honeypot

  const name = str(b.name, 100), email = str(b.email, 254).toLowerCase(), subject = str(b.subject, 150), message = str(b.message, 6000);
  const product = SUPPORT_PRODUCTS.includes(b.product) ? b.product : 'Other';
  if (!name || !subject || !message) return res.status(400).json({ error: 'Please fill in your name, a subject and your message.' });
  if (message.length > 5000) return res.status(400).json({ error: 'Your message is too long (5,000 characters max).' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if ((await countRequestToday('support', getClientIp(req))) > LIMIT) return res.status(429).json({ error: 'Too many messages today. Please try again tomorrow.' });
  if (!redisConfig()) return res.status(500).json({ error: 'The form is unavailable right now. Please try again in a little while.' });
  const id = randomUUID();
  try {
    await redis([['HSET', K.support, id, JSON.stringify({ id, name, email, product, subject, message, date: new Date().toISOString(), status: 'unread' })]]);
    await notify({ name, email, product, subject, message }); // best effort: the message is already saved
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Something went wrong. Please try again in a little while.' });
  }
}
