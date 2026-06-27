const { test, expect } = require('@playwright/test');

let seed;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  seed = await res.json();
});

test('shows empty-state message when no athletes have been scored yet', async ({ page }) => {
  await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  await expect(page.getByText('Qualifications')).toBeVisible();
  await expect(page.getByText('No athletes scored yet')).toBeVisible();
});

test.describe('with scored athletes', () => {
  let scoredSeed;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/scored');
    scoredSeed = await res.json();
  });

  test('all three athletes appear in the table', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    await expect(page.locator('table').getByText('Bob')).toBeVisible();
    await expect(page.locator('table').getByText('Charlie')).toBeVisible();
    await expect(page.locator('table').getByText('Alice')).toBeVisible();
  });

  test('empty-state card is hidden when scores exist', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    await expect(page.getByText('No athletes scored yet')).not.toBeVisible();
  });

  test('rank 1 athlete appears in the first table row', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    await expect(page.locator('table tbody tr').first()).toContainText('Bob');
  });

  test('rank 1 receives the gold trophy icon', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    // Template renders <span class="lb-rank gold"> for rank 1
    await expect(page.locator('.lb-rank.gold')).toBeVisible();
  });

  test('best scores are displayed with three decimal places', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    await expect(page.locator('table')).toContainText('9.200');  // Bob's best
    await expect(page.locator('table')).toContainText('8.800');  // Charlie's best
    await expect(page.locator('table')).toContainText('8.500');  // Alice's best
  });

  test('renders one attempt column per attempt number in the round', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    // scored seed: Bob and Charlie have 2 attempts, Alice has 1 → maxAttempts = 2
    await expect(page.getByRole('columnheader', { name: 'Attempt 1' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Attempt 2' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Attempt \d+/ })).toHaveCount(2);
  });

  test('shows "–" for attempt slots an athlete has not completed', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    // Alice only has 1 attempt; her Attempt 2 cell (td index 5: rank/athlete/club/group/attempt1/attempt2) should be "–"
    const aliceRow = page.locator('table tbody tr').filter({ hasText: 'Alice' });
    await expect(aliceRow.locator('td').nth(5)).toContainText('–');
  });
});
