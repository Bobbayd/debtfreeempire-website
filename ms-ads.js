// Microsoft Advertising (UET tag 97279013) for the Empire Life Dashboard ad campaign.
// Loads Microsoft's script only after the visitor accepts advertising cookies. Declined, or a
// browser sending Global Privacy Control with no explicit choice, means nothing is sent to Microsoft.
// Store clicks send one Microsoft custom event, eld_store_click (label mac or windows). HeyCatch's own
// eld_store_click comes from goals.js and is separate; this file never touches it.
(function () {
  if (window.__dfeMsAds) return; // guard against the file being included twice
  window.__dfeMsAds = true;

  var TAG_ID = '97279013';
  var KEY = 'dfe_ad_consent'; // 'granted' | 'declined'
  var gpc = navigator.globalPrivacyControl === true;

  function getConsent() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function saveConsent(v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) {} }
  function granted() { return getConsent() === 'granted'; }

  var loaded = false;
  function loadUET() {
    if (loaded || !granted()) return;
    loaded = true;
    (function (w, d, t, r, u) {
      var f, n, i;
      w[u] = w[u] || [];
      f = function () {
        var o = { ti: TAG_ID, enableAutoSpaTracking: true };
        o.q = w[u]; w[u] = new UET(o); w[u].push('pageLoad');
      };
      n = d.createElement(t); n.src = r; n.async = 1;
      n.onload = n.onreadystatechange = function () {
        var s = this.readyState;
        if (!s || s === 'loaded' || s === 'complete') { f(); n.onload = n.onreadystatechange = null; }
      };
      i = d.getElementsByTagName(t)[0]; i.parentNode.insertBefore(n, i);
    })(window, document, 'script', 'https://bat.bing.com/bat.js', 'uetq');
  }

  // ---- consent banner (cream & gold) ----
  var banner;
  function buildBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'dfe-consent-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Advertising cookie choice');
    banner.hidden = true;
    banner.innerHTML =
      '<p class="dfe-cb-text">We use Microsoft Advertising cookies to measure how our ads perform. Nothing is sent unless you accept. ' +
      '<a href="/website-privacy#advertising">Privacy Policy</a></p>' +
      '<div class="dfe-cb-btns"><button type="button" class="dfe-cb-accept">Accept</button>' +
      '<button type="button" class="dfe-cb-decline">Decline</button></div>';
    var css = document.createElement('style');
    css.textContent =
      '#dfe-consent-banner{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:760px;margin:0 auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap;' +
      'background:#FFFDF9;color:#3D352E;border:1px solid #E4C590;border-top:3px solid #A8864F;border-radius:14px;padding:14px 18px;box-shadow:0 14px 34px rgba(61,53,46,.14);font-family:Montserrat,-apple-system,Arial,sans-serif}' +
      '#dfe-consent-banner[hidden]{display:none}' +
      '#dfe-consent-banner .dfe-cb-text{flex:1;min-width:220px;margin:0;font-size:14px;line-height:1.55}' +
      '#dfe-consent-banner a{color:#8E6F3E;font-weight:700}' +
      '#dfe-consent-banner .dfe-cb-btns{display:flex;gap:10px}' +
      '#dfe-consent-banner button{font:inherit;font-size:14px;font-weight:700;border-radius:10px;padding:9px 18px;cursor:pointer}' +
      '#dfe-consent-banner .dfe-cb-accept{background:#8E6F3E;color:#fff;border:1.5px solid #8E6F3E}' +
      '#dfe-consent-banner .dfe-cb-decline{background:#fff;color:#3D352E;border:1.5px solid #E4C590}' +
      '#dfe-consent-banner button:focus-visible{outline:2px solid #3D352E;outline-offset:2px}' +
      '@media (max-width:520px){#dfe-consent-banner .dfe-cb-btns{width:100%}#dfe-consent-banner button{flex:1}}';
    document.head.appendChild(css);
    document.body.appendChild(banner);
    banner.querySelector('.dfe-cb-accept').addEventListener('click', function () { choose('granted'); });
    banner.querySelector('.dfe-cb-decline').addEventListener('click', function () { choose('declined'); });
    return banner;
  }
  function showBanner() { buildBanner().hidden = false; }
  function hideBanner() { if (banner) banner.hidden = true; }
  function choose(v) {
    saveConsent(v);
    hideBanner();
    if (v === 'granted') loadUET();
    else if (loaded) location.reload(); // withdrawing consent: reload so Microsoft's script is no longer on the page
  }

  // ---- Microsoft custom event on store clicks (exactly one per click) ----
  var STORES = [
    { match: 'apps.apple.com/us/app/empire-life-dashboard', label: 'mac' },
    { match: 'apps.microsoft.com/detail/9NFTF14DSH6S', label: 'windows' }
  ];
  document.addEventListener('click', function (e) {
    if (!granted()) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    for (var i = 0; i < STORES.length; i++) {
      if ((a.href || '').indexOf(STORES[i].match) !== -1) {
        window.uetq = window.uetq || [];
        window.uetq.push('event', 'eld_store_click', { event_category: 'store', event_label: STORES[i].label });
        return;
      }
    }
  }, true);

  // ---- Privacy choices link (footer) ----
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('#dfe-privacy-choices') : null;
    if (!link) return;
    e.preventDefault();
    showBanner();
    var b = banner.querySelector(granted() ? '.dfe-cb-decline' : '.dfe-cb-accept');
    if (b) b.focus();
  });

  function start() {
    var c = getConsent();
    if (c === 'granted') loadUET();
    else if (!c && !gpc) showBanner(); // GPC with no explicit choice = treated as declined, no banner
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
