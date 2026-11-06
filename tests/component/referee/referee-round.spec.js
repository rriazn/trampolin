const { test, expect } = require('@playwright/test');

let seed;

async function loginAsReferee(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('ref@test.com');
  await page.locator('input[name=password]').fill('ref123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/referee');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/referee/competitions/1/groups/1/rounds/1');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as referee', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed/scored');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsReferee(page);
    await page.goto(`/referee/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  });

  // Page structure

  test('shows the round name as the heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Finals' })).toBeVisible();
  });

  test('shows the competition name and group name as subtitle', async ({ page }) => {
    await expect(page.locator('.page-hero p').getByText('Championship · Group A')).toBeVisible();
  });

  test('shows a "Back to dashboard" button', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
  });

  // Current attempt (round starts on Bob's first attempt)

  test('shows the current athlete\'s name, club and routine', async ({ page }) => {
    await expect(page.getByText('Bob').first()).toBeVisible();
    await expect(page.getByText('DMT')).toBeVisible();
  });

  test('shows the attempt number badge', async ({ page }) => {
    await expect(page.getByText('1 · Voluntary routine')).toBeVisible();
  });

  test('shows a custom attempt name instead of the default', async ({ page }) => {
    await page.request.post('/test/attempt-name', { form: { roundId: seed.roundId, number: 1, name: 'Warm-up & Co' } });
    await page.reload();
    await expect(page.getByText('1 · Warm-up & Co')).toBeVisible();
    await expect(page.getByText('1 · Voluntary routine')).toHaveCount(0);
    await page.request.post('/test/attempt-name', { form: { roundId: seed.roundId, number: 1, name: '' } });
  });

  test('shows the assigned judge role\'s name as a heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Time of Flight' })).toBeVisible();
  });

  test('the score input is reachable by the judge role name', async ({ page }) => {
    await expect(page.getByRole('spinbutton', { name: 'Time of Flight' })).toHaveValue('9.2');
  });

  test('pre-fills the previously saved score', async ({ page }) => {
    await expect(page.locator('input[name=score]')).toHaveValue('9.2');
  });

  // Back button

  test('"Back to dashboard" button navigates to the referee dashboard', async ({ page }) => {
    await page.getByRole('link', { name: 'Back to dashboard' }).click();
    await page.waitForURL('/referee');
  });

  // Next and back

  test('shows a "Next" button once the judge has saved their score', async ({ page }) => {
    await expect(page.getByTestId('next-athlete')).toBeVisible();
  });

  test('"Next" shows the waiting message, which survives a refresh', async ({ page }) => {
    await page.getByTestId('next-athlete').click();
    await expect(page.getByText('Wait for the head judge to unlock the next athlete, then refresh.')).toBeVisible();
    await expect(page.locator('input[name=score]')).toHaveCount(0);

    await page.reload();
    await expect(page.getByText('Wait for the head judge to unlock the next athlete, then refresh.')).toBeVisible();
  });

  test('"Back" on the waiting screen returns to the scoring form', async ({ page }) => {
    await page.getByTestId('next-athlete').click();
    await page.getByTestId('waiting').getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('input[name=score]')).toHaveValue('9.2');
    await expect(page.getByTestId('next-athlete')).toBeVisible();
  });

  // Score submission

  test('submitting a score saves it and shows a flash message', async ({ page }) => {
    await page.locator('input[name=score]').fill('8.0');
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.locator('.alert-success')).toContainText('Score 8.0 saved.');
  });

  test('resubmitting updates the pre-filled value', async ({ page }) => {
    await page.locator('input[name=score]').fill('7.5');
    await page.getByRole('button', { name: /Save/ }).click();
    await page.waitForURL(/\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
    await expect(page.locator('input[name=score]')).toHaveValue('7.5');
  });
});

test.describe('turn states', () => {
  test('shows a "not started" message when the round has not begun', async ({ page, request }) => {
    const res = await request.post('/test/seed');
    const basicSeed = await res.json();

    // the basic seed has no attempts yet, so current_attempt_id stays null and the round page treats it as "not started"
    await page.goto('/login');
    await page.locator('input[name=email]').fill('referee1@test.com');
    await page.locator('input[name=password]').fill('ref123');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('/referee');

    await page.goto(`/referee/competitions/${basicSeed.competitionId}/groups/${basicSeed.groupId}/rounds/${basicSeed.roundId}`);
    await expect(page.getByText('Round not started yet')).toBeVisible();
  });
});

async function loginAs(page, email, password) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
}

// seeds the local-panel fixture and starts its round as the head judge, mirroring how a round actually gets started
async function seedAndStartLocalPanelRound(page, request) {
  const res = await request.post('/test/seed/head-judge');
  const hjSeed = await res.json();
  await loginAs(page, 'hjhead@test.com', 'hj123');
  await page.waitForURL('/head-judge');
  await page.goto(`/head-judge/competitions/${hjSeed.competitionId}/groups/${hjSeed.groupId}/rounds/${hjSeed.roundId}`);
  await page.getByRole('button', { name: /Start Round/ }).click();
  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');
  return hjSeed;
}

test.describe('execution judge: checkbox deductions', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedAndStartLocalPanelRound(page, request);
    await loginAs(page, 'hjexec1@test.com', 'ref123');
    await page.waitForURL('/referee');
    await page.getByText('Group A · Finals').click();
    await page.waitForURL(/\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
  });

  test('shows one line per trick with 6 deduction checkboxes each (0, 0.1, 0.2, 0.3, 0.4, 0.5)', async ({ page }) => {
    await expect(page.getByText('Trick 1')).toBeVisible();
    await expect(page.locator('input[type=radio][name=element_1]')).toHaveCount(6);
  });

  test('each trick is a named radio group that includes the judge role', async ({ page }) => {
    await expect(page.getByRole('group', { name: /Execution.*Trick 1/ })).toBeVisible();
    await expect(page.getByRole('group', { name: /Execution.*Trick 1/ }).getByRole('radio')).toHaveCount(6);
  });

  test('deduction options are at least 44px tall so they can be tapped', async ({ page }) => {
    const box = await page.locator('.score-option').first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('all deduction options have the same size, whatever their label', async ({ page }) => {
    const sizes = await page.locator('.score-option').evaluateAll(els => els.map(el => {
      const box = el.getBoundingClientRect();
      return `${Math.round(box.width)}x${Math.round(box.height)}`;
    }));
    expect(sizes.length).toBeGreaterThan(1);
    expect(new Set(sizes).size).toBe(1);
  });

  test('the label of a deduction option fits inside its box', async ({ page }) => {
    const overflowing = await page.locator('.score-option').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth).length);
    expect(overflowing).toBe(0);
  });

  test('does not show a landing line when the attempt has only 1 trick', async ({ page }) => {
    await expect(page.getByText('Landing')).not.toBeVisible();
  });

  test('defaults to 0 selected and lets the judge check a different deduction', async ({ page }) => {
    const zeroBox = page.locator('input[type=radio][name=element_1][value="0"]');
    await expect(zeroBox).toBeChecked();
    await page.locator('input[type=radio][name=element_1][value="0.3"]').check();
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.locator('.alert-success')).toBeVisible();
    await expect(page.locator('input[type=radio][name=element_1][value="0.3"]')).toBeChecked();
  });
});

test.describe('difficulty judge: x10 numeral inputs and bonus', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedAndStartLocalPanelRound(page, request);
    await loginAs(page, 'hjdiff@test.com', 'ref123');
    await page.waitForURL('/referee');
    await page.getByText('Group A · Finals').click();
    await page.waitForURL(/\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
  });

  test('shows a numeral input per trick and a separate Bonus line', async ({ page }) => {
    await expect(page.getByText('Trick 1')).toBeVisible();
    await expect(page.getByText('Bonus')).toBeVisible();
    await expect(page.locator('input[name=element_1]')).toBeVisible();
    await expect(page.locator('input[name=element_11]')).toBeVisible();
  });

  test('submitting "12" for a trick stores and redisplays it as entered (true value 1.2)', async ({ page }) => {
    await page.locator('input[name=element_1]').fill('12');
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.locator('.alert-success')).toBeVisible();
    await expect(page.locator('input[name=element_1]')).toHaveValue('12');
  });

  test('the bonus input is optional (not required) and can be left blank', async ({ page }) => {
    await expect(page.locator('input[name=element_11]')).not.toHaveAttribute('required', '');
  });

  test('shows a "Missing compulsory skill" line with two radio options (0 and 2)', async ({ page }) => {
    await expect(page.getByText('Missing compulsory skill')).toBeVisible();
    await expect(page.locator('input[type=radio][name=element_12]')).toHaveCount(2);
  });

  test('defaults to 0 selected and lets the judge check the 2.0 penalty', async ({ page }) => {
    const zeroBox = page.locator('input[type=radio][name=element_12][value="0"]');
    await expect(zeroBox).toBeChecked();
    await page.locator('input[type=radio][name=element_12][value="2"]').check();
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.locator('.alert-success')).toBeVisible();
    await expect(page.locator('input[type=radio][name=element_12][value="2"]')).toBeChecked();
  });
});
