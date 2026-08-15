const { test, expect } = require('@playwright/test');

// eslint-disable-next-line no-unused-vars
let seed;

async function loginAsHeadJudge(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('hjhead@test.com');
  await page.locator('input[name=password]').fill('hj123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/head-judge');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/head-judge/');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as head judge', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/head-judge');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsHeadJudge(page);
  });

  test('shows the "Head Judge Dashboard" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Head Judge Dashboard' })).toBeVisible();
  });

  test('shows a card for the round with group and round name and competition name', async ({ page }) => {
    await expect(page.getByText('Group A · Finals')).toBeVisible();
    await expect(page.getByText('HJ Cup')).toBeVisible();
  });

  test('shows a "Ready to start" badge since the panel is fully staffed', async ({ page }) => {
    await expect(page.getByText('Ready to start')).toBeVisible();
  });

  test('clicking the round card navigates to the round control page', async ({ page }) => {
    await page.getByText('Group A · Finals').click();
    await page.waitForURL(/\/head-judge\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
  });
});
