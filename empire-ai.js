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
    <div class="eai-title">Empire AI ⚡</div>
    <button type="button" class="eai-close" id="eaiClose" aria-label="Close Empire AI chat">×</button>
  </div>
  <div class="eai-messages" id="eaiMessages" role="log" aria-live="polite"></div>
  <div class="eai-chips" id="eaiChips"></div>
  <p class="eai-privacy-note" id="eaiPrivacyNote">Please don't enter passwords, account numbers or other personal information.</p>
  <form class="eai-form" id="eaiForm" autocomplete="off">
    <label for="eaiInput" style="position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0);">Ask Empire AI a question</label>
    <input class="eai-input" id="eaiInput" type="text" maxlength="500" placeholder="Ask about building your empire…" />
    <button class="eai-send" id="eaiSend" type="submit">Send</button>
  </form>
  <div class="eai-footer">
    <span class="eai-remaining" id="eaiRemaining"></span>
    <button type="button" class="eai-off-btn" id="eaiOff">Turn off Empire AI</button>
    <span class="eai-disclaimer" style="display:block; margin-top:2px;">Not legal or tax advice. For informational purposes only.</span>
    <span class="eai-powered">Powered by Claude</span>
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

    function ls(get, key, val) {
      try { return get ? localStorage.getItem(key) : localStorage.setItem(key, val); } catch (e) { return null; }
    }
    function todayKey() {
      var d = new Date();
      return 'empire_ai_count_' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
    function usedToday() { return parseInt(ls(true, todayKey()), 10) || 0; }
    function remaining() { return Math.max(0, DAILY_LIMIT - usedToday()); }

    function updateRemaining() {
      var left = remaining();
      remainingEl.textContent = left > 0
        ? left + ' of ' + DAILY_LIMIT + ' questions left today'
        : "You've used all " + DAILY_LIMIT + ' questions for today';
      var off = busy || left === 0;
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

    function addThinking() {
      var el = document.createElement('div');
      el.className = 'eai-msg ai';
      el.innerHTML = 'Empire AI is thinking <span class="eai-thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function ask(question) {
      question = (question || '').trim();
      if (!question || busy) return;
      if (looksSensitive(question)) { input.value = ''; addMessage(SENSITIVE_MSG, 'ai'); return; }
      if (remaining() === 0) { addMessage(LIMIT_MSG, 'ai'); updateRemaining(); return; }

      addMessage(question, 'user');
      input.value = '';
      busy = true;
      updateRemaining();
      var thinking = addThinking();

      fetch('/api/empire-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question, history: history.slice(-6) })
      }).then(function (res) {
        if (res.status === 429) { var e = new Error('limit'); e.limit = true; throw e; }
        if (!res.ok) throw new Error('bad status');
        return res.json();
      }).then(function (data) {
        var answer = String((data && data.answer) || '').replace(/^#{1,6}\s*/gm, '').replace(/\*\*/g, '').replace(/^\s*[-*]\s+/gm, '• ').trim();
        if (!answer) throw new Error('empty');
        thinking.remove();
        addMessage(answer, 'ai');
        history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
        ls(false, todayKey(), String(usedToday() + 1));
      }).catch(function (err) {
        thinking.remove();
        addMessage(err && err.limit ? LIMIT_MSG : ERROR_MSG, 'ai');
      }).then(function () {
        busy = false;
        updateRemaining();
        if (!input.disabled) input.focus();
      });
    }

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
      input.focus();
    }
    function closePanel() {
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
    document.addEventListener('keydown', function (e) {
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
