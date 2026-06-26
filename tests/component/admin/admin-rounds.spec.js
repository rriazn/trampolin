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
  const res = await request.get('/admin/competitions/1/groups/1/rounds');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    page.goto(`/admin/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds`);
  });

  // Page structure

  test('shows the "Rounds" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Rounds' })).toBeVisible();
  });

  test('shows the competition name and group as subtitle', async ({ page }) => {
    await expect(page.getByText('Group A · Spring Cup')).toBeVisible();
  });

  test('show the correct table columns', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Order' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Round Name' })).toBeVisible();
  });

  test('show the "Add Round" section header', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Add Round' })).toBeVisible();
  });

  test('show the "Add Round" input fields', async ({ page }) => {
    await expect(page.locator('input[name=name]')).toBeVisible();
    await expect(page.locator('input[name=round_order]')).toBeVisible();
  });

  // Buttons

  test('Add Round button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add/ })).toBeVisible();
  });

  // Round List

  test('shows seeded round in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Qualifications' });
    await expect(row.getByRole('cell', { name: '1' })).toBeVisible();
    await expect(row.getByRole('link', { name: /Entries/ })).toBeVisible();
    await expect(row.getByRole('link', { name: /Leaderboard/ })).toBeVisible();
    await expect(row.locator('button.btn-outline-danger')).toBeVisible(); // delete button
  });

  // Button actions

  test('clicking the entries link for a round navigates to that round\'s entries page', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Qualifications' });
    await row.getByRole('link', { name: /Entries/ }).click();
    await page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds\/\d+\/entries/);
  });

  test('clicking the leaderboard link for a round navigates to that round\'s leaderboard', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Qualifications' });
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      row.getByRole('link', { name: /Leaderboard/ }).click(),
    ]);
    await newPage.waitForURL(/\/leaderboard\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
  });

  test('clicking the delete button for a round shows a confirmation dialog', async ({ page }) => {
    let capturedDialog;
    page.once('dialog', dialog => {
      capturedDialog = dialog;
      dialog.dismiss();
    });
    const row = page.getByRole('row').filter({ hasText: 'Qualifications' });
    await row.locator('button.btn-outline-danger').click();
    expect(capturedDialog).toBeDefined();
    expect(capturedDialog.type()).toBe('confirm');
    expect(capturedDialog.message()).toMatch(/Delete round and all entries\/scores\?/i);
  });

  test('dismissing the delete confirm keeps the round in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Qualifications' });
    page.once('dialog', dialog => dialog.dismiss());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).toBeVisible();
  });

  test('accepting the delete confirm removes the round from the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Qualifications' });
    page.once('dialog', dialog => dialog.accept());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).not.toBeVisible();
  });

  test('adding a round with valid input adds the round to the list', async ({ page }) => {
    await page.locator('input[name=name]').fill('Test Round');
    await page.locator('input[name=round_order]').fill('5');
    await page.locator('button[type=submit]').click();
    const row = page.getByRole('row').filter({ hasText: 'Test Round' });
    await expect(row.getByRole('cell', { name: '5' })).toBeVisible();
  });

  test('submitting a round form without name shows a validation error', async ({ page }) => {
    await page.locator(`form[action="/admin/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds"]`).evaluate(form => form.setAttribute('novalidate', ''));
    await page.locator('button[type=submit]').click();
    await expect(page.locator('.alert.alert-danger')).toContainText('Round name is required.');
  });

  test('submitting a round form with whitespace-only name shows an inline error', async ({ page }) => {
    await page.locator('input[name=name]').fill('   ');
    await page.locator('button[type=submit]').click();
    await expect(page.locator('.alert.alert-danger')).toContainText('Round name is required.');
  });

  test('added rounds get shown in the correct order', async ({ page }) => {
    await page.locator('input[name=name]').fill('Round C');
    await page.locator('input[name=round_order]').fill('30');
    await page.locator('button[type=submit]').click();

    await page.locator('input[name=name]').fill('Round A');
    await page.locator('input[name=round_order]').fill('10');
    await page.locator('button[type=submit]').click();

    await page.locator('input[name=name]').fill('Round B');
    await page.locator('input[name=round_order]').fill('20');
    await page.locator('button[type=submit]').click();

    const rowTexts = await page.locator('tbody tr').allTextContents();
    const idxA = rowTexts.findIndex(t => t.includes('Round A'));
    const idxB = rowTexts.findIndex(t => t.includes('Round B'));
    const idxC = rowTexts.findIndex(t => t.includes('Round C'));

    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });
});