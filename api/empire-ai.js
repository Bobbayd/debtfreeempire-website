import { countRequestToday, getClientIp } from './_rateLimit.js';
import { redis } from './_redis.js';
import { isEmail } from './_store.js';
import { chatEnabled, validId, getThread, newThread, addMessage, saveThread, deleteThread, publicMessages } from './_chat.js';

const DAILY_LIMIT = 10;
// Overall cap across everyone per day (see api/ai.js).
const GLOBAL_DAILY_LIMIT = 100;
const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_MESSAGES = 6;

const SYSTEM_PROMPT = `You are Empire AI — the official AI assistant of Debt Free Empire. You help visitors discover the right tools, apps, workbooks and spreadsheets to build their financial empire and achieve debt freedom. You know everything about all Debt Free Empire brands: Paper & Prosperity (budgeting app) and Empire Life Dashboard (desktop life planner). You speak with confidence and energy — like a knowledgeable friend who has already achieved financial freedom and wants to help others do the same. Keep responses concise and always point visitors to the right product or resource. Never give specific investment or legal advice. If you don't know the answer always offer something helpful and never say I don't know. If you truly cannot help end your response with the exact tag: [ESCALATE]. If ESCALATE is triggered show the user: 'Great question! Our team will look into this and get back to you soon. 💜'

CURRENT FACTS (from the Debt Free Empire website — do not claim anything beyond these):
- Paper & Prosperity: a calm, approachable personal-finance app for budgeting, debt payoff, savings goals, net worth, bill tracking and cash flow forecasting. Available now on the web (debtfreeempire.com/paper-and-prosperity has details and an "Open the Web App" button). It is also available for iPhone on the App Store (https://apps.apple.com/us/app/paper-prosperity/id6809006042). It is also available on Google Play (https://play.google.com/store/apps/details?id=com.paperandprosperity.paper_and_prosperity).
- Empire Life Dashboard: a calm all-in-one life planner with nine tabs for money, health, home, people and dreams. One purchase, no subscription. Details at debtfreeempire.com/apps/empire-life-dashboard.
- Store: spreadsheets and some PDF printables are available on Etsy (etsy.com/shop/PaperandProsperity); point people to the Etsy shop to see exactly what is listed. Physical workbooks are coming soon and are NOT available yet. Debt Free Empire does not sell cash envelopes.
- Visitors can join the newsletter on the homepage for updates.
- Blog: free guides on debt payoff, budgeting, weekly planning, home upkeep and habits at debtfreeempire.com/resources/blog.
- Free printable cash envelope tracker (a printable sheet, not physical envelopes) at debtfreeempire.com/resources/printables/cash-envelope-tracker.
Do not invent prices, features, release dates or discounts.
PRIVACY: Never ask for or repeat passwords, account or card numbers, Social Security numbers or other personal information. If a visitor shares any, do not repeat it; tell them not to share such details here and answer only the general question.
FORMAT: You are answering inside a small chat bubble. Reply in plain text only — no markdown, no headings, no bold, no bullet lists. Use 2-4 short sentences.`;

const SENSITIVE_MESSAGE = "For your safety, please don't share passwords, account numbers, Social Security numbers or other personal information here. I haven't sent that message, so feel free to ask again without those details.";

// Backstop for the same check the widget runs in the browser.
function looksSensitive(text) {
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text) || /\b\d{9}\b/.test(text)) return true;
  if (/\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\b/.test(text) || /\b\d{13,19}\b/.test(text)) return true;
  return /\b(password|passcode|passphrase|pin|ssn|social security( number)?)\b[^.?!\n]{0,15}(\bis\b|:|=)\s*\S+/i.test(text);
}

const ESCALATE_MESSAGE = "I've flagged this for our team. They'll read it and reply right here in this chat, so check back anytime. 💜";
const HUMAN_ACK = "Thanks! Our team will read your message and reply right here in this chat, usually within 48 hours. You can close this window and check back anytime. 💜";
const HUMAN_DAILY_LIMIT = 5;
const OWNER = 'hello@debtfreeempire.com';
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
}

// Best-effort email to the owner when a chat needs a human. The admin Chats tab always has the chat.
async function notifyOwner(thread, text) {
  const email = thread.contact && thread.contact.email;
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const link = 'https://www.debtfreeempire.com/admin/chats/';
    await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Debt Free Empire <hello@debtfreeempire.com>', to: [OWNER],
        ...(email ? { reply_to: email } : {}),
        subject: '[Empire AI] A visitor needs a reply',
        text: `A visitor needs a reply in Empire AI.\n\n"${String(text).slice(0, 600)}"\n\nPage: ${thread.page || 'unknown'}\n${email ? `Email: ${email} (reply to this email to answer them by email)\n` : ''}Reply here (it appears in their chat window): ${link}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1A1A1A"><p>A visitor needs a reply in Empire AI.</p><blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #E4C590;background:#FAF3E3">${esc(String(text).slice(0, 600))}</blockquote><p>Page: ${esc(thread.page || 'unknown')}${email ? `<br>Email: ${esc(email)} (reply to this email to answer them)` : ''}</p><p><a href="${link}">Open the Chats tab to reply</a>. Your reply appears in their chat window.</p></div>`
      })
    });
    clearTimeout(t);
  } catch (e) { /* ignore: the admin Chats tab still has the chat */ }
}

// Saves one question/answer pair. Never blocks the visitor's answer: any storage problem is ignored.
async function logExchange(cid, page, question, answer, escalated) {
  if (!chatEnabled() || !validId(cid)) return;
  try {
    const thread = (await getThread(cid)) || newThread(cid, page);
    const wasNeeding = thread.status === 'needs-reply';
    addMessage(thread, 'user', question);
    addMessage(thread, 'assistant', answer);
    thread.unread = true;
    thread.status = escalated ? 'needs-reply' : (thread.status === 'replied' || thread.status === 'resolved' ? 'open' : thread.status);
    await saveThread(thread);
    if (escalated && !wasNeeding) await notifyOwner(thread, question);
  } catch (e) { /* ignore */ }
}

async function humanMessage(req, res, { question, cid, page, email, optIn }) {
  email = String(email || '').trim().toLowerCase();
  if (email && !isEmail(email)) return res.status(400).json({ error: 'That email address does not look right. Fix it, or leave it blank.' });
  if (!chatEnabled()) return res.status(200).json({ answer: 'Our team can be reached through the contact form at debtfreeempire.com/support. Please use that to send your message. 💜' });
  if (!validId(cid)) return res.status(400).json({ error: 'Missing chat id' });
  if ((await countRequestToday('empire-ai-human', getClientIp(req))) > HUMAN_DAILY_LIMIT) {
    return res.status(429).json({ error: 'Daily limit reached. Please come back tomorrow.' });
  }
  try {
    const thread = (await getThread(cid)) || newThread(cid, page);
    const wasNeeding = thread.status === 'needs-reply';
    addMessage(thread, 'user', question);
    addMessage(thread, 'assistant', HUMAN_ACK);
    if (email) {
      thread.contact = { email, updates: optIn === true };
      // Only with an explicit tick: add them to the updates list (same format as the site's newsletter signups).
      if (optIn === true) await redis([['SADD', 'waitlist:newsletter', email], ['HSETNX', 'waitlist:newsletter:times', email, new Date().toISOString()]]);
    }
    thread.status = 'needs-reply';
    thread.unread = true;
    await saveThread(thread);
    if (!wasNeeding) await notifyOwner(thread, question);
    return res.status(200).json({ answer: HUMAN_ACK, human: true });
  } catch (e) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

// GET ?cid=<id>&since=<ms>: the visitor's own chat, so replies from the team show up in their window.
async function readThread(req, res) {
  const cid = req.query && req.query.cid;
  const since = Number(req.query && req.query.since) || 0;
  if (!chatEnabled() || !validId(cid)) return res.status(200).json({ messages: [] });
  try {
    const thread = await getThread(cid);
    return res.status(200).json({ messages: thread ? publicMessages(thread, since) : [] });
  } catch (e) {
    return res.status(200).json({ messages: [] });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return readThread(req, res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, history, cid, page, human, action, email, optIn } = req.body || {};

  if (action === 'delete') {
    if (chatEnabled() && validId(cid)) { try { await deleteThread(cid); } catch (e) { /* ignore */ } }
    return res.status(200).json({ ok: true });
  }

  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Missing question' });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return res.status(400).json({ error: 'Question is too long' });
  }

  // Sensitive messages are refused before anything is stored or sent to the AI.
  if (looksSensitive(question)) {
    return res.status(200).json({ answer: SENSITIVE_MESSAGE });
  }

  if (human === true) return humanMessage(req, res, { question: question.trim(), cid, page, email, optIn });

  const used = await countRequestToday('empire-ai', getClientIp(req));
  if (used > DAILY_LIMIT) {
    return res.status(429).json({ error: 'Daily limit reached. Please come back tomorrow.' });
  }

  const usedGlobal = await countRequestToday('empire-ai-global', 'all');
  if (usedGlobal > GLOBAL_DAILY_LIMIT) {
    return res.status(429).json({ error: 'The assistant is very busy right now. Please come back tomorrow.' });
  }

  // The API requires alternating roles starting with "user"; drop any leading
  // assistant turns (e.g. the greeting) and keep the new question last.
  const prior = cleanHistory(history);
  while (prior.length && prior[0].role !== 'user') prior.shift();
  const messages = [];
  for (const m of prior) {
    if (messages.length && messages[messages.length - 1].role === m.role) continue;
    messages.push(m);
  }
  if (messages.length && messages[messages.length - 1].role === 'user') messages.pop();
  messages.push({ role: 'user', content: question.trim() });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages
      })
    });

    const data = await response.json();
    const answer = data.content[0].text;

    if (answer.includes('[ESCALATE]')) {
      const cleanAnswer = answer.replace('[ESCALATE]', '').trim();
      const full = `${cleanAnswer} ${ESCALATE_MESSAGE}`.trim();
      await logExchange(cid, page, question.trim(), full, true);
      return res.status(200).json({ answer: full });
    }

    await logExchange(cid, page, question.trim(), answer, false);
    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
