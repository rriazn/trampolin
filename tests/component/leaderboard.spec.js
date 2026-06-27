const { test, expect } = require('@playwright/test');

let seed;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  seed = await res.json();
});

test.describe('hero and auto-refresh', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  });

  test('shows the round and group name as heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Qualifications · Group A' })).toBeVisible();
  });

  test('shows the competition name in the hero', async ({ page }) => {
    await expect(page.locator('.lb-hero').getByText('Spring Cup')).toBeVisible();
  });

  test('shows the "Live · refreshes every 10s" indicator', async ({ page }) => {
    await expect(page.getByText(/Live.*refreshes every 10s/)).toBeVisible();
  });

  test('displays the current time', async ({ page }) => {
    // toLocaleTimeString() produces e.g. "14:05:32" or "2:05:32 PM"
    await expect(page.locator('.lb-hero').getByText(/\d+:\d+/)).toBeVisible();
  });

  test('page has a 10-second auto-refresh meta tag', async ({ page }) => {
    await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute('content', '10');
  });

  test('shows empty-state message when no athletes have been scored yet', async ({ page }) => {
    await expect(page.getByText('No athletes scored yet')).toBeVisible();
  });
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
    await expect(page.locator('.lb-rank.gold')).toBeVisible();
  });

  test('rank 2 receives the silver trophy icon', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    await expect(page.locator('.lb-rank.silver')).toBeVisible();
  });

  test('rank 3 receives the bronze trophy icon', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    await expect(page.locator('.lb-rank.bronze')).toBeVisible();
  });

  test('shows the "Best Score" column header', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    await expect(page.getByRole('columnheader', { name: 'Best Score' })).toBeVisible();
  });

  test('shows group badges for athletes assigned to a group', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    // all three athletes are in "Group A" in the scored seed
    const badges = page.locator('tbody .badge');
    await expect(badges.first()).toContainText('Group A');
  });

  test('best scores are displayed with three decimal places', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    await expect(page.locator('table')).toContainText('9.200');  // Bob's best
    await expect(page.locator('table')).toContainText('8.800');  // Charlie's best
    await expect(page.locator('table')).toContainText('8.500');  // Alice's best
  });

  test('individual attempt scores appear in their respective columns', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    // Bob: attempt 1 = 9.2, attempt 2 = 9.1
    const bobRow = page.locator('table tbody tr').filter({ hasText: 'Bob' });
    await expect(bobRow.locator('td').nth(4)).toContainText('9.200');
    await expect(bobRow.locator('td').nth(5)).toContainText('9.100');
  });

  test('shows judge count below each attempt score', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    // scored seed has 1 referee → each scored attempt shows "(1 judges)"
    const bobRow = page.locator('table tbody tr').filter({ hasText: 'Bob' });
    await expect(bobRow.locator('td').nth(4)).toContainText('1 judges');
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
