import { isLoggedIn, noStore } from './_adminAuth.js';
import { redis } from './_redis.js';

// Add or remove one email on one signup list. Requires the admin login cookie.
const KEYS = { newsletter: 'waitlist:newsletter', 'eld-ios': 'waitlist:eld-ios' };

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Please log in.' });
  const { action, list, email: raw } = req.body || {};
  const key = KEYS[list];
  const email = String(raw || '').trim().toLowerCase();
  if (!key) return res.status(400).json({ error: 'Unknown list.' });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  try {
    if (action === 'add') {
      await redis([['SADD', key, email], ['HSETNX', `${key}:times`, email, new Date().toISOString()], ['HSETNX', `${key}:sources`, email, 'admin']]);
    } else if (action === 'remove') {
      await redis([['SREM', key, email], ['HDEL', `${key}:times`, email], ['HDEL', `${key}:sources`, email]]);
    } else {
      return res.status(400).json({ error: 'Unknown action.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
