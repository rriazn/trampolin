const { test, expect } = require('@playwright/test');
const { acceptConfirm } = require('../../helpers/confirm-modal');

let seed;

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/admin/competitions/1/starting-groups');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeEach(async ({ page, request }) => {
    seed = await (await request.post('/test/seed/starting-group')).json();
    await loginAsAdmin(page);
    await page.goto(`/admin/competitions/${seed.competitionId}/starting-groups`);
  });

  const card = (page) => page.getByTestId(`starting-group-${seed.startingGroupId}`);

  test('shows the heading and the competition in the hero', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Starting groups', level: 1 })).toBeVisible();
    await expect(page.locator('.page-hero p').filter({ hasText: 'SG Cup' })).toBeVisible();
  });

  test('shows a card per starting group with its groups in order', async ({ page }) => {
    await expect(card(page).getByRole('heading', { name: 'Block 1' })).toBeVisible();
    const names = card(page).locator('tbody tr td:nth-child(2)');
    await expect(names).toHaveCount(2);
    await expect(names.nth(0)).toContainText('Group A');
    await expect(names.nth(1)).toContainText('Group B');
  });

  test('offers only groups without a starting group in the add select', async ({ page }) => {
    const options = card(page).locator('select[name=group_id] option');
    await expect(options).toHaveText(['Select a group', 'Group C']);
  });

  test('adds a group at the end of the starting group', async ({ page }) => {
    await card(page).locator('select[name=group_id]').selectOption({ label: 'Group C' });
    await card(page).getByRole('button', { name: 'Add' }).click();

    await expect(page.locator('.alert-success')).toContainText('Group added');
    await expect(card(page).locator('tbody tr')).toHaveCount(3);
    await expect(card(page).locator('tbody tr').nth(2)).toContainText('Group C');
  });

  test('moves a group up', async ({ page }) => {
    await card(page).locator('tbody tr').nth(1).getByRole('button', { name: 'Move up' }).click();

    await expect(card(page).locator('tbody tr').nth(0)).toContainText('Group B');
    await expect(card(page).locator('tbody tr').nth(1)).toContainText('Group A');
  });

  test('disables moving the first group up and the last group down', async ({ page }) => {
    await expect(card(page).locator('tbody tr').nth(0).getByRole('button', { name: 'Move up' })).toBeDisabled();
    await expect(card(page).locator('tbody tr').nth(1).getByRole('button', { name: 'Move down' })).toBeDisabled();
  });

  test('removes a group from the starting group', async ({ page }) => {
    await card(page).locator('tbody tr').nth(0).getByRole('button', { name: 'Remove from starting group' }).click();

    await expect(card(page).locator('tbody tr')).toHaveCount(1);
    await expect(card(page).locator('select[name=group_id] option')).toHaveText(['Select a group', 'Group A', 'Group C']);
  });

  test('creates a starting group', async ({ page }) => {
    await page.locator('#sg-name').fill('Block 2');
    await page.getByRole('button', { name: 'Add' }).last().click();

    await expect(page.getByRole('heading', { name: 'Block 2' })).toBeVisible();
    await expect(page.getByText('No groups in this starting group yet.')).toBeVisible();
  });

  test('deletes a starting group after confirming', async ({ page }) => {
    await card(page).getByRole('button', { name: 'Delete' }).click();
    await acceptConfirm(page);

    await expect(page.getByText('No starting groups yet.')).toBeVisible();
  });

  test('shows a flash and keeps the group out when it does not fit', async ({ page }) => {
    await page.request.post('/test/round-status', { form: { roundId: seed.roundCId, status: 'completed' } });
    await page.reload();
    await card(page).locator('select[name=group_id]').selectOption({ label: 'Group C' });
    await card(page).getByRole('button', { name: 'Add' }).click();

    await expect(page.locator('.alert-danger')).toContainText('different status');
    await expect(card(page).locator('tbody tr')).toHaveCount(2);
  });

  test('disables the member controls and explains why while a round is in progress', async ({ page, request }) => {
    await request.post('/test/round-status', { form: { roundId: seed.roundAId, status: 'in_progress' } });
    await page.reload();

    await expect(card(page).locator('.alert-warning')).toContainText('in progress');
    await expect(card(page).getByRole('button', { name: 'Remove from starting group' }).first()).toBeDisabled();
    await expect(card(page).locator('select[name=group_id]')).toBeDisabled();
  });

  test('the groups page shows the starting group per group and links to this page', async ({ page }) => {
    await page.goto(`/admin/competitions/${seed.competitionId}/groups`);

    const rowOf = (name) => page.locator('tbody tr').filter({ hasText: name });
    await expect(rowOf('Group A')).toContainText('Block 1');
    await expect(rowOf('Group C')).not.toContainText('Block 1');
    await page.getByRole('link', { name: 'Configure starting groups' }).click();
    await page.waitForURL(/starting-groups$/);
  });

  test('the competitions list links to this page', async ({ page }) => {
    await page.goto('/admin/competitions');
    await page.getByRole('link', { name: 'Starting groups' }).click();
    await page.waitForURL(/starting-groups$/);
  });
});
