// Microsoft Advertising (UET tag 97279013) for the Empire Life Dashboard ad campaign.
// The only Microsoft tag on the site. Loaded on the Empire Life Dashboard page (tag + store events)
// and on the website privacy page (choice banner only, never the tag).
// - Microsoft's script loads only after the visitor accepts.
// - Global Privacy Control or Do Not Track keep Microsoft measurement off, always.
// - Each Mac App Store / Microsoft Store click sends exactly one Microsoft custom event, eld_store_click
//   (label mac or windows). HeyCatch's own eld_store_click comes from goals.js and is separate.
// - The footer "Privacy choices" link (#dfe-privacy-choices) reopens the banner at any time.
(function () {
  'use strict';
  if (window.__dfeMsAds) return; // guard against double inclusion
  window.__dfeMsAds = true;

  var TAG_ID = '97279013';
  var KEY = 'dfe_ad_consent';           // stored as {"value":"granted"|"declined","at":ms}
  var MAX_AGE = 180 * 86400000;         // re-ask after 180 days
  var LANDING = '/apps/empire-life-dashboard';
  var path = location.pathname.replace(/\/$/, '');
  var onLanding = path === LANDING;
  var protectedBrowser = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';

  function readChoice() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      if (raw === 'granted' || raw === 'declined') return raw; // early format
      var s = JSON.parse(raw);
      if (s && (s.value === 'granted' || s.value === 'declined') && Date.now() - s.at < MAX_AGE) return s.value;
    } catch (e) {}
    return null;
  }
  var choice = protectedBrowser ? 'declined' : readChoice();
  function remember(v) {
    choice = v;
    try { localStorage.setItem(KEY, JSON.stringify({ value: v, at: Date.now() })); } catch (e) {}
  }
  function permitted() { return choice === 'granted' && !protectedBrowser; }

  function clearCookies() {
    ['_uetmsclkid', '_uetsid', '_uetvid'].forEach(function (name) {
      ['', '; domain=' + location.hostname, '; domain=.debtfreeempire.com'].forEach(function (d) {
        document.cookie = name + '=; Max-Age=0; path=/' + d + '; SameSite=Lax; Secure';
      });
    });
  }

  var loaded = false;
  function loadUET() {
    if (loaded || !onLanding || !permitted()) return;
    loaded = true;
    window.uetq = window.uetq || [];
    window.uetq.push('consent', 'default', { ad_storage: 'denied' });
    window.uetq.push('consent', 'update', { ad_storage: 'granted' });
    var s = document.createElement('script');
    s.src = 'https://bat.bing.com/bat.js';
    s.async = true;
    s.onload = function () {
      if (!permitted() || typeof window.UET !== 'function') return;
      window.uetq = new window.UET({ ti: TAG_ID, q: window.uetq, enableAutoSpaTracking: true });
      window.uetq.push('pageLoad');
    };
    document.head.appendChild(s);
  }

  // ---- choice banner (cream & gold) ----
  var banner, statusEl, prevFocus;
  function buildBanner() {
    if (banner) return banner;
    var css = document.createElement('style');
    css.textContent =
      '#dfe-consent-banner{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:760px;margin:0 auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap;' +
      'background:#FFFDF9;color:#3D352E;border:1px solid #E4C590;border-top:3px solid #A8864F;border-radius:14px;padding:14px 18px;box-shadow:0 14px 34px rgba(61,53,46,.14);font-family:Montserrat,-apple-system,Arial,sans-serif}' +
      '#dfe-consent-banner[hidden]{display:none}' +
      '#dfe-consent-banner .dfe-cb-text{flex:1;min-width:220px;margin:0;font-size:14px;line-height:1.55}' +
      '#dfe-consent-banner .dfe-cb-status{display:block;font-size:12.5px;color:#7A7066;margin-top:4px}' +
      '#dfe-consent-banner a{color:#8E6F3E;font-weight:700}' +
      '#dfe-consent-banner .dfe-cb-btns{display:flex;gap:10px}' +
      '#dfe-consent-banner button{font:inherit;font-size:14px;font-weight:700;border-radius:10px;padding:9px 18px;cursor:pointer}' +
      '#dfe-consent-banner .dfe-cb-accept{background:#8E6F3E;color:#fff;border:1.5px solid #8E6F3E}' +
      '#dfe-consent-banner .dfe-cb-accept:disabled{opacity:.5;cursor:default}' +
      '#dfe-consent-banner .dfe-cb-decline{background:#fff;color:#3D352E;border:1.5px solid #E4C590}' +
      '#dfe-consent-banner button:focus-visible{outline:2px solid #3D352E;outline-offset:2px}' +
      '@media (max-width:520px){#dfe-consent-banner .dfe-cb-btns{width:100%}#dfe-consent-banner button{flex:1}}';
    document.head.appendChild(css);
    banner = document.createElement('div');
    banner.id = 'dfe-consent-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Microsoft advertising cookie choice');
    banner.hidden = true;
    banner.innerHTML =
      '<p class="dfe-cb-text">We use Microsoft Advertising cookies to measure how our ads perform. Nothing is sent unless you accept. ' +
      '<a href="/website-privacy#microsoft-advertising">Privacy Policy</a><span class="dfe-cb-status" aria-live="polite"></span></p>' +
      '<div class="dfe-cb-btns"><button type="button" class="dfe-cb-accept">Accept</button>' +
      '<button type="button" class="dfe-cb-decline">Decline</button></div>';
    statusEl = banner.querySelector('.dfe-cb-status');
    var acc = banner.querySelector('.dfe-cb-accept');
    acc.disabled = protectedBrowser;
    acc.addEventListener('click', function () { choose('granted'); });
    banner.querySelector('.dfe-cb-decline').addEventListener('click', function () { choose('declined'); });
    document.body.appendChild(banner);
    return banner;
  }
  function showBanner(focus) {
    prevFocus = document.activeElement;
    buildBanner().hidden = false;
    statusEl.textContent = protectedBrowser
      ? 'Your browser privacy signal is on, so Microsoft measurement stays off.'
      : (choice ? 'Current choice: ' + (choice === 'granted' ? 'accepted' : 'declined') + '.' : '');
    if (focus) { var b = banner.querySelector(permitted() ? '.dfe-cb-decline' : '.dfe-cb-accept:not(:disabled)') || banner.querySelector('.dfe-cb-decline'); b.focus(); }
  }
  function hideBanner() {
    if (banner) banner.hidden = true;
    if (prevFocus && prevFocus.isConnected && prevFocus.id === 'dfe-privacy-choices') prevFocus.focus();
  }
  function choose(v) {
    if (v === 'granted' && protectedBrowser) return;
    var wasLoaded = loaded;
    remember(v);
    hideBanner();
    if (v === 'granted') { loadUET(); return; }
    if (window.uetq && wasLoaded) { try { window.uetq.push('consent', 'update', { ad_storage: 'denied' }); } catch (e) {} }
    clearCookies();
    if (wasLoaded) location.reload(); // withdrawing consent: reload so Microsoft's script is gone
  }

  // ---- one Microsoft custom event per store click ----
  var STORES = [
    { host: 'apps.apple.com', test: /\/id6816514942\/?$/, label: 'mac' },
    { host: 'apps.microsoft.com', test: /^\/detail\/9NFTF14DSH6S\/?$/i, label: 'windows' }
  ];
  document.addEventListener('click', function (e) {
    if (!onLanding || !loaded || !permitted()) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var u; try { u = new URL(a.href); } catch (err) { return; }
    for (var i = 0; i < STORES.length; i++) {
      if (u.hostname === STORES[i].host && STORES[i].test.test(u.pathname)) {
        // Fixed values only: no URLs, emails, form or chat contents.
        window.uetq.push('event', 'eld_store_click', { event_category: 'app_store', event_label: STORES[i].label });
        return;
      }
    }
  }, true);

  // ---- footer "Privacy choices" link ----
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('#dfe-privacy-choices') : null;
    if (!link) return;
    e.preventDefault();
    showBanner(true);
  });

  // A choice made in another tab applies here too.
  window.addEventListener('storage', function (e) { if (e.key === KEY) location.reload(); });

  function start() {
    if (permitted()) loadUET();
    else if (onLanding && !choice) showBanner(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
