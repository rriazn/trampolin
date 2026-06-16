const { test, expect } = require('@playwright/test');

test.beforeAll(async ({ request }) => {
  await request.post('/test/seed');
});

test.describe('when not logged in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('the login page hides the navbar', async ({ page }) => {
    await expect(page.locator('nav.navbar')).not.toBeVisible();
  });
});

test.describe('when logged in as admin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name=email]').fill('admin@test.com');
    await page.locator('input[name=password]').fill('admin123');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('/admin');
  });

  test('shows the site brand', async ({ page }) => {
    await expect(page.locator('.navbar-brand')).toContainText('Trampo');
  });

  test('shows the user chip with the admin name', async ({ page }) => {
    await expect(page.locator('.nav-user-chip')).toContainText('Test Admin');
  });

  test('shows the Admin nav link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Admin/ })).toBeVisible();
  });

  test('shows the Scoring nav link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Scoring/ })).toBeVisible();
  });

  test('the Admin nav link is active on admin pages', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Admin/ })).toHaveClass(/active/);
  });

  test('the Scoring nav link is not active on admin pages', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Scoring/ })).not.toHaveClass(/active/);
  });

  test('shows the Logout button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Logout/ })).toBeVisible();
  });

  test('clicking Logout redirects to the login page', async ({ page }) => {
    await page.getByRole('button', { name: /Logout/ }).click();
    await page.waitForURL('/login');
  });
});

test.describe('when logged in as referee', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name=email]').fill('referee1@test.com');
    await page.locator('input[name=password]').fill('ref123');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('/referee');
  });

  test('shows the user chip with the referee name', async ({ page }) => {
    await expect(page.locator('.nav-user-chip')).toContainText('Referee One');
  });

  test('does not show the Admin nav link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Admin/ })).not.toBeVisible();
  });

  test('shows the Scoring nav link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Scoring/ })).toBeVisible();
  });

  test('the Scoring nav link is active on referee pages', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Scoring/ })).toHaveClass(/active/);
  });

  test('shows the Logout button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Logout/ })).toBeVisible();
  });
});
