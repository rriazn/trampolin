const { test, expect } = require('@playwright/test');

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

const refereeRoundUrlPattern = /\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/;

test('referee scores all athletes and the leaderboard ranks them by best score', async ({ page }) => {
  await loginAsReferee(page);
  await page.getByText('Qualifications').click();
  await page.waitForURL(refereeRoundUrlPattern);

  // Score Leon 9.0 on attempt 1
  const leonRow = page.locator('tbody tr').filter({ hasText: 'Leon Weber' }).first();
  await leonRow.locator('input[name=score]').fill('9.0');
  await leonRow.getByRole('button', { name: /Save/ }).click();
  await page.waitForURL(refereeRoundUrlPattern);

  // Score Emma 7.5 on attempt 1
  const emmaRow = page.locator('tbody tr').filter({ hasText: 'Emma Fischer' }).first();
  await emmaRow.locator('input[name=score]').fill('7.5');
  await emmaRow.getByRole('button', { name: /Save/ }).click();
  await page.waitForURL(refereeRoundUrlPattern);

  await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  const rows = page.locator('tbody tr');
  await expect(rows.nth(0)).toContainText('Leon Weber');
  await expect(rows.nth(0)).toContainText('9.000');
  await expect(rows.nth(1)).toContainText('Emma Fischer');
  await expect(rows.nth(1)).toContainText('7.500');
});

test('referee overwrites a score and the leaderboard reflects the updated value', async ({ page }) => {
  await loginAsReferee(page);
  await page.getByText('Qualifications').click();
  await page.waitForURL(refereeRoundUrlPattern);

  // Overwrite Leon's attempt 1 score with 6.0
  const leonRow = page.locator('tbody tr').filter({ hasText: 'Leon Weber' }).first();
  await leonRow.locator('input[name=score]').fill('6.0');
  await leonRow.getByRole('button', { name: /Save/ }).click();
  await page.waitForURL(refereeRoundUrlPattern);

  await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);

  // Emma (7.5) now ranks above Leon (6.0)
  const rows = page.locator('tbody tr');
  await expect(rows.nth(0)).toContainText('Emma Fischer');
  await expect(rows.nth(1)).toContainText('Leon Weber');
  await expect(rows.nth(1)).toContainText('6.000');
});
