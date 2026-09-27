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

test('admin creates and fully sets up a competition with a judge panel and staffs it', async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto('/admin/competitions');
  await page.getByRole('link', { name: /New Competition/ }).click();
  await page.locator('input[name=name]').fill('Winter Cup');
  await page.locator('select[name=panel_template_id]').selectOption({ label: 'FIG Panel' });
  await page.getByRole('button', { name: /Create/ }).click();
  await page.waitForURL('/admin/competitions');

  const compRow = page.getByRole('row').filter({ hasText: 'Winter Cup' });
  await compRow.getByRole('button', { name: /Activate/ }).click();
  await expect(compRow.getByRole('cell', { name: 'active' })).toBeVisible();

  await compRow.getByRole('link', { name: /Groups/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups/);
  const [, compId] = page.url().match(/\/competitions\/(\d+)/);

  // entries are scoped to the round's group, so an athlete must be assigned to one to show up as available later
  await page.goto(`/admin/competitions/${compId}/groups`);
  await page.locator('input[name=name]').fill('Seniors');
  await page.locator('input[name=abbreviation]').fill('SEN');
  await page.locator('button[type=submit]').click();

  await page.goto(`/admin/competitions/${compId}/sportsmen/new`);
  await page.locator('input[name=name]').fill('Jonas Krause');
  await page.locator('input[name=club]').fill('TSV München');
  await page.locator('select[name=group_id]').selectOption({ label: 'Seniors' });
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/admin/competitions/${compId}/sportsmen`);

  await page.goto(`/admin/competitions/${compId}/groups`);
  const groupRow = page.getByRole('row').filter({ hasText: 'Seniors' });
  await groupRow.getByRole('link', { name: /Rounds/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds/);

  await page.locator('input[name=name]').fill('Finals');
  await page.locator('input[name=round_order]').fill('1');
  await page.locator('button[type=submit]').click();

  const roundRow = page.getByRole('row').filter({ hasText: 'Finals' });
  await roundRow.getByRole('link', { name: /Entries/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds\/\d+\/entries/);

  await page.locator('select[name=sportsman_id]').selectOption({ label: 'Jonas Krause · TSV München' });
  await page.locator('form').filter({ has: page.locator('select[name=sportsman_id]') }).getByRole('button', { name: /Add/ }).click();

  page.once('dialog', dialog => dialog.accept());
  await Promise.all([
    page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds\/\d+\/entries/),
    page.getByRole('button', { name: /Create All Attempts/ }).click(),
  ]);

  await page.goto(`/admin/competitions/${compId}/judges`);
  const difficultyCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Difficulty' }) });
  await difficultyCard.locator('select[name=user_id]').selectOption({ label: 'Maria Schmidt · maria@example.com' });
  await difficultyCard.getByRole('button', { name: /Assign/ }).click();
  await expect(difficultyCard.getByText('Maria Schmidt')).toBeVisible();

  // the round hasn't been started yet, so it correctly does not appear on the scoring dashboard
  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');
  await loginAsReferee(page);
  await expect(page.getByText('Finals')).not.toBeVisible();
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
