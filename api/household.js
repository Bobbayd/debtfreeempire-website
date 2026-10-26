// Paper & Prosperity "Budget Together": relays a couple's shared-budget
// changes between their two devices.
//
// Every change is locked (AES-256-GCM) on the phone with a key derived from
// the couple's invite code before it is sent. This server only ever sees
// locked blobs: it cannot read anyone's budget. It keeps each household's
// blobs in order and checks a password (also derived from the code) before
// handing them out or adding more.
//
// Storage (Upstash Redis):
//   hh:<id>:auth   SHA-256 of the access password
//   hh:<id>:ops    list of locked change batches, oldest first
import crypto from 'node:crypto';
import { redis } from './_redis.js';
import { countRequestToday, getClientIp } from './_rateLimit.js';

const MAX_BLOB_CHARS = 2_000_000; // one batch (a first full upload can be large)
const MAX_ITEMS = 20_000; // per household
const MAX_PULL = 500; // batches per request
const DAILY_LIMIT = 5_000; // requests per IP per day
const ID_PATTERN = /^[0-9a-f]{32}$/;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function sameHash(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers.authorization !== 'Bearer PP_EMPIRE_2026') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const used = await countRequestToday('household', getClientIp(req));
  if (used > DAILY_LIMIT) return res.status(429).json({ error: 'Too many requests today' });

  const { action, householdId, accessToken } = req.body || {};
  if (typeof householdId !== 'string' || !ID_PATTERN.test(householdId)) {
    return res.status(400).json({ error: 'Bad household' });
  }
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 100) {
    return res.status(400).json({ error: 'Bad access' });
  }
  const authKey = `hh:${householdId}:auth`;
  const opsKey = `hh:${householdId}:ops`;

  try {
    if (action === 'create') {
      // SET NX: a household can be created once; nobody can take over an
      // existing one by "creating" it again.
      const [created] = await redis([['SET', authKey, sha256(accessToken), 'NX']]);
      if (created !== 'OK') {
        const [stored] = await redis([['GET', authKey]]);
        if (!sameHash(stored, sha256(accessToken))) return res.status(409).json({ error: 'Taken' });
      }
      return res.status(200).json({ ok: true });
    }

    const [stored] = await redis([['GET', authKey]]);
    if (!stored) return res.status(404).json({ error: 'No such household' });
    if (!sameHash(stored, sha256(accessToken))) return res.status(403).json({ error: 'Wrong code' });

    if (action === 'push') {
      const { blob } = req.body;
      if (typeof blob !== 'string' || !blob || blob.length > MAX_BLOB_CHARS) {
        return res.status(413).json({ error: 'Bad change batch' });
      }
      const [length] = await redis([['LLEN', opsKey]]);
      if (length >= MAX_ITEMS) return res.status(507).json({ error: 'Household is full' });
      const [newLength] = await redis([['RPUSH', opsKey, blob]]);
      return res.status(200).json({ seq: newLength });
    }

    if (action === 'pull') {
      const since = Number.isInteger(req.body.since) && req.body.since >= 0 ? req.body.since : 0;
      const [blobs, latest] = await redis([
        ['LRANGE', opsKey, since, since + MAX_PULL - 1],
        ['LLEN', opsKey],
      ]);
      const items = (blobs || []).map((blob, i) => ({ seq: since + i + 1, blob }));
      return res.status(200).json({ items, latest: Math.min(latest, since + items.length) });
    }

    if (action === 'delete') {
      // Either partner can remove the household's data from the server.
      await redis([['DEL', opsKey, authKey]]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('household', action, e?.message);
    return res.status(503).json({ error: 'Storage unavailable' });
  }
}
