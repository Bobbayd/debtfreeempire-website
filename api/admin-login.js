import { countRequestToday, getClientIp } from './_rateLimit.js';
import { passwordMatches, sessionCookie, noStore } from './_adminAuth.js';

const MAX_TRIES_PER_DAY = 15;

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'Admin access is not configured.' });
  const tries = await countRequestToday('admin', getClientIp(req));
  if (tries > MAX_TRIES_PER_DAY) return res.status(429).json({ error: 'Too many attempts. Try again tomorrow.' });
  if (!passwordMatches((req.body && req.body.password) || '')) return res.status(401).json({ error: 'Wrong password.' });
  res.setHeader('Set-Cookie', sessionCookie());
  return res.status(200).json({ ok: true });
}
