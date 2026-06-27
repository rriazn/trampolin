const { test, expect } = require('@playwright/test');

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@example.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

async function loginAsReferee(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('maria@example.com');
  await page.locator('input[name=password]').fill('referee123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/referee');
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  expect(res.ok()).toBeTruthy();
});

test('admin creates and fully sets up a competition, and a referee can score it', async ({ page }) => {
  await loginAsAdmin(page);

  // Create a new competition
  await page.goto('/admin/competitions');
  await page.getByRole('link', { name: /New Competition/ }).click();
  await page.locator('input[name=name]').fill('Winter Cup');
  await page.getByRole('button', { name: /Create/ }).click();
  await page.waitForURL('/admin/competitions');

  // Activate it
  const compRow = page.getByRole('row').filter({ hasText: 'Winter Cup' });
  await compRow.getByRole('button', { name: /Activate/ }).click();
  await expect(compRow.getByRole('cell', { name: 'active' })).toBeVisible();

  // Navigate to the groups page and capture the competition ID from the URL
  await compRow.getByRole('link', { name: /Groups/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups/);
  const [, compId] = page.url().match(/\/competitions\/(\d+)/);

  // Add an athlete to this competition first (entries are competition-scoped)
  await page.goto(`/admin/competitions/${compId}/sportsmen/new`);
  await page.locator('input[name=name]').fill('Jonas Krause');
  await page.locator('input[name=club]').fill('TSV München');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/admin/competitions/${compId}/sportsmen`);

  // Add a group
  await page.goto(`/admin/competitions/${compId}/groups`);
  await page.locator('input[name=name]').fill('Seniors');
  await page.locator('button[type=submit]').click();

  // Navigate to rounds for the new group
  const groupRow = page.getByRole('row').filter({ hasText: 'Seniors' });
  await groupRow.getByRole('link', { name: /Rounds/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds/);

  // Add a round
  await page.locator('input[name=name]').fill('Finals');
  await page.locator('input[name=round_order]').fill('1');
  await page.locator('button[type=submit]').click();

  // Navigate to entries for the Finals round
  const roundRow = page.getByRole('row').filter({ hasText: 'Finals' });
  await roundRow.getByRole('link', { name: /Entries/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds\/\d+\/entries/);

  await page.locator('select[name=sportsman_id]').selectOption({ label: 'Jonas Krause · TSV München' });
  await page.locator('button[type=submit]').click();

  // Create attempts for all entries
  page.once('dialog', dialog => dialog.accept());
  await Promise.all([
    page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds\/\d+\/entries/),
    page.getByRole('button', { name: /Create All Attempts/ }).click(),
  ]);

  // Switch to referee and verify the round appears on the scoring dashboard
  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');
  await loginAsReferee(page);
  await expect(page.getByText('Finals')).toBeVisible();
  await expect(page.getByText('Winter Cup')).toBeVisible();
});

test('admin deletes a group and its rounds disappear from the referee scoring dashboard', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/competitions');
  const compRow = page.getByRole('row').filter({ hasText: 'Spring Championship' });
  await compRow.getByRole('link', { name: /Groups/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups/);

  const groupRow = page.getByRole('row').filter({ hasText: 'Junior' });
  page.once('dialog', dialog => dialog.accept());
  await groupRow.locator('button.btn-outline-danger').click();
  await expect(groupRow).not.toBeVisible();

  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');
  await loginAsReferee(page);
  await expect(page.getByText('Qualifications')).not.toBeVisible();
});

test('admin closes a competition and it disappears from the referee scoring dashboard', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/competitions');
  const row = page.getByRole('row').filter({ hasText: 'Spring Championship' });
  await row.getByRole('button', { name: /Close/ }).click();
  await expect(row.getByRole('cell', { name: 'closed' })).toBeVisible();

  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');
  await loginAsReferee(page);
  await expect(page.getByText('Spring Championship')).not.toBeVisible();
});

test('admin deletes a competition and it is removed from the list', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/competitions');
  const row = page.getByRole('row').filter({ hasText: 'Winter Cup' });
  page.once('dialog', dialog => dialog.accept());
  await row.locator('button.btn-outline-danger').click();
  await expect(page.getByRole('cell', { name: 'Winter Cup' })).not.toBeVisible();
});
