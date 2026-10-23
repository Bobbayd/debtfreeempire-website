// "What are you hoping to get help with?" answers (a generic, needs-based question), shared by /api/site-content (public, write)
// and /api/admin-content (admin, read). Files starting with "_" are not routed by Vercel.
//
// Redis layout (each answer expires on its own, so nothing is kept longer than RETENTION_DAYS):
//   survey:r:<id>   JSON answer
//   survey:index    sorted set of ids scored by time (for the admin list)
// No names, emails or IP addresses are stored. The device type and operating system come from the visitor's browser.
import { randomUUID } from 'node:crypto';
import { redis } from './_redis.js';

export const RETENTION_DAYS = 90;
const TTL = RETENTION_DAYS * 24 * 3600;
export const APPS = ['empire_life_dashboard', 'paper_and_prosperity'];
export const NEEDS = {
  debt: 'Paying off debt',
  budget: "Making a budget I'll stick to",
  saving: 'Saving for a goal',
  life: 'Organizing my whole life, not just money',
  browsing: 'Just looking around',
  other: 'Something else'
};
const DEVICES = ['mobile', 'tablet', 'desktop'];
const OSES = ['ios', 'android', 'windows', 'mac', 'chromeos', 'linux', 'other'];
const REFS = ['direct', 'search', 'social', 'internal', 'other'];

const key = (id) => `survey:r:${id}`;
const INDEX = 'survey:index';
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);

// Free text can hold personal details, so anything that looks like contact info or a long number is dropped.
export function cleanComment(v) {
  const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 140);
  return /@|https?:|www\.|\d{5,}/i.test(t) ? '' : t;
}

export async function saveAnswer(b) {
  const answer = {
    id: randomUUID(), at: Date.now(),
    app: pick(b.app, APPS, ''), need: pick(b.need, Object.keys(NEEDS), ''),
    comment: cleanComment(b.comment),
    device: pick(b.device, DEVICES, 'desktop'), os: pick(b.os, OSES, 'other'),
    ref: pick(String(b.ref || '').split(':')[0], REFS, 'direct')
  };
  if (!answer.app || !answer.need) return null;
  if (answer.app === 'empire_life_dashboard' && typeof b.canInstall === 'boolean') answer.canInstall = b.canInstall;
  await redis([
    ['SET', key(answer.id), JSON.stringify(answer), 'EX', TTL],
    ['ZADD', INDEX, answer.at, answer.id],
    ['ZREMRANGEBYSCORE', INDEX, '-inf', Date.now() - TTL * 1000]
  ]);
  return answer;
}

export async function deleteAnswer(id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return;
  await redis([['DEL', key(id)], ['ZREM', INDEX, id]]);
}

export async function listAnswers(limit = 1000) {
  await redis([['ZREMRANGEBYSCORE', INDEX, '-inf', Date.now() - TTL * 1000]]);
  const [ids] = await redis([['ZREVRANGE', INDEX, 0, limit - 1]]);
  if (!ids || !ids.length) return [];
  const raws = await redis(ids.map((id) => ['GET', key(id)]));
  const out = [], gone = [];
  raws.forEach((raw, i) => { if (!raw) { gone.push(ids[i]); return; } try { out.push(JSON.parse(raw)); } catch (e) { gone.push(ids[i]); } });
  if (gone.length) await redis(gone.map((id) => ['ZREM', INDEX, id]));
  return out;
}

// Counts for the admin page: overall, per app, and per device type.
export function summarize(list) {
  const count = (rows, f) => rows.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});
  const split = (rows) => ({ total: rows.length, needs: count(rows, (r) => r.need) });
  const byApp = {}; APPS.forEach((a) => { byApp[a] = split(list.filter((r) => r.app === a)); });
  const byDevice = {}; DEVICES.forEach((d) => { byDevice[d] = split(list.filter((r) => r.device === d)); });
  const cannotInstall = split(list.filter((r) => r.app === 'empire_life_dashboard' && r.canInstall === false));
  return { all: split(list), byApp, byDevice, cannotInstall };
}
