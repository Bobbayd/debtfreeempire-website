/* Empire AI chat widget for every page.
   Loads /empire-ai.css, injects the widget markup, then starts the chat. Talks to /api/empire-ai.
   10 questions per visitor per day (counted here and enforced per-IP on the server).
   The greeting bubble appears on the homepage only; other pages get the button. */
(function () {
  if (window.__empireAiLoaded) return;
  window.__empireAiLoaded = true;

  var MARKUP = `
<button type="button" class="eai-fab" id="eaiFab" aria-label="Open Empire AI chat" aria-expanded="false" aria-controls="eaiPanel" hidden><span aria-hidden="true">⚡</span><span class="eai-fab-label" id="eaiFabLabel">Ask Empire AI</span></button>
<div class="eai-bubble" id="eaiBubble" role="status" hidden>
  <button type="button" class="eai-bubble-text" id="eaiBubbleText">Hey! Need help finding the right tools? 👋</button>
  <button type="button" class="eai-bubble-close" id="eaiBubbleClose" aria-label="Dismiss Empire AI greeting">×</button>
</div>
<section class="eai-panel" id="eaiPanel" role="dialog" aria-label="Empire AI chat" aria-modal="false">
  <div class="eai-header">
    <div class="eai-head-text">
      <div class="eai-title">Empire AI ⚡</div>
      <p class="eai-privacy-note" id="eaiPrivacyNote">Please don't enter passwords or personal info. Chats may be read by our team and are deleted after 30 days.</p>
    </div>
    <div class="eai-head-actions">
      <button type="button" class="eai-menu-btn" id="eaiMenuBtn" aria-label="More options" aria-haspopup="true" aria-expanded="false">⋯</button>
      <button type="button" class="eai-close" id="eaiClose" aria-label="Close Empire AI chat">×</button>
    </div>
    <div class="eai-menu" id="eaiMenu" role="menu" hidden>
      <button type="button" role="menuitem" id="eaiDelete">Delete this chat</button>
      <button type="button" role="menuitem" id="eaiOff">Turn off Empire AI</button>
    </div>
  </div>
  <div class="eai-messages" id="eaiMessages" role="log" aria-live="polite"></div>
  <div class="eai-chips" id="eaiChips"></div>
  <div class="eai-contact" id="eaiContact" hidden>
    <p class="eai-contact-title">Want a reply by email too? <span>(optional)</span></p>
    <input class="eai-input" id="eaiEmail" type="email" maxlength="254" placeholder="Your email" autocomplete="email" aria-label="Your email, optional" />
    <label class="eai-check"><input type="checkbox" id="eaiOptIn"> Also send me occasional updates from Debt Free Empire</label>
    <p class="eai-contact-err" id="eaiContactErr" role="alert"></p>
    <div class="eai-contact-actions">
      <button type="button" class="eai-send" id="eaiContactSend">Send message</button>
      <button type="button" class="eai-off-btn" id="eaiContactSkip">Send without email</button>
      <button type="button" class="eai-off-btn" id="eaiContactCancel">Cancel</button>
    </div>
  </div>
  <form class="eai-form" id="eaiForm" autocomplete="off">
    <label for="eaiInput" style="position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0);">Ask Empire AI a question</label>
    <textarea class="eai-input" id="eaiInput" rows="2" maxlength="500" placeholder="Ask about our apps, pricing or budgeting…"></textarea>
    <button class="eai-send" id="eaiSend" type="submit">Send</button>
  </form>
  <div class="eai-footer">
    <span class="eai-foot-line">Need a person? <button type="button" class="eai-off-btn" id="eaiHuman">Message the team</button></span>
    <span class="eai-remaining" id="eaiRemaining"></span>
    <span class="eai-foot-fine">Not legal or tax advice · Powered by Claude</span>
  </div>
  <div class="eai-disclaimer-overlay" id="eaiDisclaimer" role="alertdialog" aria-labelledby="eaiDisclaimerText">
    <div class="eai-disclaimer-box">
      <p id="eaiDisclaimerText">Empire AI provides general information about Debt Free Empire products only. It is not legal, tax, or financial advice. Please don't share passwords, account numbers or other personal information.</p>
      <button type="button" class="eai-disclaimer-btn" id="eaiDisclaimerBtn">Got it! 💪</button>
    </div>
  </div>
</section>
<p class="eai-disabled-note" id="eaiDisabledNote" hidden>Empire AI is turned off. <button type="button" class="eai-on-btn" id="eaiOn">Turn it back on</button></p>
`;

  function boot() {
    if (!document.getElementById('eaiFab')) {
      var holder = document.createElement('div');
      holder.innerHTML = MARKUP;
      while (holder.firstChild) document.body.appendChild(holder.firstChild);
    }
    run();
  }

  function run() {
    var DAILY_LIMIT = 10;
    var GREETING = "Hey! I'm Empire AI. Ask me anything about building your debt free empire. 💪";
    var LIMIT_MSG = "You've reached today's limit of 10 Empire AI questions. Come back tomorrow! 💪";
    var ERROR_MSG = "Something went wrong reaching Empire AI. Please try again in a moment.";
    var SENSITIVE_MSG = "For your safety, please don't share passwords, account numbers, Social Security numbers or other personal information here. I haven't sent that message, so feel free to ask again without those details.";
    // Obvious sensitive patterns: SSN, card-style numbers, and "password is ..." style phrases.
    function looksSensitive(t) {
      if (/\b\d{3}-\d{2}-\d{4}\b/.test(t) || /\b\d{9}\b/.test(t)) return true;
      if (/\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\b/.test(t) || /\b\d{13,19}\b/.test(t)) return true;
      return /\b(password|passcode|passphrase|pin|ssn|social security( number)?)\b[^.?!\n]{0,15}(\bis\b|:|=)\s*\S+/i.test(t);
    }
    var SUGGESTED = [
      'What app should I start with?',
      'How do the workbooks work?',
      "What's in the store?",
      'How do I get started?',
      'Tell me about Paper & Prosperity'
    ];
    var K_DISABLED = 'empire_ai_disabled';
    var isHome = location.pathname === '/' || location.pathname === '/index.html';
    var K_ACCEPTED = 'empire_ai_disclaimer_accepted';
    var K_CID = 'empire_ai_cid';
    var K_SEEN = 'empire_ai_seen';
    var HUMAN_LIMIT_MSG = "You've sent the maximum number of messages to our team today. Please try again tomorrow.";
    var humanMode = false;
    var contactEl = document.getElementById('eaiContact');
    var emailEl = document.getElementById('eaiEmail');
    var optInEl = document.getElementById('eaiOptIn');
    var contactErr = document.getElementById('eaiContactErr');
    var pendingTeam = null; // a team message written but not yet sent (waiting on the optional email step)
    var lastAt = 0;        // newest message time we have seen from the server
    var lastOwnerAt = 0;   // newest team reply we have shown
    var pollTimer = null;

    var fab = document.getElementById('eaiFab');
    var panel = document.getElementById('eaiPanel');
    var messagesEl = document.getElementById('eaiMessages');
    var chipsEl = document.getElementById('eaiChips');
    var form = document.getElementById('eaiForm');
    var input = document.getElementById('eaiInput');
    var sendBtn = document.getElementById('eaiSend');
    var remainingEl = document.getElementById('eaiRemaining');
    var disclaimer = document.getElementById('eaiDisclaimer');
    var note = document.getElementById('eaiDisabledNote');
    if (!fab || !panel) return;

    var history = [];
    var busy = false;

    // A random id kept in this browser ties a conversation together. It is not a name or email.
    function uuid() {
      try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
      var b = new Uint8Array(16);
      try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
      b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
      var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
    }

    function ls(get, key, val) {
      try { return get ? localStorage.getItem(key) : localStorage.setItem(key, val); } catch (e) { return null; }
    }
    function todayKey() {
      var d = new Date();
      return 'empire_ai_count_' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
    function getCid(create) {
      var c = ls(true, K_CID);
      if (!c && create) { c = uuid(); ls(false, K_CID, c); }
      return c;
    }
    function usedToday() { return parseInt(ls(true, todayKey()), 10) || 0; }
    function remaining() { return Math.max(0, DAILY_LIMIT - usedToday()); }

    function updateRemaining() {
      var left = remaining();
      // Only mention the daily AI limit once it matters (3 or fewer left); team messages never count.
      remainingEl.textContent = left === 0
        ? 'No AI questions left today. You can still message the team.'
        : left <= 3 ? left + ' AI question' + (left === 1 ? '' : 's') + ' left today' : '';
      var off = busy || (left === 0 && !humanMode);
      input.disabled = off;
      sendBtn.disabled = off;
      chipsEl.querySelectorAll('button').forEach(function (b) { b.disabled = off; });
    }

    function addMessage(text, who) {
      var el = document.createElement('div');
      el.className = 'eai-msg ' + who;
      el.textContent = text;
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function addTeam(text) {
      var el = document.createElement('div');
      el.className = 'eai-msg team';
      var who = document.createElement('strong');
      who.textContent = 'Debt Free Empire team';
      el.appendChild(who);
      el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(text));
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function addThinking() {
      var el = document.createElement('div');
      el.className = 'eai-msg ai';
      el.innerHTML = 'Empire AI is thinking <span class="eai-thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function showContactStep(show) {
      contactEl.hidden = !show;
      form.hidden = show;
      contactErr.textContent = '';
      if (show) { messagesEl.scrollTop = messagesEl.scrollHeight; emailEl.focus(); }
    }

    function ask(question, opts) {
      opts = opts || {};
      question = (question || '').trim();
      if (!question || busy) return;
      if (looksSensitive(question)) { input.value = ''; addMessage(SENSITIVE_MSG, 'ai'); return; }
      if (remaining() === 0 && !humanMode) { addMessage(LIMIT_MSG, 'ai'); updateRemaining(); return; }
      var toTeam = humanMode;
      if (toTeam && !opts.confirmed) {
        // Step 1: they wrote their message. Step 2: offer an optional email, then send.
        pendingTeam = { text: question, el: addMessage(question, 'user') };
        input.value = '';
        showContactStep(true);
        return;
      }
      var emailVal = toTeam ? (opts.email || '') : '';
      var optIn = toTeam && !!emailVal && !!opts.optIn;
      humanMode = false;
      showContactStep(false);
      input.placeholder = 'Ask about our apps, pricing or budgeting…';

      if (!toTeam) { addMessage(question, 'user'); chipsEl.hidden = true; }
      input.value = '';
      busy = true;
      updateRemaining();
      var thinking = addThinking();

      fetch('/api/empire-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question, history: history.slice(-6), cid: getCid(true), page: location.pathname, human: toTeam, email: emailVal, optIn: optIn })
      }).then(function (res) {
        if (res.status === 429) { var e = new Error('limit'); e.limit = true; throw e; }
        if (res.status === 400) { return res.json().then(function (d) { var e = new Error('bad'); e.msg = d && d.error; throw e; }); }
        if (!res.ok) throw new Error('bad status');
        return res.json();
      }).then(function (data) {
        var answer = String((data && data.answer) || '').replace(/^#{1,6}\s*/gm, '').replace(/\*\*/g, '').replace(/^\s*[-*]\s+/gm, '• ').trim();
        if (!answer) throw new Error('empty');
        thinking.remove();
        addMessage(answer, 'ai');
        history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
        if (!toTeam) ls(false, todayKey(), String(usedToday() + 1));
        if (toTeam) { pendingTeam = null; emailEl.value = ''; optInEl.checked = false; }
      }).catch(function (err) {
        thinking.remove();
        if (toTeam && err && err.msg) {
          // the server rejected the email: go back to the email step with the reason
          humanMode = true;
          showContactStep(true);
          contactErr.textContent = err.msg;
          return;
        }
        if (toTeam) pendingTeam = null;
        addMessage(err && err.limit ? (toTeam ? HUMAN_LIMIT_MSG : LIMIT_MSG) : ERROR_MSG, 'ai');
      }).then(function () {
        busy = false;
        updateRemaining();
        if (!input.disabled) input.focus();
      });
    }

    // Show the saved conversation (and any reply from our team). since = 0 on first load.
    function loadThread(initial) {
      var c = getCid(false);
      if (!c) return;
      fetch('/api/empire-ai?cid=' + encodeURIComponent(c) + '&since=' + (initial ? 0 : lastAt))
        .then(function (r) { return r.ok ? r.json() : { messages: [] }; })
        .then(function (d) {
          var msgs = (d && d.messages) || [];
          if (!msgs.length) return;
          var seen = parseInt(ls(true, K_SEEN), 10) || 0, fresh = false;
          msgs.forEach(function (m) {
            if (m.at > lastAt) lastAt = m.at;
            if (initial) {
              if (m.role === 'user') { addMessage(m.text, 'user'); history.push({ role: 'user', content: m.text }); }
              else if (m.role === 'assistant') { addMessage(m.text, 'ai'); history.push({ role: 'assistant', content: m.text }); }
              else if (m.role === 'owner') { addTeam(m.text); }
            } else if (m.role === 'owner' && m.at > lastOwnerAt) {
              addTeam(m.text);
            }
            if (m.role === 'owner') {
              if (m.at > seen) fresh = true;
              if (m.at > lastOwnerAt) lastOwnerAt = m.at;
            }
          });
          if (initial && msgs.some(function (m) { return m.role === 'user'; })) chipsEl.hidden = true;
          if (fresh && !panel.classList.contains('open')) {
            fab.classList.add('has-reply');
            fab.setAttribute('aria-label', 'Open Empire AI chat. You have a new reply from our team.');
          }
          if (panel.classList.contains('open')) ls(false, K_SEEN, String(lastOwnerAt));
        }).catch(function () {});
    }
    function startPolling() {
      stopPolling();
      pollTimer = setInterval(function () { if (!document.hidden) loadThread(false); }, 45000);
    }
    function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

    var bubble = document.getElementById('eaiBubble');
    var bubbleTimer = null;
    var bubbleHideTimer = null;
    var K_BUBBLE_DISMISSED = 'empire_ai_bubble_dismissed';

    function hideBubble() {
      clearTimeout(bubbleTimer);
      clearTimeout(bubbleHideTimer);
      bubble.classList.remove('show');
      bubble.hidden = true;
    }
    function showBubble() {
      if (panel.classList.contains('open') || ls(true, K_DISABLED) === '1' || ls(true, K_BUBBLE_DISMISSED) === '1') return;
      bubble.hidden = false;
      void bubble.offsetWidth; // apply display first so the fade-in transition runs
      bubble.classList.add('show');
      bubbleHideTimer = setTimeout(hideBubble, 10000);
    }

    var fabLabel = document.getElementById('eaiFabLabel');
    var openedAt = 0;
    function openPanel() {
      hideBubble();
      openedAt = Date.now();
      panel.classList.add('open');
      fab.setAttribute('aria-expanded', 'true');
      fab.setAttribute('aria-label', 'Close Empire AI chat');
      if (fabLabel) fabLabel.textContent = 'Close chat';
      // The disclaimer is shown in the panel footer, so open straight to the chat.
      ls(false, K_ACCEPTED, '1');
      fab.classList.remove('has-reply');
      if (lastOwnerAt) ls(false, K_SEEN, String(lastOwnerAt));
      loadThread(false);
      startPolling();
      input.focus();
    }
    function closePanel() {
      stopPolling();
      setMenu(false);
      panel.classList.remove('open');
      fab.setAttribute('aria-expanded', 'false');
      fab.setAttribute('aria-label', 'Open Empire AI chat');
      if (fabLabel) fabLabel.textContent = 'Ask Empire AI';
      fab.focus();
    }
    function turnOff() {
      hideBubble();
      ls(false, K_DISABLED, '1');
      panel.classList.remove('open');
      fab.hidden = true;
      note.hidden = false;
    }

    // build UI
    addMessage(GREETING, 'ai');
    SUGGESTED.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'eai-chip';
      b.textContent = q;
      b.addEventListener('click', function () { ask(q); });
      chipsEl.appendChild(b);
    });
    updateRemaining();

    fab.addEventListener('click', function () {
      if (panel.classList.contains('open')) {
        if (Date.now() - openedAt < 600) return; // ignore a quick double-click so the chat doesn't flash shut
        closePanel();
      } else {
        openPanel();
      }
    });
    document.getElementById('eaiClose').addEventListener('click', closePanel);
    function sendPending(withEmail) {
      if (!pendingTeam || busy) return;
      var e = withEmail ? (emailEl.value || '').trim() : '';
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { contactErr.textContent = 'That email address does not look right. Fix it, or leave it blank.'; return; }
      ask(pendingTeam.text, { confirmed: true, email: e, optIn: withEmail && optInEl.checked });
    }
    document.getElementById('eaiContactSend').addEventListener('click', function () { sendPending(true); });
    document.getElementById('eaiContactSkip').addEventListener('click', function () { sendPending(false); });
    document.getElementById('eaiContactCancel').addEventListener('click', function () {
      if (pendingTeam && pendingTeam.el) pendingTeam.el.remove();
      pendingTeam = null; humanMode = false; showContactStep(false);
      input.placeholder = 'Ask about our apps, pricing or budgeting…';
      updateRemaining(); input.focus();
    });
    var menuBtn = document.getElementById('eaiMenuBtn'), menu = document.getElementById('eaiMenu');
    function setMenu(open) { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); }
    menuBtn.addEventListener('click', function (e) { e.stopPropagation(); setMenu(menu.hidden); });
    menu.addEventListener('click', function () { setMenu(false); });
    document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
    document.getElementById('eaiHuman').addEventListener('click', function () {
      humanMode = true;
      updateRemaining();
      input.placeholder = 'Write your message for our team…';
      addMessage("Okay! Type your message for our team below. They'll reply right here in this chat.", 'ai');
      input.focus();
    });
    document.getElementById('eaiDelete').addEventListener('click', function () {
      if (!confirm('Delete this chat from our servers and this browser?')) return;
      var c = getCid(false);
      if (c) fetch('/api/empire-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', cid: c }) }).catch(function () {});
      try { localStorage.removeItem(K_CID); localStorage.removeItem(K_SEEN); } catch (e) {}
      messagesEl.textContent = '';
      history = []; lastAt = 0; lastOwnerAt = 0; humanMode = false; pendingTeam = null; showContactStep(false); chipsEl.hidden = false;
      input.placeholder = 'Ask about our apps, pricing or budgeting…';
      fab.classList.remove('has-reply');
      addMessage(GREETING, 'ai');
      updateRemaining();
    });
    document.getElementById('eaiOff').addEventListener('click', turnOff);
    document.getElementById('eaiOn').addEventListener('click', function () {
      try { localStorage.removeItem(K_DISABLED); } catch (e) {}
      note.hidden = true;
      fab.hidden = false;
    });
    document.getElementById('eaiDisclaimerBtn').addEventListener('click', function () {
      ls(false, K_ACCEPTED, '1');
      disclaimer.classList.remove('show');
      input.focus();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
    // Enter sends; Shift+Enter adds a new line (the box is a two-line textarea so the hint text can wrap).
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.dispatchEvent(new Event('submit', { cancelable: true })); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { setMenu(false); return; }
      if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
    });

    document.getElementById('eaiBubbleText').addEventListener('click', function () { hideBubble(); openPanel(); });
    document.getElementById('eaiBubbleClose').addEventListener('click', function (e) {
      e.stopPropagation();
      ls(false, K_BUBBLE_DISMISSED, '1');
      hideBubble();
    });

    if (ls(true, K_DISABLED) === '1') {
      note.hidden = false;
    } else {
      fab.hidden = false;
      loadThread(true);
      if (isHome && ls(true, K_BUBBLE_DISMISSED) !== '1') bubbleTimer = setTimeout(showBubble, 3000);
    }
  }

  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/empire-ai.css';
  link.onload = boot;
  link.onerror = boot;
  document.head.appendChild(link);
})();
