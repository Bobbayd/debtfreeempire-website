import { isLoggedIn, noStore } from './_adminAuth.js';
import { redis } from './_redis.js';

// Checks that the site's pages and the important outside links respond. Requires the admin login cookie.
const SITE = 'https://www.debtfreeempire.com';
const PAGES = ['/', '/apps', '/apps/empire-life-dashboard', '/paper-and-prosperity', '/paper-and-prosperity/app', '/paper-and-prosperity/debt-payoff', '/products', '/empire-games', '/support', '/privacy', '/assets/eld/walkthrough.mp4'];
const OUTSIDE = [
  { name: 'Microsoft Store: Empire Life Dashboard', url: 'https://apps.microsoft.com/detail/9NFTF14DSH6S' },
  { name: 'App Store: Paper & Prosperity', url: 'https://apps.apple.com/us/app/paper-prosperity/id6809006042' },
  { name: 'Google Play: Paper & Prosperity', url: 'https://play.google.com/store/apps/details?id=com.paperandprosperity.paper_and_prosperity' },
  { name: 'Etsy shop', url: 'https://www.etsy.com/shop/PaperandProsperity' },
  { name: 'Paper & Prosperity web app', url: 'https://web-paper-and-prosperity.vercel.app' }
];

async function check(name, url, soft) {
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

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Please log in.' });

  const jobs = [...PAGES.map((p) => check(p === '/' ? 'Home page' : p, SITE + p, false)), ...OUTSIDE.map((o) => check(o.name, o.url, true))];
  try {
    const [mac] = await redis([['HGET', 'site:config', 'macAppStoreUrl']]);
    if (mac) jobs.push(check('Mac App Store: Empire Life Dashboard', mac, true));
  } catch (e) { /* settings store unavailable: skip */ }

  const results = await Promise.all(jobs);
  let redisOk = true;
  try { await redis([['PING']]); } catch (e) { redisOk = false; }
  return res.status(200).json({
    checkedAt: new Date().toISOString(),
    site: results.filter((r) => r.url.startsWith(SITE)),
    outside: results.filter((r) => !r.url.startsWith(SITE)),
    emailStore: redisOk ? 'ok' : 'fail'
  });
}
