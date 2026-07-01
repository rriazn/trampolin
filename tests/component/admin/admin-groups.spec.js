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
  const res = await request.get('/admin/competitions/1/groups');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    page.goto(`/admin/competitions/${seed.competitionId}/groups`);
  });

  // Page structure

  test('shows the "Groups" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
  });

  test('shows the competition name and status badge as subtitle', async ({ page }) => {
    await expect(page.locator('.page-hero p').filter({ hasText: 'Spring Cup' })).toBeVisible();
    await expect(page.locator('.page-hero .badge')).toContainText('active');
  });

  test('shows the "Add Group" section header', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Add Group' })).toBeVisible();
  });

  test('has a group name input and Add button', async ({ page }) => {
    await expect(page.locator('input[name=name]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Add/ })).toBeVisible();
  });

  test('shows the "Athletes" button', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Athletes/ })).toBeVisible();
  });

  // Group list

  test('shows the seeded group in the list', async ({ page }) => {
    await expect(page.getByRole('cell', { name: /Group A/ })).toBeVisible();
  });

  test('shows the round count badge for each group', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Group A' });
    await expect(row.locator('.badge')).toContainText('1 round');
  });

  test('shows a "Rounds" link for each group', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Group A' });
    await expect(row.getByRole('link', { name: /Rounds/ })).toBeVisible();
  });

  test('shows a delete button for each group', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Group A' });
    await expect(row.locator('button.btn-outline-danger')).toBeVisible();
  });

  test('shows the correct table columns', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Group Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Rounds' })).toBeVisible();
  });

  // Button actions

  test('"Athletes" button navigates to the sportsmen page', async ({ page }) => {
    await page.getByRole('link', { name: /Athletes/ }).click();
    await page.waitForURL(`/admin/competitions/${seed.competitionId}/sportsmen`);
  });

  test('"Rounds" link navigates to the rounds page for that group', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Group A' });
    await row.getByRole('link', { name: /Rounds/ }).click();
    await page.waitForURL(`/admin/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds`);
  });

  test('delete button shows a confirmation dialog', async ({ page }) => {
    let capturedDialog;
    page.once('dialog', dialog => { capturedDialog = dialog; dialog.dismiss(); });
    const row = page.getByRole('row').filter({ hasText: 'Group A' });
    await row.locator('button.btn-outline-danger').click();
    expect(capturedDialog).toBeDefined();
    expect(capturedDialog.type()).toBe('confirm');
    expect(capturedDialog.message()).toMatch(/Delete group and all its rounds and scores\?/i);
  });

  test('dismissing the delete confirm keeps the group in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Group A' });
    page.once('dialog', dialog => dialog.dismiss());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).toBeVisible();
  });

  // Breadcrumbs

  test('"Competitions" breadcrumb navigates to the competitions list', async ({ page }) => {
    await page.locator('.breadcrumb').getByRole('link', { name: 'Competitions' }).click();
    await page.waitForURL('/admin/competitions');
  });

  // Mutations last

  test('adding a group adds it to the list', async ({ page }) => {
    await page.locator('input[name=name]').fill('Senior Men');
    await page.locator('input[name=abbreviation]').fill('SM');
    await page.locator('button[type=submit]').click();
    await expect(page.getByRole('cell', { name: /Senior Men/ })).toBeVisible();
  });

  test('new group starts with a "0 rounds" badge', async ({ page }) => {
    await page.locator('input[name=name]').fill('New Group');
    await page.locator('input[name=abbreviation]').fill('NG');
    await page.locator('button[type=submit]').click();
    const row = page.getByRole('row').filter({ hasText: 'New Group' });
    await expect(row.locator('.badge')).toContainText('0 rounds');
  });

  test('submitting with an empty name shows a validation error', async ({ page }) => {
    const form = page.locator(`form[action="/admin/competitions/${seed.competitionId}/groups"]`);
    await form.evaluate(f => f.setAttribute('novalidate', ''));
    await page.locator('input[name=abbreviation]').fill('XX');
    await page.locator('button[type=submit]').click();
    await expect(page.locator('.alert.alert-danger')).toContainText('Group name is required.');
  });

  test('submitting with an empty abbreviation shows a validation error', async ({ page }) => {
    const form = page.locator(`form[action="/admin/competitions/${seed.competitionId}/groups"]`);
    await form.evaluate(f => f.setAttribute('novalidate', ''));
    await page.locator('input[name=name]').fill('Some Group');
    await page.locator('button[type=submit]').click();
    await expect(page.locator('.alert.alert-danger')).toContainText('Group abbreviation is required.');
  });

  test('submitting a duplicate abbreviation shows a validation error', async ({ page }) => {
    await page.locator('input[name=name]').fill('Duplicate Group');
    await page.locator('input[name=abbreviation]').fill('GA');
    await page.locator('button[type=submit]').click();
    await expect(page.locator('.alert.alert-danger')).toContainText('already used by another group');
  });

  test('accepting the delete confirm removes the group from the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Group A' });
    page.once('dialog', dialog => dialog.accept());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).not.toBeVisible();
  });
});
