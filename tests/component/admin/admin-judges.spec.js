const { test, expect } = require('@playwright/test');

let seed;

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

// Finds the role card (the `.card` element) that contains the given heading text.
function roleCard(page, headingName) {
  return page.locator('.card').filter({ has: page.getByRole('heading', { name: headingName }) });
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/admin/competitions/1/judges');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('shows a "no judge panel selected" message for a competition without one', async ({ page }) => {
    await page.goto(`/admin/competitions/${seed.noPanelCompetitionId}/judges`);
    await expect(page.getByText('No judge panel selected')).toBeVisible();
    await expect(page.getByText('Choose a judge panel on the competition\'s edit page before assigning judges.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Edit Competition/ })).toBeVisible();
  });

  test('"Edit Competition" link navigates to the competition edit form', async ({ page }) => {
    await page.goto(`/admin/competitions/${seed.noPanelCompetitionId}/judges`);
    await page.getByRole('link', { name: /Edit Competition/ }).click();
    await page.waitForURL(/\/admin\/competitions\/\d+\/edit/);
  });

  test('"Competitions" breadcrumb navigates back to the competitions list', async ({ page }) => {
    await page.goto(`/admin/competitions/${seed.panelCompetitionId}/judges`);
    await page.locator('.breadcrumb').getByRole('link', { name: 'Competitions' }).click();
    await page.waitForURL('/admin/competitions');
  });

  test.describe('competition on the FIG panel', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/admin/competitions/${seed.panelCompetitionId}/judges`);
    });

    test('shows a role card per judge role, with Time of Flight and Horizontal Displacement combined', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Execution' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Difficulty' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Time of Flight & Horizontal Displacement' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Head Judge (Penalties)' })).toBeVisible();
    });

    test('shows the competition name and panel name in the subtitle', async ({ page }) => {
      await expect(page.locator('.page-hero p')).toContainText('Panel Cup');
      await expect(page.locator('.page-hero p')).toContainText('FIG Panel');
    });

    test('shows the competition-wide assignment notice', async ({ page }) => {
      await expect(page.getByText('Judges are assigned once per competition and apply to every group and round within it.')).toBeVisible();
    });

    test('shows the correct required counts and "No judges assigned yet." for empty roles', async ({ page }) => {
      await expect(roleCard(page, 'Execution').getByText('0 of 6 filled')).toBeVisible();
      await expect(roleCard(page, 'Difficulty').getByText('0 of 1 filled')).toBeVisible();
      await expect(roleCard(page, 'Time of Flight & Horizontal Displacement').getByText('0 of 1 filled')).toBeVisible();
      await expect(roleCard(page, 'Head Judge (Penalties)').getByText('0 of 1 filled')).toBeVisible();
      await expect(roleCard(page, 'Execution').getByText('No judges assigned yet.')).toBeVisible();
      await expect(roleCard(page, 'Difficulty').getByText('No judges assigned yet.')).toBeVisible();
    });

    test('assigning a referee to a solo role shows them and updates the count', async ({ page }) => {
      const card = roleCard(page, 'Difficulty');
      await card.locator('select[name=user_id]').selectOption({ label: 'Judge Referee A · judgerefa@test.com' });
      await card.getByRole('button', { name: /Assign/ }).click();
      await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

      const updatedCard = roleCard(page, 'Difficulty');
      await expect(updatedCard.getByText('Judge Referee A')).toBeVisible();
      await expect(updatedCard.getByText('1 of 1 filled')).toBeVisible();
      await expect(updatedCard.getByText('This role is fully staffed.')).toBeVisible();
      await expect(updatedCard.locator('select[name=user_id]')).not.toBeVisible();
      await expect(updatedCard.getByRole('columnheader', { name: 'Name' })).toBeVisible();
      await expect(updatedCard.getByRole('columnheader', { name: 'Email' })).toBeVisible();
      await expect(updatedCard.getByText('judgerefa@test.com')).toBeVisible();
    });

    test('assigning a referee to Time of Flight fills both roles in the combined card', async ({ page }) => {
      const card = roleCard(page, 'Time of Flight & Horizontal Displacement');
      await card.locator('select[name=user_id]').selectOption({ label: 'Judge Referee B · judgerefb@test.com' });
      await card.getByRole('button', { name: /Assign/ }).click();
      await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

      const updatedCard = roleCard(page, 'Time of Flight & Horizontal Displacement');
      await expect(updatedCard.getByText('Judge Referee B')).toBeVisible();
      await expect(updatedCard.getByText('1 of 1 filled')).toBeVisible();
    });

    test('a referee already assigned to one role is no longer offered as a candidate for another', async ({ page }) => {
      // Relies on the preceding test having already assigned Judge Referee A to Difficulty.
      const executionOptions = roleCard(page, 'Execution').locator('select[name=user_id] option');
      await expect(executionOptions.filter({ hasText: 'Judge Referee A' })).toHaveCount(0);
    });

    test('unassigning a judge removes them and reopens the assign form', async ({ page }) => {
      // Relies on an earlier test having already assigned Judge Referee A to Difficulty.
      const card = roleCard(page, 'Difficulty');
      let capturedDialog;
      page.once('dialog', dialog => {
        capturedDialog = dialog;
        dialog.accept();
      });
      await card.locator('button.btn-outline-danger').click();
      await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);
      expect(capturedDialog.type()).toBe('confirm');
      expect(capturedDialog.message()).toBe('Remove Judge Referee A from Difficulty?');

      const finalCard = roleCard(page, 'Difficulty');
      await expect(finalCard.getByText('Judge Referee A')).not.toBeVisible();
      await expect(finalCard.getByText('0 of 1 filled')).toBeVisible();
      await expect(finalCard.locator('select[name=user_id]')).toBeVisible();
    });

    test('shows "No more eligible users to assign." once every referee is used up elsewhere', async ({ page }) => {
      // Relies on the preceding tests: Judge Referee B already fully staffs Time of Flight &
      // Horizontal Displacement, and Judge Referee A was freed up again by the previous test.
      // Referee One (from the base seed) and Judge Referee A are the only two referees left;
      // assigning both to Execution leaves Difficulty with zero eligible candidates while still
      // short of its own requirement.
      const executionCard = roleCard(page, 'Execution');
      await executionCard.locator('select[name=user_id]').selectOption({ label: 'Judge Referee A · judgerefa@test.com' });
      await executionCard.getByRole('button', { name: /Assign/ }).click();
      await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

      await roleCard(page, 'Execution').locator('select[name=user_id]').selectOption({ label: 'Referee One · referee1@test.com' });
      await roleCard(page, 'Execution').getByRole('button', { name: /Assign/ }).click();
      await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

      await expect(roleCard(page, 'Execution').getByText('2 of 6 filled')).toBeVisible();
      await expect(roleCard(page, 'Difficulty').getByText('0 of 1 filled')).toBeVisible();
      await expect(roleCard(page, 'Difficulty').getByText('No more eligible users to assign.')).toBeVisible();
    });
  });
});
