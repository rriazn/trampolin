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
    if (window.ResizeObserver) new ResizeObserver(function () { update(card); }).observe(card);
  });
})();
