// Progressive enhancement: Android visitors see Google Play first. The HTML already lists the App Store first, which
// suits iPhone and desktop, so without JavaScript nothing changes. Moves the DOM node (not CSS order) so the reading
// and focus order match what is on screen.
(function () {
  var ua = navigator.userAgentData ? navigator.userAgentData.platform : navigator.userAgent;
  if (!/android/i.test(ua || '')) return;
  var lists = document.querySelectorAll('.stores');
  for (var i = 0; i < lists.length; i++) {
    var play = lists[i].querySelector('[data-platform="android"]');
    if (play) lists[i].insertBefore(play, lists[i].firstChild);
  }
})();
