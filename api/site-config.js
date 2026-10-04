import { isLoggedIn, noStore } from './_adminAuth.js';
import { redis } from './_redis.js';

// Small settings the admin can change without redeploying (for example, the Mac App Store link).
// GET is public and returns only these whitelisted fields. POST needs the admin login cookie.
const KEY = 'site:config';
const FIELDS = ['macAppStoreUrl'];

function cleanMacUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'apps.apple.com') return null;
  return u.toString();
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=60');
    try {
      const [flat] = await redis([['HGETALL', KEY]]);
      const cfg = {};
      for (let i = 0; i + 1 < (flat || []).length; i += 2) if (FIELDS.includes(flat[i])) cfg[flat[i]] = flat[i + 1];
      return res.status(200).json({ macAppStoreUrl: cfg.macAppStoreUrl || '' });
    } catch (e) {
      return res.status(200).json({ macAppStoreUrl: '' });
    }
  }
  noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Please log in.' });
  const url = cleanMacUrl((req.body || {}).macAppStoreUrl);
  if (url === null) return res.status(400).json({ error: 'Paste the full Mac App Store link (it starts with https://apps.apple.com/).' });
  try {
    await redis([url ? ['HSET', KEY, 'macAppStoreUrl', url] : ['HDEL', KEY, 'macAppStoreUrl']]);
    return res.status(200).json({ ok: true, macAppStoreUrl: url });
  } catch (e) {
    return res.status(500).json({ error: 'Could not save. Please try again.' });
  }
}
