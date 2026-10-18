const { test, expect } = require('@playwright/test');
const { acceptConfirm } = require('../../helpers/confirm-modal');

async function login(page, email, password, landing) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(landing);
}

const roundUrl = (seed, tag) => `/head-judge/competitions/${seed.competitionId}/groups/${seed[`group${tag}Id`]}/rounds/${seed[`round${tag}Id`]}`;

test.describe('head judge with a starting group', () => {
  let seed;

  test('the dashboard shows one card for the starting group round', async ({ page, request }) => {
    seed = await (await request.post('/test/seed/starting-group')).json();
    await login(page, 'hjhead@test.com', 'hj123', '/head-judge');

    await expect(page.getByText('Block 1 · Finals: Group A, Group B')).toBeVisible();
    await expect(page.getByText('Group A · Finals')).toHaveCount(0);
    await expect(page.getByText('Group C · Finals')).toBeVisible();
  });

  test('the round page names the starting group and its groups before the start', async ({ page, request }) => {
    seed = await (await request.post('/test/seed/starting-group')).json();
    await login(page, 'hjhead@test.com', 'hj123', '/head-judge');
    await page.goto(roundUrl(seed, 'B'));

    await expect(page.getByTestId('starting-group')).toContainText('Block 1');
    await expect(page.getByTestId('starting-group')).toContainText('Group A, Group B');
  });

  test('starting from the second group shows the first athlete of the first group on that group\'s page', async ({ page, request }) => {
    seed = await (await request.post('/test/seed/starting-group')).json();
    await login(page, 'hjhead@test.com', 'hj123', '/head-judge');
    await page.goto(roundUrl(seed, 'B'));
    await page.getByRole('button', { name: 'Start round' }).click();

    await page.waitForURL(new RegExp(`/rounds/${seed.roundAId}$`));
    await expect(page.getByText('Leon Weber')).toBeVisible();
    await expect(page.locator('.page-hero')).toContainText('Group A');
  });

  test('skipping past the last athlete of a group switches the page to the next group', async ({ page, request }) => {
    seed = await (await request.post('/test/seed/starting-group?start=1')).json();
    await login(page, 'hjhead@test.com', 'hj123', '/head-judge');
    await page.goto(roundUrl(seed, 'A'));

    await page.getByRole('button', { name: /Skip Athlete/ }).click();
    await acceptConfirm(page);
    await expect(page.getByText('Emma Fischer').first()).toBeVisible();
    await page.getByRole('button', { name: /Skip Athlete/ }).click();
    await acceptConfirm(page);

    await page.waitForURL(new RegExp(`/rounds/${seed.roundBId}$`));
    await expect(page.getByText('Anna Klein')).toBeVisible();
    await expect(page.locator('.page-hero')).toContainText('Group B');
  });

  test('the other member url redirects to the page of the current athlete\'s group', async ({ page, request }) => {
    seed = await (await request.post('/test/seed/starting-group?start=1')).json();
    await login(page, 'hjhead@test.com', 'hj123', '/head-judge');

    await page.goto(roundUrl(seed, 'B'));

    await page.waitForURL(new RegExp(`/rounds/${seed.roundAId}$`));
  });
});

test.describe('referee with a starting group', () => {
  test('the dashboard shows one card for the running starting group', async ({ page, request }) => {
    await request.post('/test/seed/starting-group?start=1');
    await login(page, 'hjexec1@test.com', 'ref123', '/referee');

    await expect(page.getByText('Block 1 · Finals: Group A, Group B')).toBeVisible();
    await expect(page.locator('a.card-link')).toHaveCount(1);
  });

  test('the page of the other member shows the current athlete with the header of that athlete\'s group', async ({ page, request }) => {
    const seed = await (await request.post('/test/seed/starting-group?start=1')).json();
    await login(page, 'hjexec1@test.com', 'ref123', '/referee');

    await page.goto(`/referee/competitions/${seed.competitionId}/groups/${seed.groupBId}/rounds/${seed.roundBId}`);

    await expect(page.getByText('Leon Weber')).toBeVisible();
    await expect(page.locator('.page-hero')).toContainText('Group A');
    await expect(page.getByTestId('starting-group')).toContainText('Block 1');
  });
});
