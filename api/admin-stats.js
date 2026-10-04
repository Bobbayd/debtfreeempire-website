import { isLoggedIn, noStore } from './_adminAuth.js';
import { loadLists } from './_emailStore.js';

// Dashboard numbers for the admin home page. Requires the admin login cookie.
export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Please log in.' });
  try {
    const lists = await loadLists();
    const now = Date.now(), week = 7 * 24 * 3600 * 1000;
    const counts = lists.map((l) => ({
      id: l.id, title: l.title, total: l.items.length,
      lastSevenDays: l.items.filter((i) => i.date && now - Date.parse(i.date) < week).length
    }));
    const recent = lists
      .flatMap((l) => l.items.map((i) => ({ list: l.title, email: i.email, date: i.date })))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 8);
    return res.status(200).json({ counts, recent });
  } catch (e) {
    return res.status(500).json({ error: 'Could not load the numbers.' });
  }
}
