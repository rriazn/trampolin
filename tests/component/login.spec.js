const { test, expect } = require('@playwright/test');

test('login page shows email and password fields', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[name=email]')).toBeVisible();
  await expect(page.locator('input[name=password]')).toBeVisible();
  await expect(page.locator('button[type=submit]')).toBeVisible();
});

test('invalid credentials show an error message', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('wrong@test.com');
  await page.locator('input[name=password]').fill('badpassword');
  await page.locator('button[type=submit]').click();
  await expect(page.locator('.alert.alert-danger')).toContainText('Invalid email or password');
  expect(page.url()).toContain('/login');
});

test('valid admin credentials redirect to the admin dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
  await expect(page.getByText('Admin Dashboard')).toBeVisible();
});
