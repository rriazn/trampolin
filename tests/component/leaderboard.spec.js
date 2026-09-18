const { test, expect } = require('@playwright/test');

let seed;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  seed = await res.json();
});

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
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

  test('shows a per-role breakdown tooltip and a partial marker on each attempt score', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${scoredSeed.competitionId}/groups/${scoredSeed.groupId}/rounds/${scoredSeed.roundId}`);
    // scored seed only submits the time_of_flight role, so every attempt is partial (marked *)
    // and the other roles are absent from the breakdown title.
    const bobRow = page.locator('table tbody tr').filter({ hasText: 'Bob' });
    const scoreSpan = bobRow.locator('td').nth(4).locator('span');
    await expect(scoreSpan).toHaveAttribute('title', /Time of Flight: 9\.20/);
    await expect(bobRow.locator('td').nth(4)).toContainText('*');
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

test.describe('sum scoring mode', () => {
  let sumSeed;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/scored-sum');
    sumSeed = await res.json();
  });

  test('shows the "Total Score" column header', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${sumSeed.competitionId}/groups/${sumSeed.groupId}/rounds/${sumSeed.roundId}`);
    await expect(page.getByRole('columnheader', { name: 'Total Score' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Best Score' })).not.toBeVisible();
  });

  // Regression: ranking must use the summed total, not just each athlete's best single attempt
  test('ranks by summed total rather than best single attempt', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${sumSeed.competitionId}/groups/${sumSeed.groupId}/rounds/${sumSeed.roundId}`);
    // Ellie's sum (16.6) beats Dana's (16.5) even though Dana's best single attempt (9.0) is higher
    await expect(page.locator('table tbody tr').first()).toContainText('Ellie');
    await expect(page.locator('table')).toContainText('16.600');
    await expect(page.locator('table')).toContainText('16.500');
  });
});

test.describe('per-trick transparency table', () => {
  let hjSeed;

  async function loginAs(page, email, password) {
    await page.goto('/login');
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill(password);
    await page.locator('button[type=submit]').click();
  }

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/head-judge');
    hjSeed = await res.json();
  });

  test.beforeAll(async ({ browser }) => {
    // Start the round and submit real execution/difficulty scores through the actual UI so the
    // leaderboard has real element_scores rows to build the transparency table from.
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginAs(page, 'hjhead@test.com', 'hj123');
    await page.waitForURL('/head-judge');
    await page.goto(`/head-judge/competitions/${hjSeed.competitionId}/groups/${hjSeed.groupId}/rounds/${hjSeed.roundId}`);
    await page.getByRole('button', { name: /Start Round/ }).click();
    await page.getByRole('button', { name: /Logout/ }).click();
    await page.waitForURL('/login');

    await loginAs(page, 'hjexec1@test.com', 'ref123');
    await page.waitForURL('/referee');
    await page.getByText('Group A · Finals').click();
    await page.waitForURL(/\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
    await page.locator('input[type=radio][name=element_1][value="0.3"]').check();
    await page.getByRole('button', { name: /Save/ }).click();
    await page.getByRole('button', { name: /Logout/ }).click();
    await page.waitForURL('/login');

    await loginAs(page, 'hjdiff@test.com', 'ref123');
    await page.waitForURL('/referee');
    await page.getByText('Group A · Finals').click();
    await page.waitForURL(/\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
    await page.locator('input[name=element_1]').fill('15');
    await page.getByRole('button', { name: /Save/ }).click();

    await context.close();
  });

  test('shows a per-trick detail button once execution/difficulty scores exist', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${hjSeed.competitionId}/groups/${hjSeed.groupId}/rounds/${hjSeed.roundId}`);
    await expect(page.locator('button[data-bs-toggle="modal"]')).toBeVisible();
  });

  test('opening the modal shows Execution and Difficulty tables with the judges\' raw values', async ({ page }) => {
    await page.goto(`/leaderboard/competitions/${hjSeed.competitionId}/groups/${hjSeed.groupId}/rounds/${hjSeed.roundId}`);
    await page.locator('button[data-bs-toggle="modal"]').click();
    const modal = page.locator('.modal.show');
    await expect(modal.getByRole('heading', { name: 'Execution' })).toBeVisible();
    await expect(modal.getByRole('heading', { name: 'Difficulty' })).toBeVisible();
    await expect(modal.getByText('Exec Judge 1')).toBeVisible();
    await expect(modal.getByText('Diff Judge')).toBeVisible();
    await expect(modal).toContainText('0.3');
    await expect(modal).toContainText('1.5'); // difficulty's "15" entry, true value 1.5
  });
});
