import { countRequestToday, getClientIp } from './_rateLimit.js';
import { emailHtml, unsubUrl, SITE } from './_store.js';

// Email signups: the Empire Life Dashboard iPhone waitlist ('eld-ios') and the main-page newsletter ('newsletter').
// Emails are kept in a Redis set (so repeats are ignored) with the signup time in a hash.
// To export: SMEMBERS waitlist:eld-ios  (and HGETALL waitlist:eld-ios:times).

const DAILY_LIMIT = 10;
const LISTS = { 'eld-ios': 'waitlist:eld-ios', newsletter: 'waitlist:newsletter' };

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}


// A short welcome email for each brand-new signup (repeat signups and bots get nothing). Failures are ignored: the signup is already saved.
const KIT_PAGE = `${SITE}/starter-kit`;
const WELCOME = {
  newsletter: {
    subject: 'Your free Debt-Free Date Starter Kit',
    html: `<p>Thanks for joining Debt Free Empire. Here is your free 12-page printable:</p>
<p style="margin:18px 0"><a href="${KIT_PAGE}" style="background:#8E6F3E;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">Get the Debt-Free Date Starter Kit</a></p>
<p>It walks you through listing your debts, choosing snowball or avalanche, finding your debt-free date and coloring in every win. Want the exact date with interest included? Try the free <a href="${SITE}/debt-calculator" style="color:#8E6F3E;font-weight:700">debt payoff calculator</a>.</p>
<p>We send calm, practical money tips and the occasional new printable, never anything pushy. If you have a question, just reply to this email. A real person reads it.</p>`,
    text: `Thanks for joining Debt Free Empire. Here is your free 12-page printable, the Debt-Free Date Starter Kit:\n${KIT_PAGE}\n\nIt walks you through listing your debts, choosing snowball or avalanche, finding your debt-free date and coloring in every win. Find your exact date with the free calculator: ${SITE}/debt-calculator\n\nIf you have a question, just reply to this email. A real person reads it.`
  },
  'eld-ios': {
    subject: "You're on the Empire Life Dashboard iPhone list",
    html: `<p>Thanks for joining the iPhone list for Empire Life Dashboard. We will email you when the iPhone and iPad version arrives, and you will hear first about any launch pricing.</p>
<p>Empire Life Dashboard is available now for Mac and Windows. We plan to release the iPhone and iPad version as part of the same App Store purchase, so people who buy from the Mac App Store should be able to download it at no extra cost when it arrives.</p>
<p>Want a quick look first? <a href="${SITE}/apps/empire-life-dashboard#video" style="color:#8E6F3E;font-weight:700">Watch the 90-second walkthrough</a>.</p>
<p>Questions? Just reply to this email. A real person reads it.</p>`,
    text: `Thanks for joining the iPhone list for Empire Life Dashboard. We will email you when the iPhone and iPad version arrives, and you will hear first about any launch pricing.\n\nEmpire Life Dashboard is available now for Mac and Windows. We plan to release the iPhone and iPad version as part of the same App Store purchase, so people who buy from the Mac App Store should be able to download it at no extra cost when it arrives.\n\nQuick look first: ${SITE}/apps/empire-life-dashboard#video\n\nQuestions? Just reply to this email.`
  }
};
async function sendWelcome(listId, email) {
  const key = process.env.RESEND_API_KEY, w = WELCOME[listId];
  if (!key || !w) return;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Debt Free Empire <hello@debtfreeempire.com>', to: [email], reply_to: 'hello@debtfreeempire.com',
        subject: w.subject, html: emailHtml(w.subject, w.html, email), text: `${w.text}\n\nUnsubscribe: ${unsubUrl(email)}`,
        headers: { 'List-Unsubscribe': `<${unsubUrl(email)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      })
    });
    clearTimeout(t);
  } catch (e) { /* the signup is saved either way */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  // Hidden field only bots fill in: pretend success and store nothing.
  if (body.website) return res.status(200).json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase();
  const list = LISTS[body.list];
  // Where the signup came from (a page or form), e.g. 'home:hero' or 'blog:snowball-vs-avalanche'. Optional; junk is dropped.
  const source = /^[a-z0-9:_\-.]{1,80}$/.test(String(body.source || '')) ? String(body.source) : '';
  if (!list || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const count = await countRequestToday('waitlist', getClientIp(req));
  if (count > DAILY_LIMIT) {
    return res.status(429).json({ error: 'Too many tries today. Please try again tomorrow.' });
  }

  const redis = redisConfig();
  if (!redis) return res.status(500).json({ error: 'Signup is unavailable right now. Please try again later.' });

  try {
    const r = await fetch(`${redis.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redis.token}` },
      body: JSON.stringify([
        ['SADD', list, email],
        ['HDEL', 'waitlist:unsubscribed', email], // rejoined, so no longer counted as unsubscribed
        ['HSETNX', `${list}:times`, email, new Date().toISOString()],
        ...(source ? [['HSETNX', `${list}:sources`, email, source]] : [])
      ])
    });
    const out = await r.json();
    if (!r.ok || !Array.isArray(out) || out.some((x) => x.error)) throw new Error('store failed');
    if (out[0] && out[0].result === 1) await sendWelcome(body.list, email);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
