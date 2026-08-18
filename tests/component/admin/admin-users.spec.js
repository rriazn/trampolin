const { test, expect } = require('@playwright/test');
const xlsxFixtures = require('../fixtures/xlsx');

let seed;

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/admin/users');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/users');
  });

  // Page structure

  test('shows the "Referees & Admins" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Referees & Admins' })).toBeVisible();
  });

  test('shows the subtitle', async ({ page }) => {
    await expect(page.getByText('Manage user accounts and access')).toBeVisible();
  });

  test('show the correct table columns', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Role' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Created' })).toBeVisible();
  });

  // User list

  test('shows seeded referee in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Referee One' });
    await expect(row.getByRole('cell', { name: 'Referee One' })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'referee1@test.com' })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'Referee', exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: seed.referee1.created_at })).toBeVisible();
    await expect(row.locator('a.btn-outline-secondary')).toBeVisible();   // edit link
    await expect(row.locator('button.btn-outline-danger')).toBeVisible(); // delete button
  });

  test('shows seeded admin in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Test Admin' });
    await expect(row.getByRole('cell', { name: 'Test Admin' })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'admin@test.com' })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'Admin', exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: seed.admin.created_at })).toBeVisible();
    await expect(row.locator('a.btn-outline-secondary')).toBeVisible();   // edit link
    await expect(row.locator('button.btn-outline-danger')).toBeVisible(); // delete button
  });

  test('shows a head_judge user with a gold "Head Judge" badge', async ({ page }) => {
    await page.goto('/admin/users/new');
    await page.locator('input[name=name]').fill('Badge Head Judge');
    await page.locator('input[name=email]').fill('badgeheadjudge@test.com');
    await page.locator('input[name=password]').fill('secret123');
    await page.locator('select[name=role]').selectOption('head_judge');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL('/admin/users');

    const row = page.getByRole('row').filter({ hasText: 'Badge Head Judge' });
    const badge = row.locator('.badge');
    await expect(badge).toHaveText('Head Judge');
    await expect(badge).toHaveClass(/bg-gold/);
  });

  // Buttons

  test('Import Excel button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Import Excel/ })).toBeVisible();
  });

  test('Export Excel button is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Export Excel/ })).toBeVisible();
  });

  test('Add User button is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Add User/ })).toBeVisible();
  });

  // Button actions

  test('clicking "Import Excel" shows the upload form', async ({ page }) => {
    const panel = page.locator('#uploadForm');
    await expect(panel).not.toHaveClass(/show/);
    await page.getByRole('button', { name: /Import Excel/ }).click();
    await expect(panel).toHaveClass(/show/);
  });

  test('clicking "Export Excel" initiates a file download', async ({ page }) => {
    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: /Export Excel/ }).click()
    ]);
  });

  test('clicking "Add User" navigates to the user creation form', async ({ page }) => {
    await page.getByRole('link', { name: /Add User/ }).click();
    await page.waitForURL('/admin/users/new');
  });

  test('clicking the edit link for a user navigates to that user\'s edit form', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Referee One' });
    await row.locator('a.btn-outline-secondary').click();
    await page.waitForURL(/\/admin\/users\/\d+\/edit/);
  });

  test('clicking the delete button for a user shows a confirmation dialog', async ({ page }) => {
    let capturedDialog;
    page.once('dialog', dialog => {
      capturedDialog = dialog;
      dialog.dismiss();
    });
    const row = page.getByRole('row').filter({ hasText: 'Referee One' });
    await row.locator('button.btn-outline-danger').click();
    expect(capturedDialog).toBeDefined();
    expect(capturedDialog.type()).toBe('confirm');
    expect(capturedDialog.message()).toMatch(/Delete user/i);
  });

  test('dismissing the delete confirm keeps the user in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Referee One' });
    page.once('dialog', dialog => dialog.dismiss());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).toBeVisible();
  });

  test('accepting the delete confirm removes the user from the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Referee One' });
    page.once('dialog', dialog => dialog.accept());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).not.toBeVisible();
  });

  // Import Excel form

  test('form has a file input and submit button', async ({ page }) => {
    await page.getByRole('button', { name: /Import Excel/ }).click();
    const form = page.locator('#uploadForm');
    await expect(form.locator('input[type=file]')).toBeVisible();
    await expect(form.getByRole('button', { name: /Upload/ })).toBeVisible();
  });

  test('submitting the form with no file stays on the page', async ({ page }) => {
    await page.getByRole('button', { name: /Import Excel/ }).click();
    const form = page.locator('#uploadForm');
    await form.getByRole('button', { name: /Upload/ }).click();
    await expect(page).toHaveURL('/admin/users');
  });

  test('submitting the form with a file shows a success message', async ({ page }) => {
    await page.getByRole('button', { name: /Import Excel/ }).click();
    const form = page.locator('#uploadForm');
    await form.locator('input[type=file]').setInputFiles(xlsxFixtures.importEmpty());
    await form.getByRole('button', { name: /Upload/ }).click();
    await expect(page.getByText('Import complete: 0 added, 0 skipped (duplicate/invalid).')).toBeVisible();
  });

  test('submitting the form with a file adds the users to the list and skips duplicates', async ({ page }) => {
    await page.getByRole('button', { name: /Import Excel/ }).click();
    const form = page.locator('#uploadForm');
    await form.locator('input[type=file]').setInputFiles(xlsxFixtures.usersImport());
    await form.getByRole('button', { name: /Upload/ }).click();
    await expect(page.getByText('Import complete: 1 added, 1 skipped (duplicate/invalid).')).toBeVisible();
    const newUserRow = page.getByRole('row').filter({ hasText: 'Referee Six' });
    await expect(newUserRow.getByRole('cell', { name: 'Referee Six' })).toBeVisible();
    await expect(newUserRow.getByRole('cell', { name: 'referee6@test.com' })).toBeVisible();
  });

  test('submitting an invalid file skips all rows', async ({ page }) => {
    await page.getByRole('button', { name: /Import Excel/ }).click();
    const form = page.locator('#uploadForm');
    await form.locator('input[type=file]').setInputFiles(xlsxFixtures.importInvalid());
    await form.getByRole('button', { name: /Upload/ }).click();
    await expect(page.getByText('Import complete: 0 added, 2 skipped (duplicate/invalid).')).toBeVisible();
  });

  test('submitting a non-Excel file is rejected', async ({ page }) => {
    await page.getByRole('button', { name: /Import Excel/ }).click();
    const form = page.locator('#uploadForm');
    await form.locator('input[type=file]').setInputFiles(xlsxFixtures.nonExcelFile());
    await form.getByRole('button', { name: /Upload/ }).click();
    await expect(page.getByText('Invalid file type. Please upload an Excel file.')).toBeVisible();
  });
});