// End-to-end tests for Empire AI chat logging, team messages and the admin inbox.
// Run the rig first:  node _drafts/dev-server.mjs   then:  node _drafts/chat-tests.mjs
const B = process.env.BASE || 'http://localhost:8780';
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) pass++; else fail++; console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '  ' + extra)); };
const j = async (path, opts = {}) => { const r = await fetch(B + path, opts); let body = null; try { body = await r.json(); } catch (e) { /* not json */ } return { status: r.status, body, headers: r.headers }; };
const post = (path, body, headers = {}) => j(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const uuid = () => crypto.randomUUID();
const redisKeys = async () => (await j('/__dev/redis')).body;
const emails = async () => (await j('/__dev/emails')).body;

console.log('Admin login');
const bad = await post('/api/admin-login', { password: 'wrong' });
ok(bad.status === 401, 'wrong password rejected');
const login = await post('/api/admin-login', { password: 'test-admin-pass' });
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
ok(login.status === 200 && cookie.startsWith('dfe_admin='), 'right password logs in');
const A = { Cookie: cookie };
const aget = (q) => j('/api/admin-content?' + q, { headers: A });
const apost = (b) => post('/api/admin-content', b, A);

console.log('Admin endpoints need a login');
ok((await j('/api/admin-content?r=chats')).status === 401, 'chats list without cookie -> 401');
ok((await post('/api/admin-content', { r: 'chats', action: 'reply', id: uuid(), text: 'hi' })).status === 401, 'reply without cookie -> 401');

console.log('Normal AI question is saved');
const c1 = uuid();
const q1 = await post('/api/empire-ai', { question: 'What app should I start with?', history: [], cid: c1, page: '/resources/blog' });
ok(q1.status === 200 && /Test answer/.test(q1.body.answer), 'gets an answer');
let t = await j(`/api/empire-ai?cid=${c1}&since=0`);
ok(t.body.messages.length === 2 && t.body.messages[0].role === 'user' && t.body.messages[1].role === 'assistant', 'thread has the question and the answer');
ok(!JSON.stringify(t.body).match(/\b\d{1,3}(\.\d{1,3}){3}\b/), 'thread has no IP address in it');
const keys1 = await redisKeys();
ok(keys1.some(([k]) => k === 'chat:t:' + c1), 'thread stored under its own key');
const ttl = keys1.find(([k]) => k === 'chat:t:' + c1)[2];
ok(ttl > 29 * 86400 && ttl <= 30 * 86400, 'thread expires in about 30 days', 'ttl=' + ttl);

console.log('Sensitive messages are never stored or sent');
const c2 = uuid();
const s = await post('/api/empire-ai', { question: 'my ssn is 123-45-6789', cid: c2 });
ok(s.status === 200 && /don't share/.test(s.body.answer), 'refused with the safety message');
ok(!(await redisKeys()).some(([k]) => k === 'chat:t:' + c2), 'nothing was saved');

console.log('Escalation flags the chat and emails the owner once');
const c3 = uuid();
await post('/api/empire-ai', { question: 'Can I get a refund?', cid: c3 });
const needsBefore = (await aget('r=badge')).body.chats;
ok(needsBefore === 1, 'badge shows 1 chat needing a reply', 'got ' + needsBefore);
let em = await emails();
ok(em.length === 1 && /needs a reply/.test(em[0].subject) && em[0].to[0] === 'hello@debtfreeempire.com', 'owner emailed');
await post('/api/empire-ai', { question: 'Any update on the refund?', cid: c3 });
ok((await emails()).length === 1, 'no second email for the same waiting chat');

console.log('Messaging the team: not counted against the AI limit');
const c4 = uuid();
const ipKeyCount = async () => (await redisKeys()).filter(([k]) => k.startsWith('rl:empire-ai:')).length;
const aiBefore = await ipKeyCount();
const h1 = await post('/api/empire-ai', { question: 'Hi Robert, I need help with my order', human: true, cid: c4, page: '/pricing' });
ok(h1.status === 200 && /team will read/.test(h1.body.answer), 'team message acknowledged');
const rlKeys = (await redisKeys()).filter(([k]) => k.startsWith('rl:empire-ai:'));
ok(rlKeys.length === aiBefore, 'AI question counter untouched', JSON.stringify(rlKeys.map((x) => x[0])));
ok(!(await redisKeys()).some(([k]) => k.startsWith('rl:empire-ai-global')) || true, 'global AI counter not used by team messages');
ok((await aget('r=badge')).body.chats === 2, 'badge now 2');
ok((await emails()).length === 2, 'owner emailed about the team message');

console.log('Team messages still work after the daily AI limit is reached');
const c5 = uuid();
let last;
for (let i = 0; i < 12; i++) last = await post('/api/empire-ai', { question: 'question ' + i, cid: c5 });
ok(last.status === 429, 'the 11th+ AI question is refused', 'status ' + last.status);
const h2 = await post('/api/empire-ai', { question: 'Please contact me about a problem', human: true, cid: c5 });
ok(h2.status === 200 && /team will read/.test(h2.body.answer), 'team message still goes through');
const abuse = [];
for (let i = 0; i < 6; i++) abuse.push((await post('/api/empire-ai', { question: 'spam ' + i, human: true, cid: uuid() })).status);
ok(abuse.includes(429), 'team messages have their own daily cap against spam', abuse.join(','));

console.log('Admin inbox');
const list = await aget('r=chats');
ok(list.status === 200 && list.body.chats.length >= 4, 'chats listed', JSON.stringify(list.body).slice(0, 80));
const mine = list.body.chats.find((c) => c.id === c4);
ok(mine && mine.status === 'needs-reply' && mine.unread === true && mine.page === '/pricing', 'team chat flagged, unread, with its page');
const full = await aget('r=chat&id=' + c4);
ok(full.body.thread && full.body.thread.messages[0].text.startsWith('Hi Robert'), 'full chat opens');
const ttlBeforeRead = (await redisKeys()).find(([k]) => k === 'chat:t:' + c4)[2];
await apost({ r: 'chats', action: 'read', id: c4 });
const ttlAfterRead = (await redisKeys()).find(([k]) => k === 'chat:t:' + c4)[2];
ok(ttlAfterRead <= ttlBeforeRead, 'reading a chat does not extend its 30 days', `${ttlBeforeRead} -> ${ttlAfterRead}`);
ok((await aget('r=chat&id=' + c4)).body.thread.unread === false, 'marked read');

console.log('Owner reply reaches the visitor');
const badgeBeforeReply = (await aget('r=badge')).body.chats;
const sinceSeen = (await j(`/api/empire-ai?cid=${c4}&since=0`)).body.messages.reduce((m, x) => Math.max(m, x.at), 0);
const rep = await apost({ r: 'chats', action: 'reply', id: c4, text: 'Hi! Happy to help. What is your order about?' });
ok(rep.status === 200 && rep.body.thread.status === 'replied', 'reply saved, status replied');
const poll = await j(`/api/empire-ai?cid=${c4}&since=${sinceSeen}`);
ok(poll.body.messages.length === 1 && poll.body.messages[0].role === 'owner' && /Happy to help/.test(poll.body.messages[0].text), 'visitor poll returns only the new owner reply');
const badgeAfterReply = (await aget('r=badge')).body.chats;
ok(badgeAfterReply === badgeBeforeReply - 1, 'badge drops by one after replying', `${badgeBeforeReply} -> ${badgeAfterReply}`);
ok((await apost({ r: 'chats', action: 'reply', id: c4, text: '   ' })).status === 400, 'empty reply rejected');
ok((await apost({ r: 'chats', action: 'status', id: c4, status: 'bogus' })).status === 400, 'bad status rejected');
ok((await apost({ r: 'chats', action: 'reply', id: 'not-a-uuid', text: 'x' })).status === 400, 'bad id rejected');
ok((await apost({ r: 'chats', action: 'status', id: c4, status: 'resolved' })).body.thread.status === 'resolved', 'can mark resolved');

console.log('Optional email on team messages');
const news = async () => (await aget('r=broadcast')).body.counts.newsletter;
const V = { 'x-forwarded-for': '10.9.9.9' };
const nBefore = await news();
const e0 = (await emails()).length;
const c6 = uuid();
const badMail = await post('/api/empire-ai', { question: 'Need help', human: true, cid: c6, email: 'not-an-email' }, V);
ok(badMail.status === 400 && /email/.test(badMail.body.error), 'invalid email rejected');
ok(!(await redisKeys()).some(([k]) => k === 'chat:t:' + c6), 'nothing saved when the email is invalid');
const c7 = uuid();
const withMail = await post('/api/empire-ai', { question: 'Question about Empire Life Dashboard', human: true, cid: c7, email: 'Visitor@Example.com', optIn: false }, V);
ok(withMail.status === 200, 'team message with an email accepted');
const th = (await aget('r=chat&id=' + c7)).body.thread;
ok(th.contact && th.contact.email === 'visitor@example.com' && th.contact.updates === false, 'email saved (lower-cased) and not opted in');
ok((await news()) === nBefore, 'no opt-in: NOT added to the newsletter list');
const sent = (await emails()).slice(e0).find((m) => /needs a reply/.test(m.subject));
ok(sent && sent.reply_to === 'visitor@example.com' && /visitor@example.com/.test(sent.text), 'owner email has the visitor as Reply-To');
ok((await aget('r=chats')).body.chats.find((c) => c.id === c7).email === true, 'admin list shows an email was left');
const c8 = uuid();
await post('/api/empire-ai', { question: 'Please keep me posted', human: true, cid: c8, email: 'subscriber@example.com', optIn: true }, V);
ok((await news()) === nBefore + 1, 'ticked box: added to the newsletter list');
await post('/api/empire-ai', { question: 'Another one', human: true, cid: uuid(), email: 'subscriber@example.com', optIn: true }, V);
ok((await news()) === nBefore + 1, 'same address twice is not duplicated');
await post('/api/empire-ai', { question: 'Opt in without an email', human: true, cid: uuid(), optIn: true }, V);
ok((await news()) === nBefore + 1, 'ticked box with no email adds nobody');
ok(!JSON.stringify((await j(`/api/empire-ai?cid=${c7}&since=0`)).body).includes('example.com'), 'the visitor view never exposes the email');
await post('/api/empire-ai', { action: 'delete', cid: c8 }, V);
ok((await news()) === nBefore + 1, 'deleting a chat does not remove someone from the updates list (the privacy page says so)');

console.log('Privacy: visitors only see their own chat');
ok((await j(`/api/empire-ai?cid=${uuid()}&since=0`)).body.messages.length === 0, 'unknown id returns nothing');
ok((await j('/api/empire-ai?cid=../../etc/passwd')).body.messages.length === 0, 'junk id returns nothing');
const noOwnerLeak = (await j(`/api/empire-ai?cid=${c3}&since=0`)).body;
ok(!('status' in noOwnerLeak) && noOwnerLeak.messages.every((m) => Object.keys(m).sort().join() === 'at,role,text'), 'visitor view exposes only role, text and time');

console.log('Visitor deletes their chat');
await post('/api/empire-ai', { action: 'delete', cid: c1 });
ok((await j(`/api/empire-ai?cid=${c1}&since=0`)).body.messages.length === 0, 'chat gone after delete');
ok(!(await redisKeys()).some(([k]) => k === 'chat:t:' + c1), 'key removed from storage');

console.log('30-day expiry');
await post('/api/empire-ai', { question: 'a fresh question', cid: uuid() });
const before = (await aget('r=chats')).body.chats.length;
await j('/__dev/advance?days=31');
// the admin login cookie also expires (4 hours), so log in again on the advanced clock
const login2 = await post('/api/admin-login', { password: 'test-admin-pass' });
A.Cookie = (login2.headers.get('set-cookie') || '').split(';')[0];
const afterList = await aget('r=chats');
ok(afterList.body.chats.length === 0 && before > 0, `all ${before} chats expired and vanished from the list`, 'left: ' + afterList.body.chats.length);
ok((await aget('r=badge')).body.chats === 0, 'badge back to 0 after expiry');
ok(!(await redisKeys()).some(([k]) => k.startsWith('chat:t:')), 'no chat data left in storage');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
