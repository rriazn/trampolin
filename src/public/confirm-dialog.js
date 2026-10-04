// asks before submitting any form that carries data-confirm, using a modal instead of window.confirm
(function () {
  var modalEl = document.getElementById('confirmModal');
  if (!modalEl || !window.bootstrap) return;

  var modal = new window.bootstrap.Modal(modalEl);
  var message = document.getElementById('confirmModalMessage');
  var accept = document.getElementById('confirmModalAccept');
  var cancel = modalEl.querySelector('.modal-footer [data-bs-dismiss]');
  var pending = null;

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form.hasAttribute || !form.hasAttribute('data-confirm') || form.dataset.confirmed === 'true') return;
    event.preventDefault();
    pending = { form: form, submitter: event.submitter || null };
    message.textContent = form.getAttribute('data-confirm');
    modal.show();
  });

  accept.addEventListener('click', function () {
    if (!pending) return;
    var form = pending.form;
    var submitter = pending.submitter;
    pending = null;
    form.dataset.confirmed = 'true';
    modal.hide();
    if (form.requestSubmit) form.requestSubmit(submitter);
    else form.submit();
  });

  // focus cancel so a stray Enter never confirms a destructive action
  modalEl.addEventListener('shown.bs.modal', function () { cancel.focus(); });
  modalEl.addEventListener('hidden.bs.modal', function () { pending = null; });
})();
