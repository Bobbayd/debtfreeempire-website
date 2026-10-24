// Email signup box at the end of each blog post. Posts the address to /api/waitlist and records which post it came from.
(function () {
  var boxes = document.querySelectorAll('.post-signup');
  if (!boxes.length) return;
  var slug = location.pathname.replace(/\/+$/, '').split('/').pop().toLowerCase().replace(/[^a-z0-9\-]/g, '').slice(0, 70);
  Array.prototype.forEach.call(boxes, function (box) {
    var form = box.querySelector('form'), msg = box.querySelector('.post-signup-msg'), btn = box.querySelector('button');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.elements.email.value.trim();
      msg.className = 'post-signup-msg'; msg.textContent = '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.classList.add('err'); msg.textContent = 'Please enter a valid email address.'; return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch('/api/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, list: 'newsletter', source: 'blog:' + slug, website: form.elements.website ? form.elements.website.value : '' })
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) throw new Error(x.j && x.j.error ? x.j.error : 'fail');
          form.hidden = true; msg.classList.add('ok'); msg.textContent = "You're in! Check your inbox for your free Cash Envelope Budget Kit.";
          try { if (window.dfeTrack) window.dfeTrack('newsletter_signup', { source: 'blog' }); } catch (err) { /* analytics is optional */ }
        })
        .catch(function (err) {
          btn.disabled = false; btn.textContent = 'Send me the kit';
          msg.classList.add('err'); msg.textContent = (err && err.message && err.message !== 'fail') ? err.message : 'Something went wrong. Please try again.';
        });
    });
  });
})();
