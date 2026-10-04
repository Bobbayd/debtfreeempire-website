import { countRequestToday, getClientIp } from './_rateLimit.js';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  // Hidden field only bots fill in: pretend success and store nothing.
  if (body.website) return res.status(200).json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase();
  const list = LISTS[body.list];
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
        ['HSETNX', `${list}:times`, email, new Date().toISOString()]
      ])
    });
    const out = await r.json();
    if (!r.ok || !Array.isArray(out) || out.some((x) => x.error)) throw new Error('store failed');
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
