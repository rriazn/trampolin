const { test, expect } = require('@playwright/test');

let seed;

async function loginAsReferee(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('ref@test.com');
  await page.locator('input[name=password]').fill('ref123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/referee');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/referee/round/1');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as referee', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/scored');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsReferee(page);
    page.goto(`/referee/round/${seed.roundId}`);
  });

  // Page structure

  test('shows the round name as the heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Finals' })).toBeVisible();
  });

  test('shows the competition name as subtitle', async ({ page }) => {
    await expect(page.locator('.page-hero p').getByText('Championship')).toBeVisible();
  });

  test('shows a "Back" button', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Back/ })).toBeVisible();
  });

  test('shows the correct table columns', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: '#' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Athlete' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Club' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Attempt' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Your Score' })).toBeVisible();
  });

  // Attempt rows

  test('shows athletes with their attempt numbers', async ({ page }) => {
    await expect(page.getByRole('row').filter({ hasText: 'Bob' }).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Charlie' }).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Alice' }).first()).toBeVisible();
  });

  test('already-scored rows are highlighted green', async ({ page }) => {
    const rows = page.locator('tbody tr.table-success');
    await expect(rows.first()).toBeVisible();
  });

  test('scored rows show the saved score value in the input', async ({ page }) => {
    const bobRow = page.getByRole('row').filter({ hasText: 'Bob' }).first();
    const scoreInput = bobRow.locator('input[name=score]');
    await expect(scoreInput).toHaveValue('9.2');
  });

  // Back button

  test('"Back" button navigates to the referee dashboard', async ({ page }) => {
    await page.getByRole('link', { name: /Back/ }).click();
    await page.waitForURL('/referee');
  });

  // Score submission

  test('submitting a score saves it and shows a flash message', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    await firstRow.locator('input[name=score]').fill('8.0');
    await firstRow.getByRole('button', { name: /Save/ }).click();
    await expect(page.locator('.alert-success')).toContainText('Score 8.0 saved.');
  });

  test('submitting a score highlights the row green', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    await firstRow.locator('input[name=score]').fill('7.5');
    await firstRow.getByRole('button', { name: /Save/ }).click();
    await expect(page.locator('tbody tr.table-success').first()).toBeVisible();
  });
});
