// Shared per-IP daily rate limiter. Files starting with "_" are not routed by Vercel.
//
// Persistent (all server instances): set UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN (or the KV_REST_API_URL / KV_REST_API_TOKEN pair added
// by the Vercel Upstash integration). Without them it falls back to a per-instance
// in-memory counter, which resets on cold starts and is NOT shared across instances.

const memoryCounts = new Map();
let lastStore = 'memory';

// Which backend served the most recent count (for diagnostics).
export function lastStoreUsed() { return lastStore; }

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

export function usingPersistentStore() {
  return Boolean(redisConfig());
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

// Increments and returns today's request count for this scope + IP.
export async function countRequestToday(scope, ip) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${scope}:${ip}:${day}`;
  const redis = redisConfig();
  lastStore = redis ? lastStore : 'memory (no redis env)';

  if (redis) {
    try {
      const r = await fetch(`${redis.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redis.token}` },
        body: JSON.stringify([['INCR', key], ['EXPIRE', key, 90000]])
      });
      const out = await r.json();
      const count = Number(out?.[0]?.result);
      if (Number.isFinite(count)) { lastStore = 'redis'; return count; }
      lastStore = 'redis-error: ' + JSON.stringify(out).slice(0, 120);
    } catch (e) {
      lastStore = 'redis-error: ' + String(e && e.message).slice(0, 120);
    }
  }

  for (const k of memoryCounts.keys()) {
    if (!k.endsWith(day)) memoryCounts.delete(k);
  }
  const next = (memoryCounts.get(key) || 0) + 1;
  memoryCounts.set(key, next);
  return next;
}
