// Shared keys, validation and email helpers for /api/site-content (public) and /api/admin-content (admin).
import { createHmac } from 'node:crypto';

export const K = {
  support: 'support:messages',
  announcement: 'site:announcement',
  products: 'site:products',
  posts: 'blog:posts',
  promos: 'promo:codes',
  broadcasts: 'broadcast:log'
};
export const SITE = 'https://www.debtfreeempire.com';
export const SUPPORT_PRODUCTS = ['Paper & Prosperity', 'Empire Life Dashboard', 'Workbooks', 'Grind & Save', 'Empire Arcade', 'Other'];
export const SUPPORT_STATUSES = ['unread', 'in-progress', 'resolved'];
export const PRODUCT_IDS = ['pp', 'eld', 'workbooks', 'gs', 'arcade'];
export const PRODUCT_STATUSES = ['coming-soon', 'live', 'sale'];
export const LISTS = { 'eld-ios': 'waitlist:eld-ios', newsletter: 'waitlist:newsletter' };

export const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
export const isEmail = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// Turn a Redis HGETALL flat array into parsed JSON rows.
export function rows(flat) {
  const out = [];
  for (let i = 0; i + 1 < (flat || []).length; i += 2) { try { out.push(JSON.parse(flat[i + 1])); } catch (e) { /* skip corrupt row */ } }
  return out;
}

// Links must be https or a site-relative path (blocks javascript: etc.).
export function cleanLink(v) {
  const s = str(v, 500);
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'mailto:' ? u.toString() : null; } catch (e) { return null; }
}

// ---- Mini rich text: **bold**, *italic*, "- " bullets, blank line = new paragraph ----
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
export function richToHtml(text) {
  const out = []; let list = false, para = [];
  const flush = () => { if (para.length) { out.push('<p style="margin:0 0 14px">' + para.join('<br>') + '</p>'); para = []; } };
  const close = () => { if (list) { out.push('</ul>'); list = false; } };
  String(text || '').split(/\r?\n/).forEach((line) => {
    const b = line.match(/^\s*[-•]\s+(.*)$/);
    if (b) { flush(); if (!list) { out.push('<ul style="margin:0 0 14px;padding-left:22px">'); list = true; } out.push('<li>' + inline(b[1]) + '</li>'); }
    else if (!line.trim()) { flush(); close(); }
    else { close(); para.push(inline(line)); }
  });
  flush(); close();
  return out.join('');
}
export const richToText = (t) => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1$2');

// ---- Unsubscribe links (signed so nobody can unsubscribe other people) ----
export function unsubToken(email) {
  return createHmac('sha256', 'dfe-unsub:' + (process.env.ADMIN_PASSWORD || '')).update(email.toLowerCase()).digest('hex').slice(0, 32);
}
export const unsubUrl = (email) => `${SITE}/api/site-content?unsub=${encodeURIComponent(email)}&t=${unsubToken(email)}`;

export function emailHtml(subject, bodyHtml, email) {
  return `<!doctype html><html><body style="margin:0;background:#FFF9F3;font-family:Montserrat,-apple-system,Segoe UI,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:600px;margin:0 auto;padding:32px 20px">
<div style="font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;padding-bottom:14px;border-bottom:2px solid #E4C590">Debt Free Empire</div>
<h1 style="font-size:22px;margin:26px 0 16px">${esc(subject)}</h1>
<div style="font-size:15px;line-height:1.7">${bodyHtml}</div>
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #DDD5E5;font-size:12px;color:#55515B;line-height:1.6">You are receiving this because you signed up at debtfreeempire.com.<br>${email ? `<a href="${unsubUrl(email)}" style="color:#725C9F">Unsubscribe</a>` : 'Unsubscribe link appears here for each recipient.'}</div>
</div></body></html>`;
}
