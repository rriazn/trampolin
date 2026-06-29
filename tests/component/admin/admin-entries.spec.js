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
  const res = await request.get('/admin/competitions/1/groups/1/rounds/1/entries');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    page.goto(`/admin/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}/entries`);
  });

  // Page structure

  test('shows the "Entries" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Entries' })).toBeVisible();
  });

  test('shows the "Add Entry" section header', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Add Entry' })).toBeVisible();
  });

  test('has Athlete and Start# input fields', async ({ page }) => {
    await expect(page.locator('select[name=sportsman_id]')).toBeVisible();
    await expect(page.locator('input[name=start_order]')).toBeVisible();
  });

  test('shows the correct table columns', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Start #' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Athlete' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Club' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Attempts' })).toBeVisible();
  });

  test('shows the seeded entry in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Alice' });
    await expect(row).toBeVisible();
    await expect(row.getByText('Test Club')).toBeVisible();
    await expect(row.getByText('0 attempts')).toBeVisible();
  });

  test('has a "Create All Attempts" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Create All Attempts/ })).toBeVisible();
  });

  test('has an "Add" button', async ({ page }) => {
    const addForm = page.locator('form').filter({ has: page.locator('select[name=sportsman_id]') });
    await expect(addForm.getByRole('button', { name: /Add/ })).toBeVisible();
  });

  test('has an "Add All" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add All/ })).toBeVisible();
  });

  test('does not show rank prefixes or a "ranked by" label when it is the first round', async ({ page }) => {
    await expect(page.locator('label').filter({ hasText: /ranked by/i })).not.toBeVisible();
    const firstOption = page.locator('select[name=sportsman_id] option').first();
    await expect(firstOption).not.toContainText('#');
  });

  test('has a "Leaderboard" link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Leaderboard/ })).toBeVisible();
  });

  // Button actions

  test('clicking the Leaderboard link opens it in a new tab', async ({ page }) => {
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      page.getByRole('link', { name: /Leaderboard/ }).click(),
    ]);
    await newPage.waitForURL(/\/leaderboard\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
  });

  test('clicking the delete button shows a confirmation dialog', async ({ page }) => {
    let capturedDialog;
    page.once('dialog', dialog => {
      capturedDialog = dialog;
      dialog.dismiss();
    });
    const row = page.getByRole('row').filter({ hasText: 'Alice' });
    await row.locator('button.btn-outline-danger').click();
    expect(capturedDialog).toBeDefined();
    expect(capturedDialog.type()).toBe('confirm');
    expect(capturedDialog.message()).toMatch(/Remove this entry and all its scores\?/i);
  });

  test('dismissing the delete confirm keeps the entry in the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Alice' });
    page.once('dialog', dialog => dialog.dismiss());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).toBeVisible();
  });

  test('clicking "Create All Attempts" shows a confirmation dialog', async ({ page }) => {
    let capturedDialog;
    page.once('dialog', dialog => {
      capturedDialog = dialog;
      dialog.dismiss();
    });
    await page.getByRole('button', { name: /Create All Attempts/ }).click();
    expect(capturedDialog).toBeDefined();
    expect(capturedDialog.type()).toBe('confirm');
    expect(capturedDialog.message()).toMatch(/Create attempts for all entries\?/i);
  });

  // Breadcrumbs

  test('"Competitions" breadcrumb navigates to the competitions list', async ({ page }) => {
    await page.locator('.breadcrumb').getByRole('link', { name: 'Competitions' }).click();
    await page.waitForURL('/admin/competitions');
  });

  test('competition name breadcrumb navigates to the groups page', async ({ page }) => {
    await page.locator('.breadcrumb').getByRole('link', { name: 'Spring Cup' }).click();
    await page.waitForURL(`/admin/competitions/${seed.competitionId}/groups`);
  });

  test('group name breadcrumb navigates to the rounds page', async ({ page }) => {
    await page.locator('.breadcrumb').getByRole('link', { name: 'Group A' }).click();
    await page.waitForURL(`/admin/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds`);
  });

  // Mutations last to avoid breaking earlier tests that rely on seed state

  test('adding an entry adds the athlete to the list', async ({ page }) => {
    await page.locator('select[name=sportsman_id]').selectOption(String(seed.sportsmanId2));
    const addForm = page.locator('form').filter({ has: page.locator('select[name=sportsman_id]') });
    await addForm.getByRole('button', { name: /Add/ }).click();
    const row = page.getByRole('row').filter({ hasText: 'Bob' });
    await expect(row).toBeVisible();
    await expect(row.getByText('Test Club 2')).toBeVisible();
  });

  test('accepting the delete confirm removes the entry from the list', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Alice' });
    page.once('dialog', dialog => dialog.accept());
    await row.locator('button.btn-outline-danger').click();
    await expect(row).not.toBeVisible();
  });

  test('clicking the "Add All" button adds all remaining athletes to the round', async ({ page }) => {
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /Add All/ }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Alice' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Dave' })).toBeVisible();
  });

  test('has a "Randomize" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Randomize/ })).toBeVisible();
  });

  test('clicking "Randomize" shows a confirmation dialog', async ({ page }) => {
    let capturedDialog;
    page.once('dialog', dialog => { capturedDialog = dialog; dialog.dismiss(); });
    await page.getByRole('button', { name: /Randomize/ }).click();
    expect(capturedDialog).toBeDefined();
    expect(capturedDialog.type()).toBe('confirm');
  });

  test('dismissing the randomize confirm keeps the current entries', async ({ page }) => {
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: /Randomize/ }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Alice' })).toBeVisible();
  });

  test('accepting the randomize confirm shows the flash message and keeps all entries', async ({ page }) => {
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /Randomize/ }).click();
    await expect(page.getByText(/Start order randomized/i)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Alice' })).toBeVisible();
  });
});

test.describe('when a previous round exists with scores', () => {
  let finalsSeed;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/finals');
    finalsSeed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name=email]').fill('admin@test.com');
    await page.locator('input[name=password]').fill('admin123');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('/admin');
    await page.goto(`/admin/competitions/${finalsSeed.competitionId}/groups/${finalsSeed.groupId}/rounds/${finalsSeed.round2Id}/entries`);
  });

  test('label shows which round the ranking comes from', async ({ page }) => {
    await expect(page.locator('label').filter({ hasText: /ranked by Qualifications/i })).toBeVisible();
  });

  test('athletes are sorted by their rank in the previous round', async ({ page }) => {
    const options = page.locator('select[name=sportsman_id] option');
    await expect(options.nth(0)).toContainText('Alice');
    await expect(options.nth(1)).toContainText('Bob');
  });

  test('rank prefix is shown for each athlete', async ({ page }) => {
    const options = page.locator('select[name=sportsman_id] option');
    await expect(options.nth(0)).toContainText('#1');
    await expect(options.nth(1)).toContainText('#2');
  });
});
