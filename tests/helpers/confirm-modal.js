const { expect } = require('@playwright/test');

// the shared confirm modal rendered by the footer partial, used instead of window.confirm
const confirmModal = (page) => page.locator('#confirmModal');

const answerConfirm = async (page, buttonId) => {
  const modal = confirmModal(page);
  await expect(modal).toBeVisible();
  await modal.locator(buttonId).click();
};

const acceptConfirm = async (page) => {
  await answerConfirm(page, '#confirmModalAccept');
  await expect(confirmModal(page)).toBeHidden();
};

const cancelConfirm = async (page) => {
  await answerConfirm(page, '[data-bs-dismiss="modal"].btn-outline-secondary');
  await expect(confirmModal(page)).toBeHidden();
};

module.exports = { confirmModal, acceptConfirm, cancelConfirm };
