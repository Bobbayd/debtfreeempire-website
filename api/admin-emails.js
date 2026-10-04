import { isLoggedIn, noStore } from './_adminAuth.js';
import { loadLists } from './_emailStore.js';

// Returns every email signup. Requires the admin login cookie from /api/admin-login.
export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Please log in.' });
  try {
    return res.status(200).json({ lists: await loadLists() });
  } catch (e) {
    return res.status(500).json({ error: 'Could not load the email lists.' });
  }
}
