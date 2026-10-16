import { countRequestToday, getClientIp } from './_rateLimit.js';

const DAILY_LIMIT = 10;
// Overall cap across everyone per day (see api/ai.js).
const GLOBAL_DAILY_LIMIT = 100;
const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_MESSAGES = 6;

const SYSTEM_PROMPT = `You are Empire AI — the official AI assistant of Debt Free Empire. You help visitors discover the right tools, apps, workbooks and spreadsheets to build their financial empire and achieve debt freedom. You know everything about all Debt Free Empire brands: Paper & Prosperity (budgeting app) and Empire Life Dashboard (desktop life planner). You speak with confidence and energy — like a knowledgeable friend who has already achieved financial freedom and wants to help others do the same. Keep responses concise and always point visitors to the right product or resource. Never give specific investment or legal advice. If you don't know the answer always offer something helpful and never say I don't know. If you truly cannot help end your response with the exact tag: [ESCALATE]. If ESCALATE is triggered show the user: 'Great question! Our team will look into this and get back to you soon. 💜'

CURRENT FACTS (from the Debt Free Empire website — do not claim anything beyond these):
- Paper & Prosperity: a calm, approachable personal-finance app for budgeting, debt payoff, savings goals, net worth, bill tracking and cash flow forecasting. Available now on the web (debtfreeempire.com/paper-and-prosperity has details and an "Open the Web App" button). It is also available for iPhone on the App Store (https://apps.apple.com/us/app/paper-prosperity/id6809006042). It is also available on Google Play (https://play.google.com/store/apps/details?id=com.paperandprosperity.paper_and_prosperity).
- Empire Life Dashboard: a calm all-in-one life planner with nine tabs for money, health, home, people and dreams. One purchase, no subscription. Details at debtfreeempire.com/apps/empire-life-dashboard.
- Store: spreadsheets are available on Etsy (etsy.com/shop/PaperandProsperity). PDFs and printables, physical workbooks and cash envelopes are coming soon and are NOT available yet.
- Visitors can join the newsletter on the homepage for updates.
Do not invent prices, features, release dates or discounts.
FORMAT: You are answering inside a small chat bubble. Reply in plain text only — no markdown, no headings, no bold, no bullet lists. Use 2-4 short sentences.`;

const ESCALATE_MESSAGE = 'Great question! Our team will look into this and get back to you soon. 💜';

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, history } = req.body || {};

  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Missing question' });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return res.status(400).json({ error: 'Question is too long' });
  }

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
      return res.status(200).json({ answer: `${cleanAnswer} ${ESCALATE_MESSAGE}`.trim() });
    }

    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
