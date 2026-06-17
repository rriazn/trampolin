const { test, expect } = require('@playwright/test');

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@example.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

async function loginAsReferee(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('maria@example.com');
  await page.locator('input[name=password]').fill('referee123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/referee');
}

let seed;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  expect(res.ok()).toBeTruthy();
  seed = await res.json();
});

test('athlete with attempts but no scores shows as unscored on the leaderboard', async ({ page }) => {
  // The seed creates entries and attempts but no scores — all athletes appear with dash scores
  await page.goto(`/leaderboard/${seed.roundId}`);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  // .lb-score elements only render when bestScore !== null
  await expect(page.locator('.lb-score')).toHaveCount(0);
});

test('referee scores both attempts for all athletes and the leaderboard shows complete results', async ({ page }) => {
  await loginAsReferee(page);
  await page.getByText('Qualifications').click();
  await page.waitForURL(/\/referee\/round\/\d+/);

  // Score all four attempts (Leon attempt 1, Leon attempt 2, Emma attempt 1, Emma attempt 2)
  const attemptRows = page.locator('tbody tr');
  const scores = ['8.5', '9.0', '7.0', '8.0'];
  for (let i = 0; i < scores.length; i++) {
    const row = attemptRows.nth(i);
    await row.locator('input[name=score]').fill(scores[i]);
    await row.getByRole('button', { name: /Save/ }).click();
    await page.waitForURL(/\/referee\/round\/\d+/);
  }

  // Leon's best = 9.0 (attempt 2), Emma's best = 8.0 (attempt 2) → Leon ranked first
  await page.goto(`/leaderboard/${seed.roundId}`);
  const rows = page.locator('tbody tr');
  await expect(rows.nth(0)).toContainText('Leon Weber');
  await expect(rows.nth(0)).toContainText('9.000');
  await expect(rows.nth(1)).toContainText('Emma Fischer');
  await expect(rows.nth(1)).toContainText('8.000');

  // Both attempt columns are populated
  await expect(rows.nth(0)).toContainText('8.500'); // Leon attempt 1
  await expect(rows.nth(1)).toContainText('7.000'); // Emma attempt 1
});

test('removing an entry removes the athlete from the leaderboard', async ({ page }) => {
  await loginAsReferee(page);
  await page.getByText('Qualifications').click();
  await page.waitForURL(/\/referee\/round\/\d+/);

  // Score Leon so he appears on the leaderboard
  const leonRow = page.locator('tbody tr').filter({ hasText: 'Leon Weber' }).first();
  await leonRow.locator('input[name=score]').fill('8.0');
  await leonRow.getByRole('button', { name: /Save/ }).click();
  await page.waitForURL(/\/referee\/round\/\d+/);

  // Verify Leon is on the leaderboard
  await page.goto(`/leaderboard/${seed.roundId}`);
  await expect(page.getByRole('cell', { name: 'Leon Weber' })).toBeVisible();

  // Log out referee before switching to admin (login page redirects authenticated users)
  await page.goto('/referee');
  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');

  // Admin removes Leon's entry
  await loginAsAdmin(page);
  await page.goto(`/admin/rounds/${seed.roundId}/entries`);
  const entryRow = page.getByRole('row').filter({ hasText: 'Leon Weber' });
  page.once('dialog', dialog => dialog.accept());
  await entryRow.locator('button.btn-outline-danger').click();
  await expect(page.getByRole('row').filter({ hasText: 'Leon Weber' })).not.toBeVisible();

  // Leaderboard no longer shows Leon
  await page.goto(`/leaderboard/${seed.roundId}`);
  await expect(page.getByRole('cell', { name: 'Leon Weber' })).not.toBeVisible();
});

test('admin adds a second round to a competition and referee sees both rounds on the dashboard', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/competitions/${seed.competitionId}/rounds`);

  await page.locator('input[name=name]').fill('Finals');
  await page.locator('input[name=round_order]').fill('2');
  await page.locator('button[type=submit]').click();

  // Add an entry to the Finals round
  const finalsRow = page.getByRole('row').filter({ hasText: 'Finals' });
  await finalsRow.getByRole('link', { name: /Entries/ }).click();
  await page.waitForURL(/\/admin\/rounds\/\d+\/entries/);
  await page.locator('select[name=sportsman_id]').selectOption({ label: 'Leon Weber · TSV München' });
  await page.locator('button[type=submit]').click();
  page.once('dialog', dialog => dialog.accept());
  await Promise.all([
    page.waitForURL(/\/admin\/rounds\/\d+\/entries/),
    page.getByRole('button', { name: /Create All Attempts/ }).click(),
  ]);

  // Referee sees both rounds
  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');
  await loginAsReferee(page);
  await expect(page.getByText('Qualifications')).toBeVisible();
  await expect(page.getByText('Finals')).toBeVisible();
});
