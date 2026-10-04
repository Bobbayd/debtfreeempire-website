/* Shared admin login/logout. Pages call Admin.init(loadFn); loadFn fetches the page's data and renders it. */
(function () {
  function $(id) { return document.getElementById(id); }
  function cell(tag, text, cls) { var e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; }
  function fmt(d) {
    if (!d) return 'Date not recorded';
    var x = new Date(d);
    return isNaN(x) ? d : x.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function getJson(url, opts) {
    return fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }
  function post(url, body) {
    return getJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  }

  // Unread-count badge on the Support tab, on every admin page.
  function badge() {
    getJson('/api/admin-content?r=badge').then(function (x) {
      var a = document.querySelector('.bar-nav a[href="/admin/support/"]');
      if (!a || !x.ok) return;
      var old = a.querySelector('.badge'); if (old) old.remove();
      if (x.j.unread > 0) a.appendChild(cell('span', String(x.j.unread), 'badge'));
    }).catch(function () {});
  }
  window.addEventListener('admin:badge', badge);

  function init(loadFn) {
    var login = $('loginCard'), app = $('app'), form = $('loginForm'), pw = $('pw'), msg = $('loginMsg'), btn = $('loginBtn'), logout = $('logoutBtn');

    function showLogin(text) {
      app.hidden = true; login.hidden = false; if (logout) logout.hidden = true; msg.textContent = text || '';
      pw.value = ''; pw.focus();
    }
    function showApp() { login.hidden = true; app.hidden = false; if (logout) logout.hidden = false; badge(); }

    function load() {
      return loadFn(getJson).then(function (state) {
        if (state === 'unauthorized') { showLogin(''); return; }
        showApp();
      }).catch(function () { showLogin('Could not reach the server.'); });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault(); msg.textContent = ''; btn.disabled = true; btn.textContent = 'Checking…';
      post('/api/admin-login', { password: pw.value }).then(function (x) {
        if (!x.ok) { msg.textContent = (x.j && x.j.error) || 'Something went wrong.'; return; }
        pw.value = ''; return load();
      }).catch(function () { msg.textContent = 'Could not reach the server.'; })
        .then(function () { btn.disabled = false; btn.textContent = 'Log in'; });
    });

    if (logout) logout.addEventListener('click', function () {
      post('/api/admin-logout').then(function () { showLogin('You are logged out.'); });
    });

    load();
  }

  function get(r) { return getJson('/api/admin-content?r=' + r); }
  function act(r, body) { return post('/api/admin-content', Object.assign({ r: r }, body)); }
  function btn(text, cls, fn) { var b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.className = cls; b.addEventListener('click', fn); return b; }
  function say(el) { return function (t) { el.textContent = t; clearTimeout(el._t); el._t = setTimeout(function () { el.textContent = ''; }, 5000); }; }
  window.Admin = { init: init, cell: cell, fmt: fmt, get: get, act: act, btn: btn, say: say };
})();
