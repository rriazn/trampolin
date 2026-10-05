// polls the current page and swaps only the [data-live] regions, so open modals and typed input survive
(function () {
  var INTERVAL_MS = 10000;
  var lastHtml = null;
  // server html per region, the live dom is not comparable because bootstrap changes it
  var lastRegionHtml = {};
  var announcer = document.createElement('div');
  announcer.className = 'visually-hidden';
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  document.body.appendChild(announcer);

  // screen readers hear a short message when a region changed, the swap itself is silent
  function announce(message) {
    if (!message) return;
    // clearing first makes a repeated message count as a change
    announcer.textContent = '';
    window.setTimeout(function () { announcer.textContent = message; }, 100);
  }

  function userIsBusy() {
    if (document.hidden) return true;
    if (document.querySelector('.modal.show')) return true;
    var el = document.activeElement;
    return !!el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
  }

  function focusables(region) {
    return Array.prototype.slice.call(region.querySelectorAll('a[href], button, [tabindex]'));
  }

  // replaces a region and puts keyboard focus back on the same control, so the swap does not drop it
  function swapRegion(region, html) {
    var active = document.activeElement;
    var index = active && region.contains(active) ? focusables(region).indexOf(active) : -1;
    region.innerHTML = html;
    if (index < 0) return;
    var target = focusables(region)[index];
    if (target) target.focus({ preventScroll: true });
  }

  // a reload is only for a lost session or a page that is gone, a gateway error or rate limit just retries
  function shouldReload(res) {
    return res.redirected || [401, 403, 404].indexOf(res.status) !== -1;
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
        if (shouldReload(res)) {
          if (!userIsBusy()) window.location.reload();
          return null;
        }
        return res.ok ? res.text() : null;
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
          var serverHtml = fresh[name].innerHTML;
          if (serverHtml === lastRegionHtml[name]) return;
          lastRegionHtml[name] = serverHtml;
          swapRegion(current[name], serverHtml);
          announce(current[name].getAttribute('data-live-announce'));
        });
      })
      .catch(function () { /* offline, try again on the next tick */ });
  }

  var initial = liveRegions(document);
  Object.keys(initial).forEach(function (name) { lastRegionHtml[name] = initial[name].innerHTML; });

  markUpdated();
  window.setInterval(refresh, INTERVAL_MS);
})();
