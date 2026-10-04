// polls the current page and swaps only the [data-live] regions, so open modals and typed input survive
(function () {
  var INTERVAL_MS = 10000;
  var lastHtml = null;

  function userIsBusy() {
    if (document.hidden) return true;
    if (document.querySelector('.modal.show')) return true;
    var el = document.activeElement;
    return !!el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
  }

  function liveRegions(root) {
    var map = {};
    root.querySelectorAll('[data-live]').forEach(function (node) {
      map[node.getAttribute('data-live')] = node;
    });
    return map;
  }

  // shows when the page last reached the server, in the viewer's own clock and language
  function markUpdated() {
    var node = document.querySelector('[data-live-updated]');
    if (!node) return;
    node.textContent = ' · ' + new Date().toLocaleTimeString(document.documentElement.lang || undefined);
    node.classList.remove('d-none');
  }

  function refresh() {
    if (userIsBusy()) return Promise.resolve();
    // no-cache revalidates with the ETag, so an unchanged page costs the server no body transfer
    return fetch(window.location.href, { credentials: 'same-origin', cache: 'no-cache', headers: { Accept: 'text/html' } })
      .then(function (res) {
        // a redirect means the session ended or the page moved, so load whatever the server now wants
        if (res.redirected || !res.ok) {
          window.location.reload();
          return null;
        }
        return res.text();
      })
      .then(function (html) {
        if (html === null) return;
        markUpdated();
        if (userIsBusy() || html === lastHtml) return;
        lastHtml = html;
        var fresh = liveRegions(new DOMParser().parseFromString(html, 'text/html'));
        var current = liveRegions(document);
        var names = Object.keys(current);
        // a changed key means the page state moved on (next athlete, round completed), forms on it would be stale
        var stale = names.some(function (name) {
          return !fresh[name] || fresh[name].getAttribute('data-live-key') !== current[name].getAttribute('data-live-key');
        });
        if (stale) {
          window.location.reload();
          return;
        }
        names.forEach(function (name) {
          if (fresh[name].innerHTML !== current[name].innerHTML) {
            current[name].innerHTML = fresh[name].innerHTML;
          }
        });
      })
      .catch(function () { /* offline, try again on the next tick */ });
  }

  markUpdated();
  window.setInterval(refresh, INTERVAL_MS);
})();
