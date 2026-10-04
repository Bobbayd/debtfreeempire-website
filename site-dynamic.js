/* Admin-controlled site content: announcement bar, product overrides, "What's New" updates.
   One cached request to /api/site-content. If anything fails the page simply stays as authored. */
(function () {
  'use strict';

  // Mini rich text -> DOM (bold, italic, bullets). Builds nodes with textContent, so it can never inject HTML.
  function inline(parent, text) {
    function node(tag, t) { var e = document.createElement(tag); e.textContent = t; parent.appendChild(e); }
    text.split(/(\*\*[^*]+?\*\*)/).forEach(function (part) {
      var b = part.match(/^\*\*([^*]+?)\*\*$/);
      if (b) return node('strong', b[1]);
      part.split(/(\*[^*\s][^*]*\*)/).forEach(function (p) {
        var i = p.match(/^\*([^*\s][^*]*)\*$/);
        if (i) node('em', i[1]); else if (p) parent.appendChild(document.createTextNode(p));
      });
    });
  }
  function renderRich(text) {
    var frag = document.createDocumentFragment(), ul = null, para = null;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var b = line.match(/^\s*[-•]\s+(.*)$/);
      if (b) { para = null; if (!ul) { ul = document.createElement('ul'); frag.appendChild(ul); } var li = document.createElement('li'); inline(li, b[1]); ul.appendChild(li); }
      else if (!line.trim()) { ul = null; para = null; }
      else { ul = null; if (!para) { para = document.createElement('p'); frag.appendChild(para); } else para.appendChild(document.createElement('br')); inline(para, line); }
    });
    return frag;
  }
  window.DFE = { renderRich: renderRich };
  if (location.pathname.indexOf('/admin') === 0) return; // admin pages only borrow the renderer

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function css(text) { var s = document.createElement('style'); s.textContent = text; document.head.appendChild(s); }

  // ---------- Announcement bar ----------
  function contrast(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1A1A1A' : '#FFFFFF';
  }
  function announce(a) {
    if (!a || !a.message) return;
    var id = 'v1:' + a.message + '|' + a.link;
    if (store('dfe-ann-dismissed') === id) return;
    var root = document.documentElement, base = parseFloat(getComputedStyle(root).getPropertyValue('--quizbar-h')) || 0;
    var color = /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : '#FAF3E3', fg = contrast(color);
    css('#dfe-ann{position:' + (base ? 'fixed' : 'relative') + ';top:0;left:0;right:0;z-index:80;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;' +
      'padding:9px 44px 9px 16px;text-align:center;font:600 13px/1.4 Montserrat,-apple-system,Segoe UI,sans-serif;border-bottom:1px solid #E4C590;background:' + color + ';color:' + fg + '}' +
      '#dfe-ann a.dfe-ann-link{font-weight:800;text-decoration:underline;color:inherit;white-space:nowrap}' +
      '#dfe-ann button{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:0;background:none;color:inherit;font-size:22px;line-height:1;cursor:pointer;border-radius:6px}' +
      '#dfe-ann button:hover{background:rgba(0,0,0,.08)}#dfe-ann button:focus-visible{outline:2px solid currentColor}');
    var bar = document.createElement('div'); bar.id = 'dfe-ann'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Announcement');
    var span = document.createElement('span'); span.textContent = a.message; bar.appendChild(span);
    if (a.link) { var l = document.createElement('a'); l.className = 'dfe-ann-link'; l.href = a.link; l.textContent = a.linkText || 'Learn more'; bar.appendChild(l); }
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss announcement'); x.textContent = '×'; bar.appendChild(x);
    document.body.insertBefore(bar, document.body.firstChild);

    var shift = document.createElement('style'); document.head.appendChild(shift);
    function place() {
      if (!base) return;
      var h = bar.offsetHeight;
      root.style.setProperty('--quizbar-h', (base + h) + 'px');
      shift.textContent = '.quiz-bar{top:' + h + 'px!important;height:' + base + 'px!important}@media(max-width:560px){.quiz-bar{height:auto!important;min-height:' + base + 'px!important}}';
    }
    place(); window.addEventListener('resize', place);
    var ro = window.ResizeObserver ? new ResizeObserver(place) : null; if (ro) ro.observe(bar);
    x.addEventListener('click', function () {
      store('dfe-ann-dismissed', id); bar.remove(); shift.remove(); window.removeEventListener('resize', place); if (ro) ro.disconnect();
      if (base) root.style.setProperty('--quizbar-h', base + 'px');
    });
  }

  // ---------- Product overrides ----------
  var STATUS = { 'coming-soon': ['Coming Soon', 'soon'], live: ['Available', 'live'], sale: ['On Sale', 'live'] };
  function products(map) {
    var any = false;
    Object.keys(map || {}).forEach(function (id) {
      var cfg = map[id], cards = document.querySelectorAll('[data-product="' + id + '"]');
      [].forEach.call(cards, function (card) {
        any = true;
        var st = STATUS[cfg.status];
        if (st) {
          var el = card.querySelector('[data-p-status]');
          if (!el) { el = document.createElement('span'); el.className = 'p-status'; el.setAttribute('data-p-status', ''); card.insertBefore(el, card.firstChild); }
          el.hidden = false; el.textContent = cfg.status === 'sale' ? 'On Sale' : st[0];
          el.classList.remove('live', 'soon'); el.classList.add(st[1]); if (cfg.status === 'sale') el.classList.add('sale');
        }
        var btn = card.querySelector('[data-p-btn]');
        if (btn && cfg.cta) btn.textContent = cfg.cta;
        var price = card.querySelector('[data-p-price]');
        if (!price && cfg.price) {
          price = document.createElement('div'); price.className = 'p-price'; price.setAttribute('data-p-price', '');
          var ref = card.querySelector('[data-p-btn], .take-action-btn-row, a.take-action-btn'); ref && ref.parentNode === card ? card.insertBefore(price, ref) : card.appendChild(price);
        }
        if (price) { price.textContent = cfg.price || ''; price.hidden = !cfg.price; }
        if (cfg.isNew && !card.querySelector('.p-new')) { var n = document.createElement('span'); n.className = 'p-new'; n.textContent = 'NEW'; card.appendChild(n); }
        if (cfg.featured) {
          card.classList.add('p-featured');
          if (!card.querySelector('.p-feat-tag')) { var f = document.createElement('span'); f.className = 'p-feat-tag'; f.textContent = 'Featured'; card.appendChild(f); }
          if (card.parentNode && card.parentNode.firstElementChild !== card) card.parentNode.insertBefore(card, card.parentNode.firstElementChild);
        }
      });
    });
    if (any) css('[data-product]{position:relative}.p-price{font-size:20px;font-weight:800;margin:6px 0 10px}.p-status{display:inline-block;font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;padding:4px 10px;border-radius:20px;margin-bottom:10px}' +
      '.p-status.sale{background:#FAF3E3!important;color:#8E6F3E!important;border:1px solid #E4C590}.p-new{position:absolute;top:12px;right:12px;background:#C89B45;color:#fff;font-size:10px;font-weight:800;letter-spacing:1.2px;padding:4px 9px;border-radius:20px}' +
      '.p-featured{border-color:#C89B45!important;box-shadow:0 8px 24px rgba(200,155,69,.22)!important}.p-feat-tag{position:absolute;top:12px;left:12px;font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#8E6F3E}' +
      '');
  }

  // ---------- What's New ----------
  function fmtDate(d) { var x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' }); }
  function plain(t) { return String(t).replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1$2').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim(); }
  function updates(list) {
    if (!list || !list.length) return;
    var anchor = document.getElementById('how-it-works') || document.querySelector('main section:nth-of-type(2)');
    if (!anchor || document.getElementById('whats-new')) return;
    css('#whats-new{padding:64px 20px;text-align:center}#whats-new h2{font-family:"Cormorant Garamond",serif;font-size:34px;font-weight:600}' +
      '#whats-new .wn-line{width:60px;height:2px;background:#E4C590;margin:14px auto 28px}.wn-list{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:16px;text-align:left}' +
      '.wn-item{background:#fff;border:1px solid #DDD5E5;border-left:3px solid #E4C590;border-radius:12px;padding:20px 22px;box-shadow:0 4px 14px rgba(26,26,26,.05)}' +
      '.wn-date{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#C89B45}.wn-title{font-size:17px;font-weight:800;margin:4px 0 8px}' +
      '.wn-text{font-size:14.5px;line-height:1.75;color:#55515B}.wn-text p{margin-bottom:10px}.wn-text ul{padding-left:22px;margin-bottom:10px}' +
      '.wn-more{margin-top:8px;background:none;border:0;padding:6px 0;font:700 13px Montserrat,sans-serif;color:#725C9F;cursor:pointer}.wn-more:hover{text-decoration:underline}');
    var sec = document.createElement('section'); sec.id = 'whats-new'; sec.setAttribute('aria-labelledby', 'wnH');
    var h = document.createElement('h2'); h.id = 'wnH'; h.textContent = "What's New at Debt Free Empire"; sec.appendChild(h);
    var line = document.createElement('div'); line.className = 'wn-line'; sec.appendChild(line);
    var wrap = document.createElement('div'); wrap.className = 'wn-list'; sec.appendChild(wrap);
    list.forEach(function (u) {
      var item = document.createElement('article'); item.className = 'wn-item';
      var d = document.createElement('div'); d.className = 'wn-date'; d.textContent = fmtDate(u.date); item.appendChild(d);
      var t = document.createElement('h3'); t.className = 'wn-title'; t.textContent = u.title; item.appendChild(t);
      var txt = document.createElement('div'); txt.className = 'wn-text'; item.appendChild(txt);
      var p = plain(u.body), long = p.length > 150, preview = long ? p.slice(0, 150).replace(/\s+\S*$/, '') + '…' : p;
      function show(full) { txt.textContent = ''; if (full) txt.appendChild(renderRich(u.body)); else txt.textContent = preview; }
      show(!long); item.appendChild(txt);
      if (long) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'wn-more'; b.textContent = 'Read more'; b.setAttribute('aria-expanded', 'false');
        b.addEventListener('click', function () { var open = b.getAttribute('aria-expanded') !== 'true'; show(open); b.textContent = open ? 'Show less' : 'Read more'; b.setAttribute('aria-expanded', String(open)); });
        item.appendChild(b);
      }
      wrap.appendChild(item);
    });
    anchor.parentNode.insertBefore(sec, anchor);
  }

  fetch('/api/site-content').then(function (r) { return r.json(); }).then(function (c) {
    announce(c.announcement); products(c.products); updates(c.updates);
  }).catch(function () {});
})();
