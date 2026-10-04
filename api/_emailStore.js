// Reads the signup lists from Upstash Redis (written by /api/waitlist).
export const LISTS = [
  { id: 'newsletter', title: 'Newsletter signups (main landing page)', key: 'waitlist:newsletter' },
  { id: 'eld-ios', title: 'Empire Life Dashboard iPhone waitlist', key: 'waitlist:eld-ios' }
];

export async function loadLists() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('not configured');
  const cmds = LISTS.flatMap((l) => [['SMEMBERS', l.key], ['HGETALL', `${l.key}:times`]]);
  const r = await fetch(`${url}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmds) });
  const out = await r.json();
  if (!r.ok || !Array.isArray(out) || out.some((x) => x.error)) throw new Error('store failed');
  return LISTS.map((l, i) => {
    const emails = out[i * 2].result || [];
    const flat = out[i * 2 + 1].result || [];
    const times = {};
    for (let n = 0; n + 1 < flat.length; n += 2) times[flat[n]] = flat[n + 1];
    const items = emails.map((email) => ({ email, date: times[email] || null }));
    items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return { id: l.id, title: l.title, items };
  });
}
