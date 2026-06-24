const { test, expect } = require('@playwright/test');

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/admin/competitions');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    await request.post('/test/seed');
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    page.goto('/admin/competitions');
  });

  // Page structure

  test('shows the "Competitions" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Competitions' })).toBeVisible();
  });

  test('shows the subtitle', async ({ page }) => {
    await expect(page.getByText('Create and manage tournament events')).toBeVisible();
  });

  test('show the correct table columns', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Date' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  });

  // Competition list

  test('shows seeded planned competition in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Autumn Open' });
    await expect(row.getByRole('cell', { name: 'Autumn Open' })).toBeVisible();
    await expect(row.getByRole('cell', { name: '2026-09-15' })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'planned' })).toBeVisible();
    await expect(row.getByRole('link', { name: /Rounds/ })).toBeVisible();
    await expect(row.locator('a.btn-outline-secondary')).toBeVisible();   // edit link
    await expect(row.locator('button.btn-outline-danger')).toBeVisible(); // delete button
    await expect(row.getByRole('button', { name: /Activate/ })).toBeVisible();
    await expect(row.getByRole('button', { name: /Close/ })).not.toBeVisible();
  });

  test('shows seeded active competition in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Spring Cup' });
    await expect(row.getByRole('cell', { name: 'Spring Cup' })).toBeVisible();
    await expect(row.getByRole('cell', { name: '–' })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'active' })).toBeVisible();
    await expect(row.getByRole('link', { name: /Rounds/ })).toBeVisible();
    await expect(row.locator('a.btn-outline-secondary')).toBeVisible();   // edit link
    await expect(row.locator('button.btn-outline-danger')).toBeVisible(); // delete button
    await expect(row.getByRole('button', { name: /Close/ })).toBeVisible();
    await expect(row.getByRole('button', { name: /Activate/ })).not.toBeVisible();
  });

  test('shows seeded closed competition in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Winter Cup' });
    await expect(row.getByRole('cell', { name: 'Winter Cup' })).toBeVisible();
    await expect(row.getByRole('cell', { name: '2025-12-15' })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'closed' })).toBeVisible();
    await expect(row.getByRole('link', { name: /Rounds/ })).toBeVisible();
    await expect(row.locator('a.btn-outline-secondary')).toBeVisible();   // edit link
    await expect(row.locator('button.btn-outline-danger')).toBeVisible(); // delete button
    await expect(row.getByRole('button', { name: /Close/ })).not.toBeVisible();
    await expect(row.getByRole('button', { name: /Activate/ })).not.toBeVisible();
  });

  // Buttons

  test('New Competition button is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /New Competition/ })).toBeVisible();
  });

  // Button actions

    test('clicking "New Competition" navigates to the competition creation form', async ({ page }) => {
    await page.getByRole('link', { name: /New Competition/ }).click();
    await page.waitForURL('/admin/competitions/new');
  });

  test('clicking the edit link for a competition navigates to that competition\'s edit form', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Spring Cup' });
    await row.locator('a.btn-outline-secondary').click();
    await page.waitForURL(/\/admin\/competitions\/\d+\/edit/);
  });

  test('clicking the delete button for a competition shows a confirmation dialog', async ({ page }) => {
    let capturedDialog;
    page.once('dialog', dialog => {
      capturedDialog = dialog;
      dialog.dismiss();
    });
    const row = page.getByRole('row').filter({ hasText: 'Winter Cup' });
    await row.locator('button.btn-outline-danger').click();
    expect(capturedDialog).toBeDefined();
    expect(capturedDialog.type()).toBe('confirm');
    expect(capturedDialog.message()).toMatch(/Delete competition and ALL its data?/i);
  });

  test('dismissing the delete confirm keeps the competition in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Winter Cup' });
    page.once('dialog', dialog => dialog.dismiss());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).toBeVisible();
  });

  test('accepting the delete confirm removes the competition from the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Winter Cup' });
    page.once('dialog', dialog => dialog.accept());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).not.toBeVisible();
  });

  test('clicking the rounds link for a competition navigates to that competition\'s round page', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Spring Cup' });
    await row.getByRole('link', { name: /Rounds/ }).click();
    await page.waitForURL(/\/admin\/competitions\/\d+\/rounds/);
  });

  test('clicking the "Activate" button starts a planned competition', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Autumn Open' });
    await row.getByRole('button', { name: /Activate/ }).click();
    await expect(row).toBeVisible();
    await expect(row.getByRole('cell', { name: 'active' })).toBeVisible();
    await expect(row.getByRole('button', { name: /Close/ })).toBeVisible();
    await expect(row.getByRole('button', { name: /Activate/ })).not.toBeVisible();
  });

  test('clicking the "Close" button stops an active competition', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Spring Cup' });
    await row.getByRole('button', { name: /Close/ }).click();
    await expect(row).toBeVisible();
    await expect(row.getByRole('cell', { name: 'closed' })).toBeVisible();
    await expect(row.getByRole('button', { name: /Close/ })).not.toBeVisible();
    await expect(row.getByRole('button', { name: /Activate/ })).not.toBeVisible();
  });
});