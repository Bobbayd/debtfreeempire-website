// Tiny Upstash Redis REST helper shared by the admin endpoints.
export function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export async function redis(commands) {
  const cfg = redisConfig();
  if (!cfg) throw new Error('not configured');
  const r = await fetch(`${cfg.url}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.token}` }, body: JSON.stringify(commands) });
  const out = await r.json();
  if (!r.ok || !Array.isArray(out) || out.some((x) => x.error)) throw new Error('store failed');
  return out.map((x) => x.result);
}
