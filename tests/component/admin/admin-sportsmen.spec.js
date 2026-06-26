const { test, expect } = require('@playwright/test');

let seed;

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/admin/competitions/1/sportsmen');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    page.goto(`/admin/competitions/${seed.competitionId}/sportsmen`);
  });

  // Page Structure

  test('shows the "Athletes" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Athletes' })).toBeVisible();
  });

  test('shows the competition name as subtitle', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Spring Cup' })).toBeVisible();
  });

  test('show the correct table columns', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Athlete' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Club' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Routine' })).toBeVisible();
  });

  // Sportsmen List

  test('shows seeded sportsman in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Alice' });
    await expect(row.getByRole('cell', { name: 'Alice' })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'Test Club' })).toBeVisible();
    await expect(row.locator('a.btn-outline-secondary')).toBeVisible();   // edit link
    await expect(row.locator('button.btn-outline-danger')).toBeVisible(); // delete button
  });

  // Buttons

  test('Import Excel button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Import Excel/ })).toBeVisible();
  });

  test('Export Excel button is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Export Excel/ })).toBeVisible();
  });

  test('Add Athlete button is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Add Athlete/ })).toBeVisible();
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

  test('clicking "Add Athlete" navigates to the sportsmen creation form', async ({ page }) => {
    await page.getByRole('link', { name: /Add Athlete/ }).click();
    await page.waitForURL(`/admin/competitions/${seed.competitionId}/sportsmen/new`);
  });

  test('clicking the edit link for an athlete navigates to that athletes\'s edit form', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Alice' });
    await row.locator('a.btn-outline-secondary').click();
    await page.waitForURL(/\/admin\/competitions\/\d+\/sportsmen\/\d+\/edit/);
  });

  test('clicking the delete button for an athlete shows a confirmation dialog', async ({ page }) => {
    let capturedDialog;
    page.once('dialog', dialog => {
      capturedDialog = dialog;
      dialog.dismiss();
    });
    const row = page.getByRole('row').filter({ hasText: 'Alice' });
    await row.locator('button.btn-outline-danger').click();
    expect(capturedDialog).toBeDefined();
    expect(capturedDialog.type()).toBe('confirm');
    expect(capturedDialog.message()).toMatch(/Delete Alice/i);
  });

  test('dismissing the delete confirm keeps the athlete in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Alice' });
    page.once('dialog', dialog => dialog.dismiss());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).toBeVisible();
  });

  test('accepting the delete confirm removes the athlete from the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Bob' });
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
    await expect(page).toHaveURL(`/admin/competitions/${seed.competitionId}/sportsmen`);
  });

  test('submitting the form with a file shows a success message', async ({ page }) => {
    await page.getByRole('button', { name: /Import Excel/ }).click();
    const form = page.locator('#uploadForm');
    const filePath = 'tests/component/fixtures/users-import-empty.xlsx';
    await form.locator('input[type=file]').setInputFiles(filePath);
    await form.getByRole('button', { name: /Upload/ }).click();
    await expect(page.getByText('Import complete: 0 added, 0 skipped (missing name).')).toBeVisible();
  });

  test('submitting the form with a file adds the athletes to the list and skips athletes without name', async ({ page }) => {
    await page.getByRole('button', { name: /Import Excel/ }).click();
    const form = page.locator('#uploadForm');
    const filePath = 'tests/component/fixtures/sportsmen-import.xlsx';
    await form.locator('input[type=file]').setInputFiles(filePath);
    await form.getByRole('button', { name: /Upload/ }).click();
    await expect(page.getByText('Import complete: 1 added, 1 skipped (missing name).')).toBeVisible();
    const newAthleteRow = page.getByRole('row').filter({ hasText: 'Charlie' });
    await expect(newAthleteRow.getByRole('cell', { name: 'Charlie' })).toBeVisible();
    await expect(newAthleteRow.getByRole('cell', { name: 'Test Club 3' })).toBeVisible();
  });

  test('submitting an invalid file skips all rows', async ({ page }) => {
    await page.getByRole('button', { name: /Import Excel/ }).click();
    const form = page.locator('#uploadForm');
    const filePath = 'tests/component/fixtures/users-import-invalid.xlsx';
    await form.locator('input[type=file]').setInputFiles(filePath);
    await form.getByRole('button', { name: /Upload/ }).click();
    await expect(page.getByText('Import complete: 0 added, 2 skipped (missing name).')).toBeVisible();
  });

  test('submitting a non-Excel file skips all rows', async ({ page }) => {
    await page.getByRole('button', { name: /Import Excel/ }).click();
    const form = page.locator('#uploadForm');
    const filePath = 'tests/component/fixtures/users-import.txt';
    await form.locator('input[type=file]').setInputFiles(filePath);
    await form.getByRole('button', { name: /Upload/ }).click();
    await expect(page.getByText('Import complete: 0 added, 2 skipped (missing name).')).toBeVisible();
  });
});
