// Turns the "coming soon" Mac and iPhone/iPad badges into working links once a store URL is saved in the admin Store links page.
(function () {
  var map = { mac: ['macAppStoreUrl', 'Mac · available now', 'Download Empire Life Dashboard on the Mac App Store'], ios: ['iosAppStoreUrl', 'iPhone & iPad · available now', 'Download Empire Life Dashboard on the App Store for iPhone and iPad'] };
  var items = document.querySelectorAll('.eld-badge-item[data-store]');
  if (!items.length || !window.fetch) return;
  fetch('/api/site-config').then(function (r) { return r.json(); }).then(function (c) {
    items.forEach(function (el) {
      var m = map[el.getAttribute('data-store')], u = c && m && c[m[0]];
      if (!u || u.indexOf('https://apps.apple.com/') !== 0) return;
      var wrap = el.querySelector('.eld-badge-img'), img = wrap && wrap.querySelector('img');
      if (!img) return;
      var a = document.createElement('a');
      a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', m[2]);
      a.appendChild(img); wrap.replaceWith(a);
      el.classList.remove('is-soon');
      var cap = el.querySelector('.eld-badge-cap'); if (cap) cap.textContent = m[1];
    });
  }).catch(function () {});
})();
