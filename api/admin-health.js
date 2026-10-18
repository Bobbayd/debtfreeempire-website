import { timingSafeEqual } from 'node:crypto';
import { isLoggedIn, noStore } from './_adminAuth.js';
import { redis } from './_redis.js';

// Checks that the site's pages and the important outside links respond. Requires the admin login cookie.
const SITE = 'https://www.debtfreeempire.com';
const PAGES = ['/', '/apps', '/apps/empire-life-dashboard', '/paper-and-prosperity', '/paper-and-prosperity/app', '/paper-and-prosperity/debt-payoff', '/products', '/about', '/support', '/privacy', '/assets/eld/walkthrough.mp4'];
const OUTSIDE = [
  { name: 'Microsoft Store: Empire Life Dashboard', url: 'https://apps.microsoft.com/detail/9NFTF14DSH6S' },
  { name: 'App Store: Paper & Prosperity', url: 'https://apps.apple.com/us/app/paper-prosperity/id6809006042' },
  { name: 'Google Play: Paper & Prosperity', url: 'https://play.google.com/store/apps/details?id=com.paperandprosperity.paper_and_prosperity' },
  { name: 'Etsy shop', url: 'https://www.etsy.com/shop/PaperandProsperity' },
  { name: 'Paper & Prosperity web app', url: 'https://app.paperandprosperity.shop' },
  { name: 'Paper & Prosperity web app (debtfreeempire address)', url: 'https://app.debtfreeempire.com' },
  { name: 'Paper & Prosperity web app (old address)', url: 'https://web-paper-and-prosperity.vercel.app' }
];

async function check(name, url, soft) {
  const first = await checkOnce(name, url, soft);
  if (first.level !== 'fail') return first;
  await new Promise((r) => setTimeout(r, 1500));
  return checkOnce(name, url, soft); // one retry so a single hiccup does not raise an alarm
}

async function checkOnce(name, url, soft) {
  const t = Date.now();
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (DebtFreeEmpire site check)', Range: 'bytes=0-2048' } });
    const ms = Date.now() - t;
    if (r.ok || r.status === 206) return { name, url, status: r.status, ms, level: 'ok' };
    if (soft && [401, 403, 405, 429, 999].includes(r.status)) return { name, url, status: r.status, ms, level: 'warn', note: 'The site blocks automated checks, so open the link yourself to be sure.' };
    return { name, url, status: r.status, ms, level: 'fail' };
  } catch (e) {
    return { name, url, status: 0, ms: Date.now() - t, level: 'fail', note: 'No response' };
  }
}

// Vercel Cron calls this daily with "Authorization: Bearer <CRON_SECRET>".
function isCron(req) {
  const secret = process.env.CRON_SECRET;
  const got = String(req.headers.authorization || '');
  if (!secret || got.length !== secret.length + 7) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from('Bearer ' + secret));
}

// Emails the owner when the set of failing items changes (new problem, or all clear again).
async function alertIfChanged(failing, redisOk) {
  const items = failing.map((f) => `${f.name} (${f.status || 'no reply'})`);
  if (!redisOk) items.push('Signup/settings database (Upstash)');
  const now = items.slice().sort().join('|');
  let before = '';
  try { const [v] = await redis([['HGET', 'health:last', 'alerted']]); before = v || ''; } catch (e) { /* ignore */ }
  const key = process.env.RESEND_API_KEY;
  if (now === before || !key) return;
  const bad = items.length > 0;
  const lines = bad ? items.map((i) => '- ' + i).join('\n') : '';
  const subject = bad ? `Site alert: ${items.length} problem${items.length === 1 ? '' : 's'} on debtfreeempire.com` : 'Site recovered: everything on debtfreeempire.com is working again';
  const text = bad
    ? `The automatic site check found problems:\n\n${lines}\n\nDetails: ${SITE}/admin/health/\n\nYou will only get another email if this list changes.`
    : `All pages and store links are responding normally again.\n\nDetails: ${SITE}/admin/health/`;
  try {
    await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ from: process.env.RESEND_FROM || 'Debt Free Empire <hello@debtfreeempire.com>', to: ['hello@debtfreeempire.com'], subject, text }) });
  } catch (e) { /* ignore: the red badge still shows */ }
  try { await redis([['HSET', 'health:last', 'alerted', now]]); } catch (e) { /* ignore */ }
}

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const cron = isCron(req);
  if (!cron && !isLoggedIn(req)) return res.status(401).json({ error: 'Please log in.' });

  const jobs = [...PAGES.map((p) => check(p === '/' ? 'Home page' : p, SITE + p, false)), ...OUTSIDE.map((o) => check(o.name, o.url, true))];
  try {
    const [mac] = await redis([['HGET', 'site:config', 'macAppStoreUrl']]);
    if (mac) jobs.push(check('Mac App Store: Empire Life Dashboard', mac, true));
  } catch (e) { /* settings store unavailable: skip */ }

  const results = await Promise.all(jobs);
  let redisOk = true;
  try { await redis([['PING']]); } catch (e) { redisOk = false; }
  const failing = results.filter((r) => r.level === 'fail');
  if (cron) await alertIfChanged(failing, redisOk);
  const items = failing.map((f) => `${f.name} (${f.status || 'no reply'})`);
  if (!redisOk) items.push('Signup/settings database (Upstash)');
  try { await redis([['HSET', 'health:last', 'failing', items.slice().sort().join('|'), 'count', String(items.length), 'at', new Date().toISOString()]]); } catch (e) { /* ignore */ }
  return res.status(200).json({
    checkedAt: new Date().toISOString(),
    site: results.filter((r) => r.url.startsWith(SITE)),
    outside: results.filter((r) => !r.url.startsWith(SITE)),
    emailStore: redisOk ? 'ok' : 'fail'
  });
}
