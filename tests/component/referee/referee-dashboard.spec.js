const { test, expect } = require('@playwright/test');

async function loginAsReferee(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('referee1@test.com');
  await page.locator('input[name=password]').fill('ref123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/referee');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/referee');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as referee', () => {
  test.beforeAll(async ({ request }) => {
    await request.post('/test/seed');
  });

  test.beforeEach(async ({ page }) => {
    await loginAsReferee(page);
  });

  // Page structure

  test('shows the "Scoring Dashboard" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Scoring Dashboard' })).toBeVisible();
  });

  test('shows the subtitle', async ({ page }) => {
    await expect(page.getByText('Select an active round to enter scores')).toBeVisible();
  });

  // Round cards

  test('shows a card for the active round with round name and competition name', async ({ page }) => {
    await expect(page.getByText('Qualifications')).toBeVisible();
    await expect(page.getByText('Spring Cup')).toBeVisible();
  });

  test('does not show rounds for closed or planned competitions', async ({ page }) => {
    await expect(page.getByText('Autumn Open')).not.toBeVisible();
    await expect(page.getByText('Winter Cup')).not.toBeVisible();
  });

  // Navigation

  test('clicking a round card navigates to the round scoring view', async ({ page }) => {
    await page.getByText('Qualifications').click();
    await page.waitForURL(/\/referee\/round\/\d+/);
  });
});
