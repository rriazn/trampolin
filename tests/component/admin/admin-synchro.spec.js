const { test, expect } = require('@playwright/test');

let seed;

async function login(page, email, password, landing) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(landing);
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed/synchro');
  seed = await res.json();
});

test.describe('competition form type select', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin@test.com', 'admin123', '/admin');
  });

  test('offers individual and synchro, defaulting to individual', async ({ page }) => {
    await page.goto('/admin/competitions/new');
    const type = page.locator('select[name=type]');
    await expect(type.locator('option')).toHaveText(['Individual', 'Synchro']);
    await expect(type).toHaveValue('individual');
  });

  test('only offers individual panels for an individual competition', async ({ page }) => {
    await page.goto('/admin/competitions/new');
    const panel = page.locator('select[name=panel_template_id]');
    await expect(panel.locator('option:not([hidden])')).toContainText(['— None selected —', 'FIG Panel']);
    await expect(panel.locator('option', { hasText: 'FIG Synchro Panel' })).toBeHidden();
  });

  test('switching to synchro swaps the available panels', async ({ page }) => {
    await page.goto('/admin/competitions/new');
    await page.locator('select[name=type]').selectOption('synchro');
    const panel = page.locator('select[name=panel_template_id]');
    await expect(panel.locator('option', { hasText: 'FIG Synchro Panel' })).toBeAttached();
    await expect(panel.locator('option:not([hidden])')).toContainText(['— None selected —', 'FIG Synchro Panel', 'Local Synchro Panel']);
    await expect(panel.locator('option', { hasText: /^FIG Panel$/ })).toBeHidden();
  });

  test('switching the type clears a panel that no longer matches', async ({ page }) => {
    await page.goto('/admin/competitions/new');
    await page.locator('select[name=panel_template_id]').selectOption({ label: 'FIG Panel' });
    await page.locator('select[name=type]').selectOption('synchro');
    await expect(page.locator('select[name=panel_template_id]')).toHaveValue('');
  });

  test('locks the type of a competition that already has athletes', async ({ page }) => {
    await page.goto(`/admin/competitions/${seed.competitionId}/edit`);
    await expect(page.locator('select[name=type]')).toBeDisabled();
    await expect(page.getByText('The type cannot be changed once athletes or judges have been added.')).toBeVisible();
  });

  test('keeps the type select enabled for a competition with no athletes or judges', async ({ page }) => {
    await page.goto('/admin/competitions/new');
    await page.locator('input[name=name]').fill('Empty Synchro Cup');
    await page.locator('select[name=type]').selectOption('synchro');
    await page.getByRole('button', { name: /Create/ }).click();
    await page.waitForURL('/admin/competitions');
    await page.getByRole('row').filter({ hasText: 'Empty Synchro Cup' }).getByRole('link').last().click();
    await expect(page.locator('select[name=type]')).toBeEnabled();
  });
});

test.describe('competitions list', () => {
  test('shows the competition type of each competition', async ({ page }) => {
    await login(page, 'admin@test.com', 'admin123', '/admin');
    await page.goto('/admin/competitions');
    await expect(page.getByRole('row').filter({ hasText: 'Pairs Cup' }).getByText('Synchro')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Solo Cup' }).getByText('Individual')).toBeVisible();
  });
});

test.describe('athlete form', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin@test.com', 'admin123', '/admin');
  });

  test('shows a single athlete block for an individual competition', async ({ page }) => {
    await page.goto(`/admin/competitions/${seed.individualCompetitionId}/sportsmen/new`);
    await expect(page.locator('input[name=name]')).toBeVisible();
    await expect(page.locator('input[name=partner_name]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Athlete 2' })).toHaveCount(0);
  });

  test('shows an Athlete 1 and an Athlete 2 block for a synchro competition', async ({ page }) => {
    await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen/new`);
    await expect(page.getByRole('heading', { name: 'Athlete 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Athlete 2' })).toBeVisible();
    for (const field of ['partner_name', 'partner_club', 'partner_gender', 'partner_birth_year']) {
      await expect(page.locator(`[name=${field}]`)).toBeVisible();
    }
  });

  test('prefills both athletes when editing a pair', async ({ page }) => {
    await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen/${seed.pairId}/edit`);
    await expect(page.locator('input[name=name]')).toHaveValue('Leon Weber');
    await expect(page.locator('input[name=partner_name]')).toHaveValue('Emma Fischer');
    await expect(page.locator('input[name=partner_club]')).toHaveValue('SV Hamburg');
    await expect(page.locator('select[name=partner_gender]')).toHaveValue('f');
    await expect(page.locator('input[name=partner_birth_year]')).toHaveValue('2009');
  });

  test('marks the second athlete name as required', async ({ page }) => {
    await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen/new`);
    await expect(page.locator('input[name=partner_name]')).toHaveAttribute('required', '');
  });

  test('shows the server error when the second athlete name is missing', async ({ page }) => {
    await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen/new`);
    await page.locator('input[name=partner_name]').evaluate((el) => el.removeAttribute('required'));
    await page.locator('input[name=name]').fill('Only One');
    await page.getByRole('button', { name: /Create/ }).click();
    await expect(page.getByText('The name of the second athlete is required.')).toBeVisible();
  });
});

test.describe('pair display', () => {
  test('the athletes list shows "A / B" and one club when both share it', async ({ page }) => {
    await login(page, 'admin@test.com', 'admin123', '/admin');
    await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen`);
    const mixed = page.getByRole('row').filter({ hasText: 'Leon Weber' });
    await expect(mixed.getByText('Leon Weber / Emma Fischer')).toBeVisible();
    await expect(mixed.getByText('TSV München / SV Hamburg')).toBeVisible();
    const shared = page.getByRole('row').filter({ hasText: 'Anna Klein' });
    await expect(shared.getByText('Anna Klein / Mia Braun')).toBeVisible();
    await expect(shared.getByText('TSV München', { exact: true })).toBeVisible();
  });

  test('the entries list shows the pair', async ({ page }) => {
    await login(page, 'admin@test.com', 'admin123', '/admin');
    await page.goto(`/admin/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}/entries`);
    await expect(page.getByRole('row').filter({ hasText: 'Leon Weber' }).getByText('Leon Weber / Emma Fischer')).toBeVisible();
    await expect(page.locator('select[name=sportsman_id] option', { hasText: 'Anna Klein / Mia Braun' })).toBeAttached();
  });

  test('the leaderboard shows the pair with both names', async ({ page }) => {
    await login(page, 'admin@test.com', 'admin123', '/admin');
    await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    await expect(page.getByText('Leon Weber / Emma Fischer')).toBeVisible();
  });

  test('the referee attempt card shows the pair and both clubs', async ({ page }) => {
    await login(page, 'syncexec@test.com', 'ref123', '/referee');
    await page.goto(`/referee/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    await expect(page.getByText('Leon Weber / Emma Fischer')).toBeVisible();
    await expect(page.getByText('TSV München / SV Hamburg')).toBeVisible();
  });

  test('the head judge attempt card shows the pair', async ({ page }) => {
    await login(page, 'synchj@test.com', 'hj123', '/head-judge');
    await page.goto(`/head-judge/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    await expect(page.getByText('Leon Weber / Emma Fischer').first()).toBeVisible();
  });
});

test.describe('referee scoring sheet for a synchro panel', () => {
  test('an execution judge gets the landing line', async ({ page }) => {
    await login(page, 'syncexec@test.com', 'ref123', '/referee');
    await page.goto(`/referee/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    await expect(page.getByText('Landing')).toBeVisible();
  });

  test('a per-skill synchronisation judge gets the ten skills but no landing line', async ({ page }) => {
    await login(page, 'syncskill@test.com', 'ref123', '/referee');
    await page.goto(`/referee/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    await expect(page.locator('input[name=element_10]').first()).toBeAttached();
    await expect(page.getByText('Landing')).toHaveCount(0);
    await expect(page.locator('input[name=element_11]')).toHaveCount(0);
  });
});

test.describe('execution judge own value', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/synchro');
    seed = await res.json();
  });

  test('shows the judge\'s own score after saving, not the trampoline share', async ({ page }) => {
    await login(page, 'syncexec@test.com', 'ref123', '/referee');
    await page.goto(`/referee/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    // one deduction on trick 1, all other lines stay at the default 0
    await page.locator('input[name=element_1][value="0.5"]').check();
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.getByText('Current Execution Trampoline 1 value:')).toBeVisible();
    await expect(page.locator('p', { hasText: 'Current Execution Trampoline 1 value:' }).locator('strong')).toHaveText('9.50');
  });
});

test.describe('synchronisation device mark input', () => {
  test('accepts hundredths between 0 and 10', async ({ page }) => {
    await login(page, 'syncdevice@test.com', 'ref123', '/referee');
    await page.goto(`/referee/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
    const input = page.locator('input[name=score]');
    await expect(input).toHaveAttribute('step', '0.01');
    await expect(input).toHaveAttribute('min', '0');
    await expect(input).toHaveAttribute('max', '10');
    await input.fill('8.55');
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.getByText('Score 8.55 saved.')).toBeVisible();
    await expect(page.locator('input[name=score]')).toHaveValue('8.55');
  });
});

test.describe('synchronisation device mark on a shortened routine', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/synchro?elementCount=6');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, 'syncdevice@test.com', 'ref123', '/referee');
    await page.goto(`/referee/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  });

  test('limits the input to the number of valid elements', async ({ page }) => {
    const input = page.locator('input[name=score]');
    await expect(input).toHaveAttribute('max', '6');
    await expect(input).toHaveAttribute('placeholder', '0–6');
  });

  test('blocks a mark above the number of valid elements in the browser', async ({ page }) => {
    const input = page.locator('input[name=score]');
    await input.fill('7');
    expect(await input.evaluate((el) => el.validity.rangeOverflow)).toBe(true);
  });

  test('accepts a mark equal to the number of valid elements', async ({ page }) => {
    await page.locator('input[name=score]').fill('6');
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.getByText('Score 6.00 saved.')).toBeVisible();
  });
});

