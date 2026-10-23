// Empire AI chat storage, shared by /api/empire-ai (public) and /api/admin-content (admin).
// Files starting with "_" are not routed by Vercel, so this adds no serverless function.
//
// Redis layout (all keys expire on their own, so chats are deleted after RETENTION_DAYS):
//   chat:t:<id>   JSON thread. Rewritten with a fresh expiry on every new message.
//   chat:index    sorted set of thread ids, scored by last activity (for the admin list)
//   chat:needs    set of thread ids waiting for a human reply (for the admin badge)
//
// Nothing here stores names, emails or IP addresses. A thread is identified by a random id that lives
// in the visitor's own browser.
import { redis, redisConfig } from './_redis.js';

export const RETENTION_DAYS = 30;
const TTL = RETENTION_DAYS * 24 * 3600;
const MAX_MESSAGES = 60;
export const STATUSES = ['open', 'needs-reply', 'replied', 'resolved'];

export const chatEnabled = () => Boolean(redisConfig());
export const validId = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

const tKey = (id) => `chat:t:${id}`;
const INDEX = 'chat:index';
const NEEDS = 'chat:needs';
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const cleanPage = (p) => (typeof p === 'string' && /^\/[A-Za-z0-9/_\-.]{0,150}$/.test(p) ? p : '');

export async function getThread(id) {
  if (!validId(id)) return null;
  const [raw] = await redis([['GET', tKey(id)]]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export function newThread(id, page) {
  const now = new Date().toISOString();
  return { id, created: now, updated: now, page: cleanPage(page), status: 'open', unread: false, messages: [] };
}

export function addMessage(thread, role, text) {
  thread.messages.push({ role, text: clip(text, role === 'assistant' ? 1500 : 1200), at: Date.now() });
  if (thread.messages.length > MAX_MESSAGES) thread.messages = thread.messages.slice(-MAX_MESSAGES);
  thread.updated = new Date().toISOString();
  return thread;
}

// Writes the thread, refreshes its expiry (unless keepTtl) and keeps the index and "needs a reply" set in step.
export async function saveThread(thread, { keepTtl = false } = {}) {
  const needs = thread.status === 'needs-reply';
  const cutoff = Date.now() - TTL * 1000;
  await redis([
    keepTtl ? ['SET', tKey(thread.id), JSON.stringify(thread), 'KEEPTTL'] : ['SET', tKey(thread.id), JSON.stringify(thread), 'EX', TTL],
    ['ZADD', INDEX, Date.parse(thread.updated) || Date.now(), thread.id],
    [needs ? 'SADD' : 'SREM', NEEDS, thread.id],
    ['ZREMRANGEBYSCORE', INDEX, '-inf', cutoff]
  ]);
}

export async function deleteThread(id) {
  if (!validId(id)) return;
  await redis([['DEL', tKey(id)], ['ZREM', INDEX, id], ['SREM', NEEDS, id]]);
}

// Removes index entries whose thread has expired, then returns the ids needing a reply that still exist.
async function pruneAndNeeds() {
  const cutoff = Date.now() - TTL * 1000;
  const [old, needs] = await redis([['ZRANGEBYSCORE', INDEX, '-inf', cutoff], ['SMEMBERS', NEEDS]]);
  const dead = new Set(old || []);
  const live = (needs || []).filter((id) => !dead.has(id));
  if (dead.size) await redis([...[...dead].flatMap((id) => [['ZREM', INDEX, id], ['SREM', NEEDS, id]])]);
  return live;
}

export async function needsReplyCount() {
  const live = await pruneAndNeeds();
  if (!live.length) return 0;
  const exists = await redis(live.map((id) => ['EXISTS', tKey(id)]));
  const gone = live.filter((id, i) => !exists[i]);
  if (gone.length) await redis(gone.map((id) => ['SREM', NEEDS, id]));
  return live.length - gone.length;
}

const summary = (t) => {
  const firstUser = t.messages.find((m) => m.role === 'user');
  const last = t.messages[t.messages.length - 1];
  return {
    id: t.id, created: t.created, updated: t.updated, page: t.page || '', status: t.status, unread: Boolean(t.unread),
    email: Boolean(t.contact && t.contact.email),
    count: t.messages.length,
    preview: clip(firstUser ? firstUser.text : '', 140),
    last: last ? { role: last.role, text: clip(last.text, 120) } : null
  };
};

export async function listThreads(limit = 200) {
  await pruneAndNeeds();
  const [ids] = await redis([['ZREVRANGE', INDEX, 0, limit - 1]]);
  if (!ids || !ids.length) return [];
  const raws = await redis(ids.map((id) => ['GET', tKey(id)]));
  const out = [], gone = [];
  raws.forEach((raw, i) => {
    if (!raw) { gone.push(ids[i]); return; }
    try { out.push(summary(JSON.parse(raw))); } catch (e) { gone.push(ids[i]); }
  });
  if (gone.length) await redis(gone.flatMap((id) => [['ZREM', INDEX, id], ['SREM', NEEDS, id]]));
  return out;
}

// What a visitor is allowed to see of their own thread.
export const publicMessages = (thread, since = 0) =>
  thread.messages.filter((m) => m.at > since).map((m) => ({ role: m.role, text: m.text, at: m.at }));
