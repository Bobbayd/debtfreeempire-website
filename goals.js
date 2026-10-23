// HeyCatch goal event: fires "eld_store_click" when a visitor clicks through to get
// Empire Life Dashboard (Mac App Store or Microsoft Store). This is the one conversion
// the HeyCatch funnel counts. Same SDK URL as the page snippet, so it shares that instance.
import { analytics } from 'https://esm.sh/@heycatch/sdk@0.8.3';

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
        analytics.trackEvent('eld_store_click', { store: STORES[i].store, page: location.pathname });
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
    analytics.trackEvent('article_cta_click', { destination: href, page: location.pathname });
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
    analytics.trackEvent('pp_cta_click', { destination: a.href, page: location.pathname });
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
        try { analytics.trackEvent('eld_scroll_depth', { depth: d }); } catch (err) {}
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
        if (res && res.ok) analytics.trackEvent('waitlist_signup', { page: location.pathname });
      }).catch(function () {});
    }
  } catch (err) {}
  return p;
};
