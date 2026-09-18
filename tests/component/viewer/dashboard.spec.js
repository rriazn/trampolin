const { test, expect } = require('@playwright/test');

async function loginAsViewer(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('viewer1@test.com');
  await page.locator('input[name=password]').fill('view123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/viewer');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/viewer/');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as viewer', () => {
  test.beforeAll(async ({ request }) => {
    await request.post('/test/seed');
  });

  test.beforeEach(async ({ page }) => {
    await loginAsViewer(page);
  });

  test('shows the "Leaderboards" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Leaderboards' })).toBeVisible();
  });

  test('shows a card for the active round with group and round name and competition name', async ({ page }) => {
    await expect(page.getByText('Group A · Qualifications')).toBeVisible();
    await expect(page.getByText('Spring Cup')).toBeVisible();
  });

  test('shows an "In Progress" badge for the in-progress round', async ({ page }) => {
    await expect(page.getByText('In Progress')).toBeVisible();
  });

  test('clicking the round card navigates to its leaderboard', async ({ page }) => {
    await page.getByText('Group A · Qualifications').click();
    await page.waitForURL(/\/leaderboard\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
    await expect(page.getByRole('heading', { name: /Qualifications/ })).toBeVisible();
  });

  test('shows the "Leaderboards" nav link and hides Admin/Scoring/Head Judge', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Leaderboards/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Admin/ })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Scoring/ })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Head Judge/ })).not.toBeVisible();
  });

  test('shows the Logout button and it redirects to the login page', async ({ page }) => {
    await page.getByRole('button', { name: /Logout/ }).click();
    await page.waitForURL('/login');
  });
});
