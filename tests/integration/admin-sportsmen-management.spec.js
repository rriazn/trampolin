const { test, expect } = require('@playwright/test');

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@example.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

let seed;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  expect(res.ok()).toBeTruthy();
  seed = await res.json();
});

test('admin adds a new athlete who appears as available to add to a round', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen/new`);
  await page.locator('input[name=name]').fill('Jonas Krause');
  await page.locator('input[name=club]').fill('TSV München');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/admin/competitions/${seed.competitionId}/sportsmen`);
  await expect(page.getByRole('cell', { name: 'Jonas Krause' })).toBeVisible();

  await page.goto(`/admin/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}/entries`);
  await expect(page.locator('select[name=sportsman_id]')).toContainText('Jonas Krause');
});

test('admin edits an athlete\'s club and the change is reflected in the list', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen`);
  const row = page.getByRole('row').filter({ hasText: 'Leon Weber' });
  await row.locator('a.btn-outline-secondary').click();
  await page.locator('input[name=club]').fill('SV Frankfurt');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(`/admin/competitions/${seed.competitionId}/sportsmen`);
  await expect(
    page.getByRole('row').filter({ hasText: 'Leon Weber' }).getByRole('cell', { name: 'SV Frankfurt' })
  ).toBeVisible();
});

test('admin deletes an athlete and they are removed from the list', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen`);
  const row = page.getByRole('row').filter({ hasText: 'Emma Fischer' });
  page.once('dialog', dialog => dialog.accept());
  await row.locator('button.btn-outline-danger').click();
  await expect(page.getByRole('cell', { name: 'Emma Fischer' })).not.toBeVisible();
});
