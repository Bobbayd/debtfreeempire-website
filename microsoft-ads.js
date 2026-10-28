/* Optional Microsoft Advertising measurement on the public app landing page only.
 * Never include this script in the apps, account pages, calculators or admin UI.
 */
(function () {
  'use strict';
  var key = 'dfe-microsoft-ads-consent-v1';
  var landing = '/apps/empire-life-dashboard';
  var path = location.pathname.replace(/\/$/, '');
  if (path !== landing && path !== '/website-privacy') return;
  var choice = null;
  var loading = false;
  var ready = false;
  var banner;
  var status;
  var previousFocus;
  var protectedBrowser = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  try {
    var saved = JSON.parse(localStorage.getItem(key));
    if (saved && Date.now() - saved.at < 180 * 86400000 &&
        (saved.value === 'accepted' || saved.value === 'rejected')) choice = saved.value;
  } catch (_) { /* Storage may be disabled; respect the choice for this page only. */ }
  if (protectedBrowser) choice = 'rejected';

  function permitted() { return choice === 'accepted' && !protectedBrowser; }
  function remember(value) {
    choice = value;
    try { localStorage.setItem(key, JSON.stringify({ value: value, at: Date.now() })); } catch (_) {}
  }
  function clearCookies() {
    ['_uetmsclkid', '_uetsid', '_uetvid'].forEach(function (name) {
      ['', '; domain=' + location.hostname, '; domain=.debtfreeempire.com'].forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; path=/' + domain + '; SameSite=Lax; Secure';
      });
    });
  }
  function hide() {
    banner.hidden = true;
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }
  function reject() {
    remember('rejected');
    if (window.uetq) window.uetq.push('consent', 'update', { ad_storage: 'denied' });
    clearCookies();
    hide();
    // Unload an already-loaded third-party tag after consent is withdrawn.
    if (loading) location.reload();
  }
  function start() {
    if (!permitted() || loading || path !== landing) return;
    loading = true;
    window.uetq = window.uetq || [];
    window.uetq.push('consent', 'default', { ad_storage: 'denied' });
    window.uetq.push('consent', 'update', { ad_storage: 'granted' });
    var script = document.createElement('script');
    script.src = 'https://bat.bing.net/bat.js';
    script.async = true;
    script.onload = function () {
      if (!permitted() || typeof window.UET !== 'function') return;
      window.uetq = new window.UET({ ti: '97279013', q: window.uetq, enableAutoSpaTracking: false });
      window.uetq.push('pageLoad');
      ready = true;
    };
    script.onerror = function () { ready = false; };
    document.head.appendChild(script);
  }
  function accept() {
    if (protectedBrowser) return;
    remember('accepted');
    hide();
    start();
  }
  function show() {
    previousFocus = document.activeElement;
    banner.hidden = false;
    status.textContent = protectedBrowser
      ? 'Your browser privacy signal is on. Microsoft advertising measurement stays off.'
      : 'Current choice: ' + (choice === 'accepted' ? 'allowed' : choice === 'rejected' ? 'not allowed' : 'not chosen') + '.';
    banner.querySelector('button').focus();
  }
  function makeChoiceUI() {
    var style = document.createElement('style');
    style.textContent = '.dfe-ads-choice{position:fixed;bottom:16px;left:16px;right:16px;max-width:680px;margin:auto;z-index:10000;background:#fffaf2;color:#382f26;border:1px solid #ab8950;border-radius:16px;padding:20px;box-shadow:0 6px 28px #382f2626;font:15px/1.5 system-ui,sans-serif;max-height:85vh;overflow:auto}.dfe-ads-choice[hidden]{display:none}.dfe-ads-choice h2{font-size:20px;margin:0 0 8px}.dfe-ads-choice p{margin:8px 0}.dfe-ads-choice a{color:#624714;text-decoration:underline}.dfe-ads-choice-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.dfe-ads-choice button,.dfe-ads-settings{font:inherit;cursor:pointer;border-radius:8px;padding:10px 16px;background:#fffaf2;color:#382f26;border:1px solid #80612f}.dfe-ads-choice button:focus-visible,.dfe-ads-settings:focus-visible{outline:3px solid #80612f;outline-offset:3px}.dfe-ads-choice button:disabled{opacity:.6;cursor:default}.dfe-ads-settings{margin:12px 6px;font-size:14px}.dfe-ads-choice-status{font-size:13px}';
    document.head.appendChild(style);
    banner = document.createElement('section');
    banner.className = 'dfe-ads-choice';
    banner.hidden = true;
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-labelledby', 'dfe-ads-choice-title');
    banner.innerHTML = '<h2 id="dfe-ads-choice-title">Optional advertising measurement</h2><p>May we use Microsoft Advertising cookies to measure visits to this app page and clicks to its app stores? Microsoft receives browser and device information and may use it for its own advertising services. Your app data is separate.</p><p>You can say no and still use the website. This choice only controls Microsoft measurement; <a href="/website-privacy#microsoft-advertising">read about all website analytics</a>.</p><p class="dfe-ads-choice-status" aria-live="polite"></p><div class="dfe-ads-choice-actions"><button type="button" data-choice="no">No thanks</button><button type="button" data-choice="yes">Allow Microsoft measurement</button></div>';
    status = banner.querySelector('.dfe-ads-choice-status');
    banner.querySelector('[data-choice="no"]').addEventListener('click', reject);
    var yes = banner.querySelector('[data-choice="yes"]');
    yes.disabled = protectedBrowser;
    yes.addEventListener('click', accept);
    document.body.appendChild(banner);
    var settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'dfe-ads-settings';
    settings.textContent = 'Microsoft ad privacy choices';
    settings.addEventListener('click', show);
    (document.querySelector('footer') || document.body).appendChild(settings);
    if (!choice && path === landing) show();
    start();
  }
  document.addEventListener('click', function (event) {
    if (!ready || !permitted() || path !== landing) return;
    var anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor) return;
    var url;
    try { url = new URL(anchor.href); } catch (_) { return; }
    var store = null;
    if (url.protocol !== 'https:') return;
    if (url.hostname === 'apps.microsoft.com' && /^\/detail\/9NFTF14DSH6S\/?$/i.test(url.pathname)) store = 'windows';
    if (url.hostname === 'apps.apple.com' && /\/id6816514942\/?$/.test(url.pathname)) store = 'mac';
    if (!store) return;
    // Fixed event values only: no link URLs, emails, form/chat contents or revenue.
    window.uetq.push('event', 'eld_store_click', {
      event_category: 'app_store', event_label: store
    });
  });
  window.addEventListener('storage', function (event) {
    if (event.key === key) location.reload();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeChoiceUI);
  else makeChoiceUI();
}());
