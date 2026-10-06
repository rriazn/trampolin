// fills the shared attempt dialog from the template of the button that opened it
(function () {
  // delegated on document, live refresh can add the dialog after the page loaded empty
  document.addEventListener('show.bs.modal', function (event) {
    if (event.target.id !== 'attemptModal' || !event.relatedTarget) return;
    var title = document.getElementById('attemptModalTitle');
    var body = document.getElementById('attemptModalBody');
    var template = document.getElementById(event.relatedTarget.getAttribute('data-attempt-detail'));
    // a missing template must not leave the previous athlete in the dialog
    title.textContent = template ? template.getAttribute('data-title') : '';
    body.textContent = '';
    if (template) body.appendChild(template.content.cloneNode(true));
  });
})();
