const { test, expect } = require('@playwright/test');

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  expect(res.ok()).toBeTruthy();
});

test('admin logs in, accesses the admin area, then logs out and loses access', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@example.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');

  const response = await page.goto('/admin');
  expect(response.status()).toBe(403);
});

test('referee logs in and sees only active competitions on the scoring dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('maria@example.com');
  await page.locator('input[name=password]').fill('referee123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/referee');

  await expect(page.getByRole('heading', { name: 'Scoring Dashboard' })).toBeVisible();
  await expect(page.getByText('Spring Championship')).toBeVisible();
  await expect(page.getByText('Qualifications')).toBeVisible();
});

test('invalid credentials are rejected and the user stays on the login page', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@example.com');
  await page.locator('input[name=password]').fill('wrongpassword');
  await page.locator('button[type=submit]').click();

  await expect(page).toHaveURL('/login');
  await expect(page.getByText(/invalid/i)).toBeVisible();
});
