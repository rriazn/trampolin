const { test, expect } = require('@playwright/test');

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

test.beforeAll(async ({ request }) => {
  await request.post('/test/seed');
});

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

test.describe('flat, square design', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('the navbar, page header and footer have no gradient or shadow', async ({ page }) => {
    for (const selector of ['.navbar-main', '.page-hero', '.app-footer']) {
      await expect(page.locator(selector)).toHaveCSS('background-image', 'none');
      await expect(page.locator(selector)).toHaveCSS('box-shadow', 'none');
    }
  });

  test('sections are square and carry no shadow', async ({ page }) => {
    const section = page.locator('.stat-card').first();
    await expect(section).toHaveCSS('border-top-left-radius', '0px');
    await expect(section).toHaveCSS('box-shadow', 'none');
  });

  test('buttons are rectangles with a 2px radius, not pills', async ({ page }) => {
    await expect(page.getByRole('link', { name: /New/ }).first()).toHaveCSS('border-top-left-radius', '2px');
  });

  test('the brand link and page text contain no emoji', async ({ page }) => {
    expect(await page.locator('.navbar-brand').innerText()).not.toMatch(EMOJI);
    expect(await page.locator('body').innerText()).not.toMatch(EMOJI);
  });
});

test.describe('page shell', () => {
  test('the html lang follows the selected language', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('button', { name: 'DE', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('the first Tab stop is a skip link that targets the main landmark', async ({ page }) => {
    await loginAsAdmin(page);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await expect(page.locator('main#main')).toHaveCount(1);
  });

  test('the navigation collapses behind a toggler on narrow screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await loginAsAdmin(page);
    await expect(page.getByRole('button', { name: /Logout/ })).not.toBeVisible();
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.getByRole('button', { name: /Logout/ })).toBeVisible();
  });

  test('the language toggle sits inside the navbar when logged in', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator('.navbar-main .lang-switcher')).toBeVisible();
  });
});
