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

// The seed starts the round on Leon's first attempt with Maria assigned as the time_of_flight
// judge (a single attempt-level mark). Its fig panel only staffs time_of_flight and head_judge,
// so the round can never reach isComplete and head-judge.js can't advance it past this attempt —
// these tests only cover scoring the current turn. See rounds-entries-leaderboard.spec.js for a
// fully-staffed Test Panel competition that exercises the real Start/Next/Complete flow.
test('referee scores the current attempt and the leaderboard reflects it', async ({ page }) => {
  await loginAsReferee(page);
  await page.getByText('Qualifications').click();
  await page.waitForURL(refereeRoundUrlPattern);
  await expect(page.getByText('Leon Weber')).toBeVisible();

  await page.locator('input[name=score]').fill('9.0');
  await page.getByRole('button', { name: /Save/ }).click();
  await page.waitForURL(refereeRoundUrlPattern);

  await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toContainText('Leon Weber');
  await expect(rows.first()).toContainText('9.000');
});

test('referee overwrites a score and the leaderboard reflects the updated value', async ({ page }) => {
  await loginAsReferee(page);
  await page.getByText('Qualifications').click();
  await page.waitForURL(refereeRoundUrlPattern);

  await page.locator('input[name=score]').fill('6.0');
  await page.getByRole('button', { name: /Save/ }).click();
  await page.waitForURL(refereeRoundUrlPattern);

  await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  await expect(page.locator('tbody tr').first()).toContainText('6.000');
});
