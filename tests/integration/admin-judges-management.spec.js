const { test, expect } = require('@playwright/test');

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@example.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

function roleCard(page, headingName) {
  return page.locator('.card').filter({ has: page.getByRole('heading', { name: headingName }) });
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  expect(res.ok()).toBeTruthy();
});

test('admin selects a judge panel for a competition, staffs it with judges, and enforces one role per judge', async ({ page }) => {
  await loginAsAdmin(page);

  // Create two referees and a head judge to staff the panel with.
  for (const [name, email] of [['Judge Anna', 'judgeanna@example.com'], ['Judge Ben', 'judgeben@example.com']]) {
    await page.goto('/admin/users/new');
    await page.locator('input[name=name]').fill(name);
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill('judge123');
    await page.locator('select[name=role]').selectOption('referee');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL('/admin/users');
  }
  await page.goto('/admin/users/new');
  await page.locator('input[name=name]').fill('Judge Head');
  await page.locator('input[name=email]').fill('judgehead@example.com');
  await page.locator('input[name=password]').fill('judge123');
  await page.locator('select[name=role]').selectOption('head_judge');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/admin/users');
  await expect(page.getByRole('row').filter({ hasText: 'Judge Head' }).getByText('Head Judge', { exact: true })).toBeVisible();

  // Create a competition on the local panel (execution + difficulty + head judge only).
  await page.goto('/admin/competitions/new');
  await page.locator('input[name=name]').fill('Panel Workflow Cup');
  await page.locator('select[name=panel_template_id]').selectOption({ label: 'Local Panel' });
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/admin/competitions');

  const compRow = page.getByRole('row').filter({ hasText: 'Panel Workflow Cup' });
  await compRow.getByRole('link', { name: /Judges/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);
  await expect(page.getByRole('heading', { name: 'Judges' })).toBeVisible();
  await expect(page.locator('.page-hero p')).toContainText('Panel Workflow Cup');
  await expect(page.locator('.page-hero p')).toContainText('Local Panel');

  // Assign Judge Anna to Difficulty.
  const difficultyCard = roleCard(page, 'Difficulty');
  await difficultyCard.locator('select[name=user_id]').selectOption({ label: 'Judge Anna · judgeanna@example.com' });
  await difficultyCard.getByRole('button', { name: /Assign/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);
  await expect(roleCard(page, 'Difficulty').getByText('Judge Anna')).toBeVisible();
  await expect(roleCard(page, 'Difficulty').getByText('1 of 1 filled')).toBeVisible();

  // Assign Judge Head to Head Judge (Penalties).
  const headJudgeCard = roleCard(page, 'Head Judge (Penalties)');
  await headJudgeCard.locator('select[name=user_id]').selectOption({ label: 'Judge Head · judgehead@example.com' });
  await headJudgeCard.getByRole('button', { name: /Assign/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);
  await expect(roleCard(page, 'Head Judge (Penalties)').getByText('Judge Head')).toBeVisible();
  await expect(roleCard(page, 'Head Judge (Penalties)').getByText('1 of 1 filled')).toBeVisible();

  // Judge Anna is already assigned (to Difficulty) so she must not be offered for Execution.
  const executionOptions = roleCard(page, 'Execution').locator('select[name=user_id] option');
  await expect(executionOptions.filter({ hasText: 'Judge Anna' })).toHaveCount(0);
  // Judge Ben was never assigned, so he's still a valid candidate for Execution.
  await expect(executionOptions.filter({ hasText: 'Judge Ben' })).toHaveCount(1);

  // Unassign Judge Anna from Difficulty; the role becomes open again and she reappears
  // as a candidate for Execution.
  page.once('dialog', dialog => dialog.accept());
  await roleCard(page, 'Difficulty').locator('button.btn-outline-danger').click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);
  await expect(roleCard(page, 'Difficulty').getByText('0 of 1 filled')).toBeVisible();
  await expect(roleCard(page, 'Execution').locator('select[name=user_id] option').filter({ hasText: 'Judge Anna' })).toHaveCount(1);
});
