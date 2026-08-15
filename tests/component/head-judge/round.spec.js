const { test, expect } = require('@playwright/test');

async function loginAsHeadJudge(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('hjhead@test.com');
  await page.locator('input[name=password]').fill('hj123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/head-judge');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/head-judge/competitions/1/groups/1/rounds/1');
  expect(res.status()).toBe(403);
});

test.describe('not started state', () => {
  let seed;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/head-judge');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsHeadJudge(page);
    await page.goto(`/head-judge/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  });

  test('shows the round name as the heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Finals' })).toBeVisible();
  });

  test('shows the panel readiness banner with every group fully assigned', async ({ page }) => {
    await expect(page.getByText('Panel readiness')).toBeVisible();
    await expect(page.getByText('4 of 4 assigned')).toBeVisible();
    await expect(page.getByText('1 of 1 assigned')).toHaveCount(2); // difficulty + head_judge
  });

  test('shows a "Start Round" button with no unstaffed warning', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Start Round/ })).toBeVisible();
    await expect(page.getByText(/isn't fully staffed/)).not.toBeVisible();
  });
});

// Each test here re-seeds and starts its own round, since "Start Round" only works once per
// round — sharing one seeded/started round across tests via beforeAll would make every test
// after the first find no Start button (the round would already be in_progress).
test.describe('starting the round', () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.post('/test/seed/head-judge');
    const seed = await res.json();
    page.seed = seed;
    await loginAsHeadJudge(page);
    await page.goto(`/head-judge/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    await page.getByRole('button', { name: /Start Round/ }).click();
  });

  test('reveals the current athlete and judging checklist', async ({ page }) => {
    await expect(page.locator('.alert-success')).toContainText('Round started.');
    await expect(page.getByText('Leon Weber')).toBeVisible();
    await expect(page.getByText('Attempt #1')).toBeVisible();
    await expect(page.getByText('Judging checklist')).toBeVisible();
  });

  test('the checklist lists every assigned judge by name', async ({ page }) => {
    await expect(page.getByText('Exec Judge 1')).toBeVisible();
    await expect(page.getByText('Exec Judge 2')).toBeVisible();
    await expect(page.getByText('Exec Judge 3')).toBeVisible();
    await expect(page.getByText('Exec Judge 4')).toBeVisible();
    await expect(page.getByText('Diff Judge')).toBeVisible();
  });

  test('shows the head judge\'s own inline penalty form', async ({ page }) => {
    await expect(page.getByText('Your head judge penalty')).toBeVisible();
  });

  test('shows the trick count control and Back/Next/Skip/Complete buttons', async ({ page }) => {
    await expect(page.getByText('Trick count')).toBeVisible();
    await expect(page.getByRole('button', { name: /Back/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Next/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Skip Athlete/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Complete Round/ })).toBeVisible();
  });
});

test.describe('scoring and advancing', () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.post('/test/seed/head-judge');
    const seed = await res.json();
    page.seed = seed;
    await loginAsHeadJudge(page);
    await page.goto(`/head-judge/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    await page.getByRole('button', { name: /Start Round/ }).click();
  });

  test('"Next" is blocked with a flash error while judges have not submitted', async ({ page }) => {
    await page.getByRole('button', { name: /Next/ }).click();
    await expect(page.locator('.alert-danger')).toContainText('Not every judge has submitted');
    await expect(page.getByText('Leon Weber')).toBeVisible();
  });

  test('submitting the head judge penalty saves it and shows a flash message', async ({ page }) => {
    const input = page.locator('.card:has-text("Your head judge penalty") input[name=score]');
    await input.fill('0.2');
    await page.locator('.card:has-text("Your head judge penalty") button').click();
    await expect(page.locator('.alert-success')).toContainText('Head judge penalty 0.2 saved.');
    await expect(input).toHaveValue('0.2');
  });

  test('"Skip Athlete" shows a confirm dialog and advances to the next athlete', async ({ page }) => {
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /Skip Athlete/ }).click();
    await expect(page.locator('.alert-success')).toContainText('skipped');
    await expect(page.getByText('Noah Becker')).toBeVisible();
  });

  test('"Back" is blocked with a flash error while on the first attempt', async ({ page }) => {
    await page.getByRole('button', { name: /Back/ }).click();
    await expect(page.locator('.alert-danger')).toContainText('Already at the first attempt');
  });

  test('lowering the trick count to 0 saves and updates the input', async ({ page }) => {
    await page.locator('input[name=element_count]').fill('0');
    await page.locator('.card:has-text("Trick count") button').click();
    await expect(page.locator('.alert-success')).toContainText('Trick count set to 0.');
    await expect(page.locator('input[name=element_count]')).toHaveValue('0');
  });
});

test.describe('completed state', () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.post('/test/seed/head-judge');
    const seed = await res.json();
    page.seed = seed;
    await loginAsHeadJudge(page);
    await page.goto(`/head-judge/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    await page.getByRole('button', { name: /Start Round/ }).click();
  });

  test('"Complete Round" shows a confirm dialog and force-completes the round', async ({ page }) => {
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /Complete Round/ }).click();
    await expect(page.getByText('Round completed')).toBeVisible();
    await expect(page.getByRole('link', { name: /View Leaderboard/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Back to Last Attempt/ })).toBeVisible();
  });
});
