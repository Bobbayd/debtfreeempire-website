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
