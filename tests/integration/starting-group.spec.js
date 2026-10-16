const { test, expect } = require('@playwright/test');
const { acceptConfirm } = require('../helpers/confirm-modal');

async function loginAs(page, email, password, landing) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(landing);
}

test.describe.serial('starting group run, head judge and referee', () => {
  let seed;
  let head;
  let referee;

  test.beforeAll(async ({ request, browser }) => {
    const res = await request.post('/test/seed', { data: { type: 'startingGroup' } });
    seed = await res.json();
    head = await (await browser.newContext()).newPage();
    referee = await (await browser.newContext()).newPage();
    await loginAs(head, 'petra@example.com', 'headjudge123', '/head-judge');
    await loginAs(referee, 'maria@example.com', 'referee123', '/referee');
  });

  test.afterAll(async () => {
    await head.context().close();
    await referee.context().close();
  });

  const skip = async () => {
    await head.getByRole('button', { name: /Skip Athlete/ }).click();
    await acceptConfirm(head);
  };

  test('the head judge sees one card for the starting group and the referee none before the start', async () => {
    await head.goto('/head-judge');
    await expect(head.getByText('Block 1 · Qualifications: Junior, Youth')).toBeVisible();
    await expect(head.locator('a.card-link')).toHaveCount(1);

    await referee.goto('/referee');
    await expect(referee.locator('a.card-link')).toHaveCount(0);
  });

  test('starting from the card starts both groups on the first athlete', async () => {
    await head.getByText('Block 1 · Qualifications: Junior, Youth').click();
    await expect(head.getByTestId('starting-group')).toContainText('Junior, Youth');
    await head.getByRole('button', { name: 'Start round' }).click();

    await expect(head.getByText('Leon Weber').first()).toBeVisible();
    await referee.goto('/referee');
    await expect(referee.locator('a.card-link')).toHaveCount(1);
    await referee.locator('a.card-link').click();
    await expect(referee.getByText('Leon Weber').first()).toBeVisible();
  });

  test('the second athlete of the first group follows, still in the first group', async () => {
    await skip();
    await expect(head.getByText('Emma Fischer').first()).toBeVisible();
    await expect(head.locator('.page-hero')).toContainText('Junior');
  });

  test('after the last athlete of the first group the head judge and the referee are on the second group', async () => {
    await skip();

    await head.waitForURL(new RegExp(`/rounds/${seed.roundBId}$`));
    await expect(head.getByText('Anna Klein').first()).toBeVisible();
    await expect(head.locator('.page-hero')).toContainText('Youth');

    await referee.reload();
    await expect(referee.getByText('Anna Klein').first()).toBeVisible();
    await expect(referee.locator('.page-hero')).toContainText('Youth');
  });

  test('the second attempt starts again with the first group', async () => {
    await skip();
    await skip();
    await head.waitForURL(new RegExp(`/rounds/${seed.roundId}$`));
    await expect(head.getByText('Leon Weber').first()).toBeVisible();
    await expect(head.getByText(/2 · /).first()).toBeVisible();
  });

  test('skipping the last athlete completes both groups', async () => {
    for (let i = 0; i < 4; i++) await skip();

    await expect(head.getByText('Round completed').first()).toBeVisible();
    await head.goto(`/head-judge/competitions/${seed.competitionId}/groups/${seed.groupBId}/rounds/${seed.roundBId}`);
    await expect(head.getByText('Round completed').first()).toBeVisible();
    await referee.goto('/referee');
    await expect(referee.locator('a.card-link')).toHaveCount(0);
  });

  test('each group keeps its own leaderboard', async () => {
    await head.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    await expect(head.locator('body')).toContainText('Junior');
    await expect(head.locator('body')).not.toContainText('Anna Klein');

    await head.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupBId}/rounds/${seed.roundBId}`);
    await expect(head.locator('body')).toContainText('Youth');
    await expect(head.locator('body')).not.toContainText('Leon Weber');
  });
});
