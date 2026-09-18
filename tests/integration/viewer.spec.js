const { test, expect } = require('@playwright/test');

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  expect(res.ok()).toBeTruthy();
});

test('admin creates a viewer, who sees the active round and can open its leaderboard, but not admin', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@example.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');

  await page.goto('/admin/users/new');
  await page.locator('input[name=name]').fill('Vera Vogel');
  await page.locator('input[name=email]').fill('vera@example.com');
  await page.locator('input[name=password]').fill('viewer123');
  await page.locator('select[name=role]').selectOption('viewer');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/admin/users');

  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');

  await page.locator('input[name=email]').fill('vera@example.com');
  await page.locator('input[name=password]').fill('viewer123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/viewer');

  await expect(page.getByRole('heading', { name: 'Leaderboards' })).toBeVisible();
  await expect(page.getByText('Junior · Qualifications')).toBeVisible();
  await expect(page.getByText('Spring Championship')).toBeVisible();
  await expect(page.getByText('In Progress')).toBeVisible();

  await page.getByText('Junior · Qualifications').click();
  await page.waitForURL(/\/leaderboard\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
  await expect(page.getByRole('heading', { name: /Qualifications/ })).toBeVisible();
  await expect(page.getByText('Leon Weber')).toBeVisible();

  const response = await page.goto('/admin');
  expect(response.status()).toBe(403);
});
