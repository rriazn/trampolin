const { test, expect } = require('@playwright/test');

test.beforeAll(async ({ request }) => {
  await request.post('/test/seed');
});

test.describe('language switcher', () => {
  test('is visible on the login page (which hides the main nav) with English active by default', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.lang-switcher')).toBeVisible();
    await expect(page.getByRole('button', { name: 'EN', exact: true })).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: 'DE', exact: true })).not.toHaveClass(/active/);
  });

  test('clicking "DE" switches the current page to German and marks DE active', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'DE', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'DE', exact: true })).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: 'EN', exact: true })).not.toHaveClass(/active/);
    await expect(page.getByText('Passwort')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Einloggen' })).toBeVisible();
  });

  test('clicking "EN" switches back to English', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'DE', exact: true }).click();
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.getByRole('button', { name: 'EN', exact: true })).toHaveClass(/active/);
    await expect(page.getByText('Password')).toBeVisible();
  });

  test('persists after navigating to another page (login -> admin dashboard)', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'DE', exact: true }).click();

    await page.locator('input[name=email]').fill('admin@test.com');
    await page.locator('input[name=password]').fill('admin123');
    await page.getByRole('button', { name: 'Einloggen' }).click();
    await page.waitForURL('/admin');

    await expect(page.getByRole('button', { name: 'DE', exact: true })).toHaveClass(/active/);
    await expect(page.locator('h1')).toContainText('Admindashboard');
  });

  test('persists across a full page reload', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'DE', exact: true }).click();

    await page.reload();

    await expect(page.getByRole('button', { name: 'DE', exact: true })).toHaveClass(/active/);
    await expect(page.getByText('Passwort')).toBeVisible();
  });
});
