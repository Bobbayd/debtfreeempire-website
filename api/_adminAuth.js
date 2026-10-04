// Shared admin login helpers. Sessions are a signed, expiring cookie; nothing is stored on the server.
// The signing key comes from ADMIN_PASSWORD, so changing that password logs everyone out.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'dfe_admin';
export const SESSION_SECONDS = 4 * 60 * 60; // stay logged in for 4 hours

const sha = (v) => createHash('sha256').update(String(v)).digest();
const key = () => sha('dfe-admin-session:' + (process.env.ADMIN_PASSWORD || ''));

export function passwordMatches(given) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(sha(given), sha(expected));
}

function sign(exp) {
  return createHmac('sha256', key()).update(String(exp)).digest('hex');
}

export function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function isLoggedIn(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const raw = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  const want = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}
