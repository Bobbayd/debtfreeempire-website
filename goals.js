// HeyCatch goal event: fires "eld_store_click" when a visitor clicks through to get
// Empire Life Dashboard (Mac App Store or Microsoft Store). This is the one conversion
// the HeyCatch funnel counts. Same SDK URL as the page snippet, so it shares that instance.
import { analytics } from 'https://esm.sh/@heycatch/sdk@0.8.3';

// ---------------------------------------------------------------------------
// Shared helpers. Every event carries the visitor's general device type and operating system so
// "visited but did not download" can be compared with what is actually installable on that device
// (Empire Life Dashboard is Windows and Mac only; the iPhone version is not out yet).
// Nothing personal is collected: no text the visitor types, no query strings, no names or emails.
// ---------------------------------------------------------------------------
function deviceInfo() {
  var ua = navigator.userAgent || '';
  var touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS reports a Mac user agent
  var os = /iPhone|iPad|iPod/.test(ua) || touchMac ? 'ios'
    : /Android/.test(ua) ? 'android'
    : /Windows/.test(ua) ? 'windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'mac'
    : /CrOS/.test(ua) ? 'chromeos'
    : /Linux/.test(ua) ? 'linux' : 'other';
  var device = /iPad|Tablet/.test(ua) || touchMac || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet'
    : /Mobi|iPhone|Android.*Mobile/.test(ua) ? 'mobile' : 'desktop';
  return { device: device, os: os };
}
function track(name, props) {
  if (/^(eld_store_click|pp_store_click)$/.test(name) || (name === 'pp_cta_click' && /app\.paperandprosperity\.shop/.test((props || {}).destination || ''))) window.__dfeClickedDownload = true;
  var data = Object.assign({ page: location.pathname }, deviceInfo(), props || {});
  // Test switch: set localStorage dfe_track_test=1 to record events in window.__dfeEvents instead of sending them.
  try {
    if (localStorage.getItem('dfe_track_test') === '1') { (window.__dfeEvents = window.__dfeEvents || []).push({ name: name, props: data }); return; }
  } catch (err) {}
  try { analytics.trackEvent(name, data); } catch (err) {}
}
window.dfeTrack = track; // lets other scripts (Empire AI) report events without loading the SDK twice
var HOST = location.hostname.replace(/^www\./, '');
function placement(el) {
  var sec = el.closest ? el.closest('[id], section, header, footer, nav') : null;
  if (!sec) return 'unknown';
  return String(sec.id || (sec.className && String(sec.className).split(' ')[0]) || sec.tagName.toLowerCase()).slice(0, 40);
}

var STORES = [
  { match: 'apps.apple.com/us/app/empire-life-dashboard', store: 'mac_app_store' },
  { match: 'apps.microsoft.com/detail/9NFTF14DSH6S', store: 'microsoft_store' }
];

document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!a) return;
  var href = a.href || '';
  for (var i = 0; i < STORES.length; i++) {
    if (href.indexOf(STORES[i].match) !== -1) {
      try {
        track('eld_store_click', { store: STORES[i].store, placement: placement(a) });
      } catch (err) {}
      return;
    }
  }
}, true);

// Site-wide: clicks on links to the Empire Life Dashboard page or its stores (e.g. from articles).
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!a) return;
  var href = a.href || '';
  var toEld = (a.hostname.replace(/^www\./, '') === 'debtfreeempire.com' && a.pathname.indexOf('/apps/empire-life-dashboard') === 0);
  var toStore = STORES.some(function (s) { return href.indexOf(s.match) !== -1; });
  if (!toEld && !toStore) return;
  try {
    track('article_cta_click', { destination: href });
  } catch (err) {}
}, true);

// Site-wide: clicks on links to Paper & Prosperity (its page or the web app), tracked separately from Empire.
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!a) return;
  var host = a.hostname.replace(/^www\./, '');
  var toPP = (host === 'debtfreeempire.com' && a.pathname.indexOf('/paper-and-prosperity') === 0) || host === 'app.paperandprosperity.shop';
  if (!toPP) return;
  try {
    track('pp_cta_click', { destination: a.href, placement: placement(a) });
  } catch (err) {}
}, true);

// ELD page: scroll depth milestones, each fired once per page load.
if (location.pathname.indexOf('empire-life-dashboard') !== -1) {
  var fired = {};
  var onScroll = function () {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    var pct = (window.scrollY / scrollable) * 100;
    [25, 50, 75, 100].forEach(function (d) {
      if (pct >= d - 0.5 && !fired[d]) {
        fired[d] = true;
        track('eld_scroll_depth', { depth: d });
      }
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Notify Me form: the page posts to /api/waitlist; fire waitlist_signup when the response is ok.
var nativeFetch = window.fetch;
window.fetch = function (input) {
  var p = nativeFetch.apply(this, arguments);
  try {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/waitlist') !== -1) {
      p.then(function (res) {
        if (res && res.ok) track('waitlist_signup');
      }).catch(function () {});
    }
  } catch (err) {}
  return p;
};

// ---------------------------------------------------------------------------
// NEW: Paper & Prosperity store clicks (App Store, Google Play). Same idea as eld_store_click, so both
// apps can be compared. (Clicks to the web app are already counted by pp_cta_click above.)
// ---------------------------------------------------------------------------
var PP_STORES = [
  { match: 'apps.apple.com/us/app/paper-prosperity', store: 'app_store' },
  { match: 'play.google.com/store/apps/details?id=com.paperandprosperity', store: 'google_play' }
];
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!a) return;
  var href = a.href || '';
  for (var i = 0; i < PP_STORES.length; i++) {
    if (href.indexOf(PP_STORES[i].match) !== -1) { track('pp_store_click', { store: PP_STORES[i].store, placement: placement(a) }); return; }
  }
}, true);

// ---------------------------------------------------------------------------
// NEW: the two app pages, where people decide whether to download. Only what helps answer "why not?":
// where they came from, whether they are on a device that can install, and how far they got.
// ---------------------------------------------------------------------------
var path = location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
var APP = path === '/apps/empire-life-dashboard' ? 'empire_life_dashboard'
  : path === '/paper-and-prosperity' ? 'paper_and_prosperity' : '';
if (APP) {
  var d = deviceInfo();
  // Where did they come from? Category only; for visits inside the site, just the page path.
  var ref = document.referrer, refType = 'direct', fromPath = '';
  if (ref) {
    try {
      var ru = new URL(ref), rh = ru.hostname.replace(/^www\./, '');
      if (rh === HOST) { refType = 'internal'; fromPath = ru.pathname.slice(0, 80); }
      else if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave)\./.test(rh)) refType = 'search';
      else if (/(facebook|instagram|tiktok|x\.com|twitter|t\.co|linkedin|youtube|pinterest|reddit)/.test(rh)) refType = 'social';
      else refType = 'other:' + rh.slice(0, 40);
    } catch (err) {}
  }
  // Empire Life Dashboard installs only on Windows and Mac, so a phone visit cannot convert today.
  var props = { app: APP, referrer_type: refType, from_path: fromPath };
  if (APP === 'empire_life_dashboard') props.can_install = d.os === 'windows' || d.os === 'mac';
  track('app_page_view', props);
  // One optional question, shown at most once per app after ~20 seconds (see survey.js).
  import('/survey.js').then(function (m) { m.start({ app: APP, device: d.device, os: d.os, ref: refType, canInstall: props.can_install }); }).catch(function () {});

  // How far down they got (halfway and the bottom, once each).
  var seen = {};
  var onAppScroll = function () {
    var doc = document.documentElement, scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    var pct = (window.scrollY / scrollable) * 100;
    [50, 100].forEach(function (m) { if (pct >= m - 0.5 && !seen[m]) { seen[m] = true; track('app_scroll_depth', { app: APP, depth: m }); } });
  };
  window.addEventListener('scroll', onAppScroll, { passive: true });
  onAppScroll();
}

// Homepage only: which sections people actually reach (each fires once per visit) and how far down they scroll.
// Helps decide what to keep, cut or move. Nothing personal is collected.
(function () {
  var path = location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
  if (path !== '') return;
  var ids = ['how-it-works', 'debt-free-moment', 'apps', 'fit', 'guides', 'founder', 'faq', 'newsletter'];
  var seenSec = {}, seenDepth = {};
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !seenSec[en.target.id]) { seenSec[en.target.id] = true; track('home_section_view', { section: en.target.id }); io.unobserve(en.target); }
      });
    }, { threshold: 0.35 });
    ids.forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }
  var onHomeScroll = function () {
    var doc = document.documentElement, scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    var pct = (window.scrollY / scrollable) * 100;
    [25, 50, 75, 100].forEach(function (m) { if (pct >= m - 0.5 && !seenDepth[m]) { seenDepth[m] = true; track('home_scroll_depth', { depth: m }); } });
  };
  window.addEventListener('scroll', onHomeScroll, { passive: true });
})();
