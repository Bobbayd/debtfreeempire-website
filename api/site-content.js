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

function page(res, title, text, extra = '') {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Debt Free Empire</title><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;900&display=swap" rel="stylesheet"><body style="margin:0;min-height:100vh;font-family:Montserrat,-apple-system,Arial,sans-serif;background:linear-gradient(180deg,#FAF7F2,#F3EBDD);color:#3D352E;display:flex;align-items:center;justify-content:center;padding:40px 16px;box-sizing:border-box"><main style="max-width:460px;width:100%;background:#FFFDF9;border:1px solid #E4C590;border-top:4px solid #A8864F;border-radius:16px;padding:36px 28px;text-align:center;box-shadow:0 14px 34px rgba(61,53,46,.08)"><div style="font-weight:900;font-size:15px;letter-spacing:2px;text-transform:uppercase">Debt Free <em style="font-family:Georgia,serif;font-weight:400;font-style:italic;text-transform:none;letter-spacing:0;color:#A8864F;font-size:1.3em">Empire</em></div><h1 style="font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:28px;margin:22px 0 10px">${title}</h1><p style="font-size:15px;line-height:1.7;color:#4A433B;margin:0 0 6px">${text}</p>${extra}<p style="margin:26px 0 0"><a href="/" style="display:inline-block;background:#8E6F3E;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">Back to Debt Free Empire</a></p></main></body></html>`);
}

const UNSUB = 'waitlist:unsubscribed'; // email -> time they unsubscribed (admin count)

async function unsubscribe(req, res) {
  const email = str(req.query.unsub, 254).toLowerCase();
  if (!isEmail(email) || str(req.query.t, 64) !== unsubToken(email)) return page(res, 'Link not valid', 'This unsubscribe link is not valid. Use the contact form at debtfreeempire.com/support and we will remove you.');
  try {
    const out = await redis(Object.values(LISTS).flatMap((k) => [['SREM', k, email], ['HDEL', `${k}:times`, email]]));
    // Only the first click counts: SREM returns 1 when the email was actually on a list.
    const removed = out.some((r, i) => i % 2 === 0 && Number(r) > 0);
    if (removed) {
      await redis([['HSET', UNSUB, email, new Date().toISOString()]]).catch(() => {});
      await sendUnsubConfirmation(email);
    }
    return page(res, 'You are unsubscribed', 'You will not get any more emails from Debt Free Empire.',
      '<p style="font-size:14px;line-height:1.6;color:#7A7066;margin:14px 0 0">Changed your mind? You can rejoin anytime <a href="/#newsletter" style="color:#8E6F3E;font-weight:700">on our homepage</a>.</p>');
  } catch (e) {
    return page(res, 'Something went wrong', 'Please try again in a little while.');
  }
}

// One plain confirmation email after unsubscribing. No marketing, no further emails.
async function sendUnsubConfirmation(email) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Debt Free Empire <hello@debtfreeempire.com>', to: [email],
        subject: "You're unsubscribed from Debt Free Empire",
        text: "You're unsubscribed.\n\nYou won't get any more emails from Debt Free Empire. This is the last one, just to confirm.\n\nChanged your mind? You can rejoin anytime at https://www.debtfreeempire.com/#newsletter\n\nWishing you calm money days,\nDebt Free Empire",
        html: `<div style="background:#FAF7F2;padding:28px 16px;font-family:Arial,sans-serif;color:#3D352E"><div style="max-width:520px;margin:0 auto;background:#FFFDF9;border:1px solid #E4C590;border-top:4px solid #A8864F;border-radius:14px;padding:30px 26px"><div style="font-weight:800;font-size:13px;letter-spacing:2px;text-transform:uppercase">Debt Free <em style="font-family:Georgia,serif;font-weight:400;text-transform:none;letter-spacing:0;color:#A8864F;font-size:17px">Empire</em></div><h1 style="font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:24px;margin:20px 0 10px">You're unsubscribed.</h1><p style="font-size:15px;line-height:1.7;margin:0 0 12px">You won't get any more emails from Debt Free Empire. This is the last one, just to confirm.</p><p style="font-size:14px;line-height:1.7;color:#7A7066;margin:0">Changed your mind? You can <a href="https://www.debtfreeempire.com/#newsletter" style="color:#8E6F3E;font-weight:700">rejoin anytime</a>.</p><p style="font-size:14px;line-height:1.7;margin:20px 0 0">Wishing you calm money days,<br>Debt Free Empire</p></div></div>`
      })
    });
    clearTimeout(t);
  } catch (e) { /* the on-screen confirmation still shows */ }
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
