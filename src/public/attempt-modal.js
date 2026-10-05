// fills the shared attempt dialog from the template of the button that opened it
(function () {
  var modalEl = document.getElementById('attemptModal');
  if (!modalEl) return;

  document.addEventListener('show.bs.modal', function (event) {
    if (event.target.id !== 'attemptModal' || !event.relatedTarget) return;
    var template = document.getElementById(event.relatedTarget.getAttribute('data-attempt-detail'));
    if (!template) return;
    document.getElementById('attemptModalTitle').textContent = template.getAttribute('data-title');
    var body = document.getElementById('attemptModalBody');
    body.replaceChildren(template.content.cloneNode(true));
  });
})();
