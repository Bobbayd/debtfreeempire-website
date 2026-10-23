// One optional question on the two app pages: "What are you hoping to get help with?"
// Loaded by goals.js only on those pages. Answers go to /api/site-content (type "survey") and are stored without
// any name, email or IP address, for 90 days. Shown once per app, after about 20 seconds of the page being visible,
// and never to someone who has already clicked a download button.
const NEEDS = [
  ['debt', 'Paying off debt'],
  ['budget', "Making a budget I'll stick to"],
  ['saving', 'Saving for a goal'],
  ['life', 'Organizing my whole life, not just money'],
  ['browsing', 'Just looking around'],
  ['other', 'Something else']
];

export function start(ctx) {
  const KEY = 'dfe_survey_' + ctx.app;
  try { if (localStorage.getItem(KEY)) return; } catch (e) { return; } // can't remember a dismissal, so don't ask
  let delay = 25000;
  try { const t = parseInt(localStorage.getItem('dfe_survey_delay_ms'), 10); if (t >= 0) delay = t; } catch (e) { /* default */ }

  // Ask once the visitor has read about 40% of the page, or after 25 seconds on screen, whichever comes first.
  let seen = 0;
  const trigger = () => { clearInterval(timer); window.removeEventListener('scroll', onScroll); show(); };
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') seen += 500;
    if (seen >= delay) trigger();
  }, 500);
  function onScroll() {
    const de = document.documentElement;
    const room = de.scrollHeight - window.innerHeight;
    if (room > 0 && (window.scrollY || de.scrollTop) / room >= 0.4) trigger();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  function remember() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ } }

  function show() {
    if (window.__dfeClickedDownload || document.getElementById('dfeSurvey')) return;
    const style = document.createElement('style');
    style.textContent = `
#dfeSurvey{position:fixed;left:20px;bottom:20px;z-index:80;width:300px;max-width:calc(100vw - 24px);background:#fff;color:#1A1A1A;border:1px solid #E4C590;border-radius:14px;box-shadow:0 12px 32px rgba(26,26,26,.2);padding:16px 16px 14px;font-family:'Montserrat',sans-serif}
#dfeSurvey .s-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
#dfeSurvey .s-eyebrow{font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#A8864F;margin:0 0 4px}
#dfeSurvey .s-q{font-size:15px;font-weight:800;line-height:1.3;margin:0 0 10px}
#dfeSurvey .s-x{background:none;border:0;font-size:22px;line-height:1;cursor:pointer;color:#55515B;padding:0 2px}
#dfeSurvey .s-opt{display:block;width:100%;text-align:left;background:#FAF7F2;border:1px solid #E4C590;border-radius:10px;padding:9px 12px;margin-bottom:6px;font:600 13px 'Montserrat',sans-serif;color:#1A1A1A;cursor:pointer}
#dfeSurvey .s-opt:hover{background:#F3EBDD}
#dfeSurvey .s-opt:focus-visible,#dfeSurvey .s-x:focus-visible,#dfeSurvey input:focus-visible,#dfeSurvey .s-send:focus-visible{outline:2px solid #1A1A1A;outline-offset:2px}
#dfeSurvey input{width:100%;box-sizing:border-box;border:1.5px solid #DDD5E5;border-radius:10px;padding:9px 10px;font:14px 'Montserrat',sans-serif;margin-top:2px}
#dfeSurvey .s-note{font-size:11px;color:#55515B;margin:4px 0 8px}
#dfeSurvey .s-send{background:#1A1A1A;color:#fff;border:0;border-radius:10px;padding:9px 16px;font:700 13px 'Montserrat',sans-serif;cursor:pointer}
#dfeSurvey .s-thanks{font-size:14px;font-weight:700;margin:6px 0 2px}
@media (max-width:600px){#dfeSurvey{left:12px;right:12px;bottom:84px;width:auto;max-width:none;padding:12px 12px 10px}#dfeSurvey .s-q{font-size:14px;margin-bottom:8px}#dfeSurvey .s-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px}#dfeSurvey .s-opt{margin:0;font-size:12px;padding:8px 9px;line-height:1.25}}
@media print{#dfeSurvey{display:none}}`;
    document.head.appendChild(style);

    const box = document.createElement('section');
    box.id = 'dfeSurvey'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Quick question');
    const top = document.createElement('div'); top.className = 's-top';
    const head = document.createElement('div');
    const eyebrow = document.createElement('p'); eyebrow.className = 's-eyebrow'; eyebrow.textContent = 'Quick question';
    const q = document.createElement('p'); q.className = 's-q'; q.textContent = 'What are you hoping to get help with?';
    head.append(eyebrow, q);
    const x = document.createElement('button'); x.type = 'button'; x.className = 's-x'; x.setAttribute('aria-label', 'No thanks'); x.textContent = '×';
    top.append(head, x);
    const body = document.createElement('div');
    box.append(top, body);
    document.body.appendChild(box);

    function close() { remember(); box.remove(); style.remove(); }
    function thank() { body.textContent = ''; const t = document.createElement('p'); t.className = 's-thanks'; t.textContent = 'Thank you! That helps us a lot.'; body.appendChild(t); setTimeout(close, 2200); }
    function send(need, comment) {
      remember();
      try {
        fetch('/api/site-content', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'survey', app: ctx.app, need: need, comment: comment || '', device: ctx.device, os: ctx.os, ref: ctx.ref, canInstall: ctx.canInstall })
        }).catch(function () {});
      } catch (e) { /* the answer is optional; never get in the way */ }
      thank();
    }
    x.addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && document.getElementById('dfeSurvey')) { document.removeEventListener('keydown', esc); close(); } });

    const opts = document.createElement('div'); opts.className = 's-opts'; body.appendChild(opts);
    NEEDS.forEach(function (n) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 's-opt'; b.textContent = n[1];
      b.addEventListener('click', function () { if (n[0] === 'other') more(); else send(n[0], ''); });
      opts.appendChild(b);
    });
    function more() {
      body.textContent = '';
      const inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 140; inp.placeholder = 'Tell us in a few words (optional)'; inp.setAttribute('aria-label', 'Tell us in a few words, optional');
      const note = document.createElement('p'); note.className = 's-note'; note.textContent = 'Please don\'t include personal information.';
      const go = document.createElement('button'); go.type = 'button'; go.className = 's-send'; go.textContent = 'Send';
      go.addEventListener('click', function () { send('other', inp.value); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send('other', inp.value); } });
      body.append(inp, note, go); inp.focus();
    }
  }
}
