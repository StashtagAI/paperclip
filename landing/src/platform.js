// Progressive enhancement only: without JavaScript the page reads the same and the waitlist form posts normally.
(function () {
  var ua = navigator.userAgentData ? navigator.userAgentData.platform : navigator.userAgent;
  var android = /android/i.test(ua || '');
  // iPadOS reports itself as a Mac; touch support gives it away.
  var ios = !android && (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

  // Android visitors see Google Play first. The HTML already lists the App Store first, which suits iPhone and
  // desktop. Moves the DOM node (not CSS order) so the reading and focus order match what is on screen.
  if (android) {
    var lists = document.querySelectorAll('.stores');
    for (var i = 0; i < lists.length; i++) {
      var play = lists[i].querySelector('[data-platform="android"]');
      if (play) lists[i].insertBefore(play, lists[i].firstChild);
    }
  }

  // Waitlist (HAN-100): preselect the visitor's phone, pass on utm_* from the URL, and submit without leaving the page.
  var params = new URLSearchParams(location.search);
  var forms = document.querySelectorAll('form.waitlist');
  for (var f = 0; f < forms.length; f++) enhance(forms[f]);

  function enhance(form) {
    var guess = form.querySelector('input[name="platform"][value="' + (android ? 'android' : ios ? 'ios' : '') + '"]');
    if (guess && guess.type === 'radio') guess.checked = true;
    params.forEach(function (value, key) {
      if (!/^utm_(source|medium|campaign|term|content)$/.test(key) || form.elements[key]) return;
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value.slice(0, 100);
      form.appendChild(input);
    });
    if (!window.fetch) return;

    var email = form.querySelector('input[name="email"]');
    var button = form.querySelector('button[type="submit"]');
    var fields = form.querySelector('.waitlist-fields');
    var msg = form.querySelector('.waitlist-msg');
    var busy = false;
    var say = function (key) { msg.textContent = form.getAttribute('data-' + key); };

    email.addEventListener('input', function () { email.removeAttribute('aria-invalid'); });
    // The submit event only fires once the browser's own checks (required, type="email") pass.
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;
      busy = true;
      button.setAttribute('aria-disabled', 'true');
      say('sending');
      fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams(new FormData(form)),
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            return res.ok && body.ok ? 'done' : body.error === 'invalid_email' ? 'invalid' : body.error === 'rate_limited' ? 'limited' : 'failed';
          });
        }, function () { return 'failed'; })
        .then(function (result) {
          busy = false;
          button.removeAttribute('aria-disabled');
          say(result);
          if (result === 'done') {
            // The fields go away, so move focus to the confirmation rather than lose it.
            fields.hidden = true;
            msg.focus();
          } else if (result === 'invalid') {
            email.setAttribute('aria-invalid', 'true');
            email.focus();
          }
        });
    });
  }
})();
