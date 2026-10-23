// Tests for the visitor survey. Run the rig first: node _drafts/dev-server.mjs   then: node _drafts/survey-tests.mjs
const B = process.env.BASE || 'http://localhost:8780';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) pass++; else fail++; console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  ' + x)); };
const j = async (p, o = {}) => { const r = await fetch(B + p, o); let body = null; try { body = await r.json(); } catch (e) { /* none */ } return { status: r.status, body, headers: r.headers }; };
const post = (p, b, h = {}) => j(p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) });
const keys = async () => (await j('/__dev/redis')).body;
const V = (n) => ({ 'x-forwarded-for': '10.7.7.' + n });
const login = await post('/api/admin-login', { password: 'test-admin-pass' });
const A = { Cookie: (login.headers.get('set-cookie') || '').split(';')[0] };
const admin = () => j('/api/admin-content?r=survey', { headers: A });

console.log('Submitting answers');
let r = await post('/api/site-content', { type: 'survey', app: 'empire_life_dashboard', need: 'debt', device: 'mobile', os: 'ios', ref: 'search', canInstall: false }, V(1));
ok(r.status === 200 && r.body.ok, 'a valid answer is accepted');
await post('/api/site-content', { type: 'survey', app: 'empire_life_dashboard', need: 'life', device: 'desktop', os: 'mac', ref: 'direct', canInstall: true }, V(2));
await post('/api/site-content', { type: 'survey', app: 'paper_and_prosperity', need: 'budget', device: 'mobile', os: 'android', ref: 'social:instagram.com' }, V(3));
r = await post('/api/site-content', { type: 'survey', app: 'paper_and_prosperity', need: 'other', comment: 'Wish it linked to my credit union', device: 'tablet', os: 'ios', ref: 'internal' }, V(4));
ok(r.status === 200, 'an "other" answer with a note is accepted');
ok((await post('/api/site-content', { type: 'survey', app: 'empire_life_dashboard', need: 'hacked' }, V(5))).status === 400, 'an unknown option is rejected');
ok((await post('/api/site-content', { type: 'survey', app: 'somewhere_else', need: 'debt' }, V(5))).status === 400, 'an unknown app is rejected');
const c1 = await post('/api/site-content', { type: 'survey', app: 'paper_and_prosperity', need: 'other', comment: 'call me at jane@example.com', device: 'desktop', os: 'windows' }, V(6));
const c2 = await post('/api/site-content', { type: 'survey', app: 'paper_and_prosperity', need: 'other', comment: 'my number is 5551234567', device: 'desktop', os: 'windows' }, V(7));
const c3 = await post('/api/site-content', { type: 'survey', app: 'paper_and_prosperity', need: 'other', comment: 'see https://example.com/me', device: 'desktop', os: 'windows' }, V(8));
ok(c1.status === 200 && c2.status === 200 && c3.status === 200, 'answers with contact-looking notes still count');

console.log('What is stored');
const stored = (await keys()).filter(([k]) => k.startsWith('survey:r:'));
ok(stored.length === 7, 'the seven valid answers are stored and the two invalid ones are not', 'got ' + stored.length);
const ttl = stored[0][2]; ok(ttl > 89 * 86400 && ttl <= 90 * 86400, 'each answer expires in about 90 days', 'ttl=' + ttl);

console.log('Admin results');
ok((await j('/api/admin-content?r=survey')).status === 401, 'survey results need the admin login');
const d = (await admin()).body;
ok(d.summary.all.total === 7, 'summary counts all seven answers', JSON.stringify(d.summary.all));
ok(d.summary.byApp.empire_life_dashboard.total === 2 && d.summary.byApp.paper_and_prosperity.total === 5, 'counts split by app (2 and 5)');
ok(d.summary.byApp.empire_life_dashboard.needs.debt === 1 && d.summary.byApp.empire_life_dashboard.needs.life === 1, 'needs counted per app');
ok(d.summary.cannotInstall.total === 1 && d.summary.cannotInstall.needs.debt === 1, 'Empire Life Dashboard visitors who cannot install are counted separately');
ok(d.summary.byDevice.mobile.total === 2, 'split by device type');
const notes = d.comments.map((c) => c.comment);
ok(notes.includes('Wish it linked to my credit union'), 'a normal note is kept');
ok(!notes.some((n) => /example\.com|5551234567|https?:/.test(n)), 'notes with an email, a phone-like number or a link are discarded');
ok(!JSON.stringify(d).match(/\b\d{1,3}(\.\d{1,3}){3}\b/) && !JSON.stringify(d).includes('10.7.7'), 'no IP address anywhere in the results');
ok(Object.keys(d.needs).length === 6, 'six options are defined');

console.log('Deleting a comment');
const target = d.comments[0];
const del = await post('/api/admin-content', { r: 'survey', action: 'delete', id: target.id }, A);
ok(del.status === 200, 'admin can delete a comment');
ok(!(await admin()).body.comments.some((c) => c.id === target.id), 'it is gone from the list');
ok((await post('/api/admin-content', { r: 'survey', action: 'wipe' }, A)).status === 400, 'unknown action rejected');

console.log('Spam limit');
const codes = []; for (let i = 0; i < 9; i++) codes.push((await post('/api/site-content', { type: 'survey', app: 'paper_and_prosperity', need: 'debt' }, V(99))).status);
ok(codes.includes(429), 'one visitor address cannot flood the survey', codes.join(','));

console.log('Contact form still works');
const cf = await post('/api/site-content', { name: 'T', email: 't@example.com', subject: 'Hi', message: 'Hello there', product: 'Other' }, V(50));
ok(cf.status === 200, 'normal support messages are unaffected');

console.log('90-day expiry');
await j('/__dev/advance?days=91');
const login2 = await post('/api/admin-login', { password: 'test-admin-pass' });
A.Cookie = (login2.headers.get('set-cookie') || '').split(';')[0];
const after = (await admin()).body;
ok(after.summary.all.total === 0, 'everything is gone after 91 days');
ok(!(await keys()).some(([k]) => k.startsWith('survey:r:')), 'nothing left in storage');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
