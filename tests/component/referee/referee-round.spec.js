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
  const res = await request.get('/referee/competitions/1/groups/1/rounds/1');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as referee', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/scored');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsReferee(page);
    await page.goto(`/referee/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  });

  // Page structure

  test('shows the round name as the heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Finals' })).toBeVisible();
  });

  test('shows the competition name and group name as subtitle', async ({ page }) => {
    await expect(page.locator('.page-hero p').getByText('Championship · Group A')).toBeVisible();
  });

  test('shows a "Back" button', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Back/ })).toBeVisible();
  });

  // Current attempt (round starts on Bob's first attempt)

  test('shows the current athlete\'s name, club and routine', async ({ page }) => {
    await expect(page.getByText('Bob').first()).toBeVisible();
    await expect(page.getByText('DMT')).toBeVisible();
  });

  test('shows the attempt number badge', async ({ page }) => {
    await expect(page.getByText('Attempt #1')).toBeVisible();
  });

  test('shows the assigned judge role\'s name as a heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Time of Flight' })).toBeVisible();
  });

  test('pre-fills the previously saved score', async ({ page }) => {
    await expect(page.locator('input[name=score]')).toHaveValue('9.2');
  });

  // Back button

  test('"Back" button navigates to the referee dashboard', async ({ page }) => {
    await page.getByRole('link', { name: /Back/ }).click();
    await page.waitForURL('/referee');
  });

  // Score submission

  test('submitting a score saves it and shows a flash message', async ({ page }) => {
    await page.locator('input[name=score]').fill('8.0');
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.locator('.alert-success')).toContainText('Score 8.0 saved.');
  });

  test('resubmitting updates the pre-filled value', async ({ page }) => {
    await page.locator('input[name=score]').fill('7.5');
    await page.getByRole('button', { name: /Save/ }).click();
    await page.waitForURL(/\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
    await expect(page.locator('input[name=score]')).toHaveValue('7.5');
  });
});

test.describe('turn states', () => {
  test('shows a "not started" message when the round has not begun', async ({ page, request }) => {
    const res = await request.post('/test/seed');
    const basicSeed = await res.json();

    // The basic seed assigns "Referee One" (referee1@test.com) to time_of_flight and marks the
    // round 'in_progress', but no attempts exist yet so current_attempt_id stays null — the round
    // page treats that the same as "not started", nothing to score right now.
    await page.goto('/login');
    await page.locator('input[name=email]').fill('referee1@test.com');
    await page.locator('input[name=password]').fill('ref123');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('/referee');

    await page.goto(`/referee/competitions/${basicSeed.competitionId}/groups/${basicSeed.groupId}/rounds/${basicSeed.roundId}`);
    await expect(page.getByText('Round not started yet')).toBeVisible();
  });
});
