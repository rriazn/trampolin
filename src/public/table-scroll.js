// marks horizontally scrollable table cards so the css can fade the edge that has more content
(function () {
  function update(card) {
    var max = card.scrollWidth - card.clientWidth;
    card.classList.toggle('can-scroll-left', card.scrollLeft > 1);
    card.classList.toggle('can-scroll-right', max > 1 && card.scrollLeft < max - 1);
  }

  document.querySelectorAll('.table-card').forEach(function (card) {
    update(card);
    card.addEventListener('scroll', function () { update(card); }, { passive: true });
    if (window.ResizeObserver) {
      var observer = new ResizeObserver(function () { update(card); });
      observer.observe(card);
      // the table can grow without the card changing size, for example when the webfont swaps in
      var table = card.querySelector('table');
      if (table) observer.observe(table);
    }
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      document.querySelectorAll('.table-card').forEach(update);
    });
  }
})();
