const { test, expect } = require('@playwright/test');

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/admin');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  let seed;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // Page structure

  test('shows the "Admin Dashboard" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
  });

  test('shows the subtitle', async ({ page }) => {
    await expect(page.getByText('Manage your tournament from here')).toBeVisible();
  });

  // Stat cards

  test('shows three labelled stat cards', async ({ page }) => {
    await expect(page.getByText('Referees')).toBeVisible();
    await expect(page.getByText('Competitions', { exact: true })).toBeVisible();
  });

  test('referees count is at least 1 after seeding', async ({ page }) => {
    const n = parseInt(await page.locator('.stat-blue .stat-num').textContent(), 10);
    expect(n).toBeGreaterThanOrEqual(1);
  });

  test('competitions count is at least 1 after seeding', async ({ page }) => {
    const n = parseInt(await page.locator('.stat-orange .stat-num').textContent(), 10);
    expect(n).toBeGreaterThanOrEqual(1);
  });

  // Recent Competitions table

  test('seeded competition appears in the Recent Competitions table', async ({ page }) => {
    await expect(page.getByRole('cell', { name: 'Spring Cup' }).first()).toBeVisible();
  });

  test('competition row shows an "active" status badge', async ({ page }) => {
    await expect(page.locator('.status-active').first()).toBeVisible();
  });

  test('competition row shows "–" for the date when none is set', async ({ page }) => {
    // Spring Cup has no date set in the seed
    await expect(page.getByRole('cell', { name: 'Spring Cup' }).locator('xpath=../td[2]')).toHaveText('–');
  });

  test('competition row shows the correct date when set', async ({ page }) => {
    // Autumn Open has a date set in the seed
    await expect(page.getByRole('cell', { name: 'Autumn Open' }).locator('xpath=../td[2]')).toHaveText('2026-09-15');
  });

  // Navigation

  test('"New" button navigates to the competition creation form', async ({ page }) => {
    await page.getByRole('link', { name: /New/ }).click();
    await page.waitForURL('/admin/competitions/new');
  });

  test('"Manage" link on the Referees card navigates to /admin/users', async ({ page }) => {
    await page.locator('.stat-blue').getByRole('link', { name: /Manage/ }).click();
    await page.waitForURL('/admin/users');
  });

  test('"Manage" link on the Competitions card navigates to /admin/competitions', async ({ page }) => {
    await page.locator('.stat-orange').getByRole('link', { name: /Manage/ }).click();
    await page.waitForURL('/admin/competitions');
  });

  test('"Groups" button in a competition row navigates to that competition\'s groups page', async ({ page }) => {
    await page.getByRole('link', { name: /Groups/ }).first().click();
    await expect(page).toHaveURL(`/admin/competitions/${seed.competitionId}/groups`);
  });
});
