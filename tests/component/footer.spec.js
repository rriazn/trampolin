const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const VERSION_FILE = path.join(__dirname, 'VERSION');

test.beforeAll(async ({ request }) => {
  await request.post('/test/seed');
});

test.afterEach(() => {
  if (fs.existsSync(VERSION_FILE)) fs.unlinkSync(VERSION_FILE);
});

test('shows "latest" when no VERSION file exists on the backend', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('.app-footer-version')).toHaveText('latest');
});

test('shows the version from the VERSION file when one exists', async ({ page }) => {
  fs.writeFileSync(VERSION_FILE, '2.4.1\n');
  await page.goto('/login');
  await expect(page.locator('.app-footer-version')).toHaveText('v2.4.1');
});

test('is visible on a page other than login too', async ({ page }) => {
  fs.writeFileSync(VERSION_FILE, '3.0.0');
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
  await expect(page.locator('.app-footer-version')).toHaveText('v3.0.0');
});
