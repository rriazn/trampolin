const { test, expect } = require('@playwright/test');

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@example.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

async function loginAsReferee(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('maria@example.com');
  await page.locator('input[name=password]').fill('referee123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/referee');
}

async function loginAsHeadJudge(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('petra@example.com');
  await page.locator('input[name=password]').fill('headjudge123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/head-judge');
}

async function loginAsDifficultyJudge(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('judgedana@example.com');
  await page.locator('input[name=password]').fill('judge123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/referee');
}

async function logout(page) {
  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');
}

let seed;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  expect(res.ok()).toBeTruthy();
  seed = await res.json();
});

const refereeRoundUrlPattern = /\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/;
const adminEntriesUrlPattern = /\/admin\/competitions\/\d+\/groups\/\d+\/rounds\/\d+\/entries/;

test('athlete with attempts but no scores shows as unscored on the leaderboard', async ({ page }) => {
  // The seed creates entries and attempts but no scores — all athletes appear with dash scores
  await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  // .lb-score elements only render when bestScore !== null
  await expect(page.locator('.lb-score')).toHaveCount(0);
});

// The seed's fig-panel competition only staffs time_of_flight and head_judge, so its round can
// never reach isComplete (execution/difficulty/horizontal_displacement have no judges to submit
// for) and head-judge.js can't advance it past Leon's first attempt. Rather than staffing all 9
// fig-panel judges here, this test builds its own lightweight Test Panel competition (1 execution,
// 1 difficulty, 1 head judge) and drives the real Start/Next/Complete flow through it.
let lifecycle = {};

test('referee scores both attempts for all athletes and the leaderboard shows complete results', async ({ page }) => {
  test.setTimeout(120_000); // builds a whole competition and cycles through 3 judge logins per attempt x4 attempts
  await loginAsAdmin(page);

  // Create a referee to hold the difficulty role (Maria and Petra, from the seed, cover execution
  // and head judge respectively — a user may only hold one role per competition, but Maria/Petra's
  // seeded roles are on a *different* competition, so they're free to be reused here).
  await page.goto('/admin/users/new');
  await page.locator('input[name=name]').fill('Judge Dana');
  await page.locator('input[name=email]').fill('judgedana@example.com');
  await page.locator('input[name=password]').fill('judge123');
  await page.locator('select[name=role]').selectOption('referee');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/admin/users');

  // Create and activate a Test Panel competition
  await page.goto('/admin/competitions/new');
  await page.locator('input[name=name]').fill('Regional Cup');
  await page.locator('select[name=panel_template_id]').selectOption({ label: 'Test Panel' });
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/admin/competitions');

  const compRow = page.getByRole('row').filter({ hasText: 'Regional Cup' });
  await compRow.getByRole('button', { name: /Activate/ }).click();
  await expect(compRow.getByRole('cell', { name: 'active' })).toBeVisible();
  await compRow.getByRole('link', { name: /Groups/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups/);
  const [, compId] = page.url().match(/\/competitions\/(\d+)/);

  await page.goto(`/admin/competitions/${compId}/groups`);
  await page.locator('input[name=name]').fill('Group A');
  await page.locator('input[name=abbreviation]').fill('GA');
  await page.locator('button[type=submit]').click();

  // Athletes — entries are scoped to the round's group, so each athlete is assigned to it here
  for (const [name, club] of [['Leon Weber', 'TSV München'], ['Emma Fischer', 'SV Hamburg']]) {
    await page.goto(`/admin/competitions/${compId}/sportsmen/new`);
    await page.locator('input[name=name]').fill(name);
    await page.locator('input[name=club]').fill(club);
    await page.locator('select[name=group_id]').selectOption({ label: 'Group A' });
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(`/admin/competitions/${compId}/sportsmen`);
  }

  await page.goto(`/admin/competitions/${compId}/groups`);
  const groupRow = page.getByRole('row').filter({ hasText: 'Group A' });
  await groupRow.getByRole('link', { name: /Rounds/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds/);
  const [, groupId] = page.url().match(/\/groups\/(\d+)/);

  await page.locator('input[name=name]').fill('Qualifications');
  await page.locator('input[name=round_order]').fill('1');
  await page.locator('select[name=scoring_mode]').selectOption('best_attempt');
  await page.locator('button[type=submit]').click();
  const roundRow = page.getByRole('row').filter({ hasText: 'Qualifications' });
  await roundRow.getByRole('link', { name: /Entries/ }).click();
  await page.waitForURL(adminEntriesUrlPattern);
  const [, round1Id] = page.url().match(/\/rounds\/(\d+)\/entries/);

  await page.locator('select[name=sportsman_id]').selectOption({ label: 'Leon Weber · TSV München' });
  await page.locator('input[name=start_order]').fill('1');
  await page.locator('form').filter({ has: page.locator('select[name=sportsman_id]') }).getByRole('button', { name: /Add/ }).click();
  await page.waitForURL(adminEntriesUrlPattern);

  await page.locator('select[name=sportsman_id]').selectOption({ label: 'Emma Fischer · SV Hamburg' });
  await page.locator('input[name=start_order]').fill('2');
  await page.locator('form').filter({ has: page.locator('select[name=sportsman_id]') }).getByRole('button', { name: /Add/ }).click();
  await page.waitForURL(adminEntriesUrlPattern);

  page.once('dialog', dialog => dialog.accept());
  await Promise.all([
    page.waitForURL(adminEntriesUrlPattern),
    page.getByRole('button', { name: /Create All Attempts/ }).click(),
  ]);

  // Staff the Test Panel
  await page.goto(`/admin/competitions/${compId}/judges`);
  const executionCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Execution' }) });
  await executionCard.locator('select[name=user_id]').selectOption({ label: 'Maria Schmidt · maria@example.com' });
  await executionCard.getByRole('button', { name: /Assign/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

  const difficultyCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Difficulty' }) });
  await difficultyCard.locator('select[name=user_id]').selectOption({ label: 'Judge Dana · judgedana@example.com' });
  await difficultyCard.getByRole('button', { name: /Assign/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

  const headJudgeCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Head Judge (Penalties)' }) });
  await headJudgeCard.locator('select[name=user_id]').selectOption({ label: 'Petra Voss · petra@example.com' });
  await headJudgeCard.getByRole('button', { name: /Assign/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

  await logout(page);

  lifecycle = { compId, groupId, round1Id };
  const hjUrl = `/head-judge/competitions/${compId}/groups/${groupId}/rounds/${round1Id}`;
  const refUrl = `/referee/competitions/${compId}/groups/${groupId}/rounds/${round1Id}`;

  await loginAsHeadJudge(page);
  await page.goto(hjUrl);
  await page.getByRole('button', { name: /Start Round/ }).click();
  await logout(page);

  // Judge each of the 4 attempts with a single trick each: execution deduction 0 (contributes
  // elementCount(1) - 0 = 1) and a difficulty entry that produces the target total. The
  // round-robin turn order is by attempt_number then start_order, i.e. Leon A1, Emma A1, Leon A2,
  // Emma A2 — not both of Leon's attempts before Emma's.
  // Leon: 8.5, 9.0 (best) — Emma: 7.0, 8.0 (best)
  const attempts = [
    { difficultyEntry: '75' }, // Leon attempt 1 → 1 + 7.5 = 8.5
    { difficultyEntry: '60' }, // Emma attempt 1 → 1 + 6.0 = 7.0
    { difficultyEntry: '80' }, // Leon attempt 2 → 1 + 8.0 = 9.0
    { difficultyEntry: '70' }, // Emma attempt 2 → 1 + 7.0 = 8.0
  ];

  for (const { difficultyEntry } of attempts) {
    await loginAsHeadJudge(page);
    await page.goto(hjUrl);
    const trickCountCard = page.locator('.card').filter({ hasText: 'Trick count' });
    await trickCountCard.locator('input[name=element_count]').fill('1');
    await trickCountCard.getByRole('button', { name: /Save/ }).click();
    const penaltyCard = page.locator('.card').filter({ hasText: 'head judge penalty' });
    await penaltyCard.locator('input[name=score]').fill('0');
    await penaltyCard.getByRole('button', { name: /Save/ }).click();
    await logout(page);

    await loginAsReferee(page);
    await page.goto(refUrl);
    await page.locator('input[type=radio][name=element_1][value="0"]').check();
    await page.getByRole('button', { name: /Save/ }).click();
    await logout(page);

    await loginAsDifficultyJudge(page);
    await page.goto(refUrl);
    await page.locator('input[name=element_1]').fill(difficultyEntry);
    await page.getByRole('button', { name: /Save/ }).click();
    await logout(page);

    await loginAsHeadJudge(page);
    await page.goto(hjUrl);
    await page.getByRole('button', { name: /Next/ }).click();
    await logout(page);
  }

  await page.goto(`/leaderboard/competitions/${compId}/groups/${groupId}/rounds/${round1Id}`);
  const rows = page.locator('tbody tr');
  await expect(rows.nth(0)).toContainText('Leon Weber');
  await expect(rows.nth(0)).toContainText('9.000');
  await expect(rows.nth(1)).toContainText('Emma Fischer');
  await expect(rows.nth(1)).toContainText('8.000');

  // Both attempt columns are populated
  await expect(rows.nth(0)).toContainText('8.500'); // Leon attempt 1
  await expect(rows.nth(1)).toContainText('7.000'); // Emma attempt 1
});

test('removing an entry removes the athlete from the leaderboard', async ({ page }) => {
  await loginAsReferee(page);
  await page.getByText('Qualifications').click();
  await page.waitForURL(refereeRoundUrlPattern);

  // Score Leon (the round's current attempt) so he appears on the leaderboard
  await expect(page.getByText('Leon Weber')).toBeVisible();
  await page.locator('input[name=score]').fill('8.0');
  await page.getByRole('button', { name: /Save/ }).click();
  await page.waitForURL(refereeRoundUrlPattern);

  // Verify Leon is on the leaderboard
  await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  await expect(page.getByRole('cell', { name: 'Leon Weber' })).toBeVisible();

  // Log out referee before switching to admin (login page redirects authenticated users)
  await page.goto('/referee');
  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');

  // Admin removes Leon's entry
  await loginAsAdmin(page);
  await page.goto(`/admin/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}/entries`);
  const entryRow = page.getByRole('row').filter({ hasText: 'Leon Weber' });
  page.once('dialog', dialog => dialog.accept());
  await entryRow.locator('button.btn-outline-danger').click();
  await expect(page.getByRole('row').filter({ hasText: 'Leon Weber' })).not.toBeVisible();

  // Leaderboard no longer shows Leon
  await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  await expect(page.getByRole('cell', { name: 'Leon Weber' })).not.toBeVisible();
});

// Continues the "Regional Cup" fixture built above: its panel is already fully staffed, so a
// second round in the same group can be started immediately without any extra setup.
test('admin adds a second round to a group and referee sees both rounds on the dashboard', async ({ page }) => {
  const { compId, groupId } = lifecycle;

  await loginAsAdmin(page);
  await page.goto(`/admin/competitions/${compId}/groups/${groupId}/rounds`);

  await page.locator('input[name=name]').fill('Finals');
  await page.locator('input[name=round_order]').fill('2');
  await page.locator('select[name=scoring_mode]').selectOption('best_attempt');
  await page.locator('button[type=submit]').click();

  // Navigate to entries for the new Finals round
  const finalsRow = page.getByRole('row').filter({ hasText: 'Finals' });
  await finalsRow.getByRole('link', { name: /Entries/ }).click();
  await page.waitForURL(adminEntriesUrlPattern);
  const [, round2Id] = page.url().match(/\/rounds\/(\d+)\/entries/);

  // Finals has a previous round (Qualifications), so options are prefixed with the athlete's
  // rank there — Leon scored 9.000 vs Emma's 8.000, so he's "#1"
  await page.locator('select[name=sportsman_id]').selectOption({ label: '#1 · Leon Weber · TSV München' });
  await page.locator('input[name=start_order]').fill('1');
  await page.locator('form').filter({ has: page.locator('select[name=sportsman_id]') }).getByRole('button', { name: /Add/ }).click();
  await page.waitForURL(adminEntriesUrlPattern);

  page.once('dialog', dialog => dialog.accept());
  await Promise.all([
    page.waitForURL(adminEntriesUrlPattern),
    page.getByRole('button', { name: /Create All Attempts/ }).click(),
  ]);

  await logout(page);

  // Start Finals — the panel is already fully staffed from the Qualifications setup above
  await loginAsHeadJudge(page);
  await page.goto(`/head-judge/competitions/${compId}/groups/${groupId}/rounds/${round2Id}`);
  await page.getByRole('button', { name: /Start Round/ }).click();
  await logout(page);

  await loginAsReferee(page);
  await expect(page.getByText('Qualifications')).toBeVisible();
  await expect(page.getByText('Finals')).toBeVisible();

  lifecycle = { ...lifecycle, round2Id };
});

// Depends on the previous test's Finals round: Leon is already entered there, and only Emma
// (ranked #2 behind Leon's 9.000 in Qualifications) remains available to add.
test('entries dropdown for a later round sorts athletes by their previous round placement', async ({ page }) => {
  const { compId, groupId, round2Id } = lifecycle;

  await loginAsAdmin(page);
  await page.goto(`/admin/competitions/${compId}/groups/${groupId}/rounds`);

  const finalsRow = page.getByRole('row').filter({ hasText: 'Finals' });
  await finalsRow.getByRole('link', { name: /Entries/ }).click();
  await page.waitForURL(adminEntriesUrlPattern);
  expect(page.url()).toContain(`/rounds/${round2Id}/entries`);

  // Label tells the admin which round the ranking comes from
  await expect(page.locator('label').filter({ hasText: /ranked by Qualifications/i })).toBeVisible();

  // Leon is already entered in Finals, so Emma is the only available option — shown with her
  // real rank (#2) from Qualifications, where Leon outscored her (9.000 vs 8.000)
  const firstOption = page.locator('select[name=sportsman_id] option').first();
  await expect(firstOption).toContainText('#2');
  await expect(firstOption).toContainText('Emma Fischer');
});

// A standalone competition/round so this test isn't coupled to the "Regional Cup" fixture's
// state — it only needs its own athlete scored across two attempts. Reuses Maria/Judge Dana/Petra
// (already created above) to staff the panel, same as the "Regional Cup" flow.
test('a round set to "sum" scoring mode totals all attempts on the leaderboard, not just the best one', async ({ page }) => {
  test.setTimeout(60_000);
  await loginAsAdmin(page);

  await page.goto('/admin/competitions/new');
  await page.locator('input[name=name]').fill('Sum Mode Cup');
  await page.locator('select[name=panel_template_id]').selectOption({ label: 'Test Panel' });
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/admin/competitions');

  const compRow = page.getByRole('row').filter({ hasText: 'Sum Mode Cup' });
  await compRow.getByRole('button', { name: /Activate/ }).click();
  await expect(compRow.getByRole('cell', { name: 'active' })).toBeVisible();
  await compRow.getByRole('link', { name: /Groups/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups/);
  const [, compId] = page.url().match(/\/competitions\/(\d+)/);

  await page.goto(`/admin/competitions/${compId}/groups`);
  await page.locator('input[name=name]').fill('Group A');
  await page.locator('input[name=abbreviation]').fill('GA');
  await page.locator('button[type=submit]').click();

  await page.goto(`/admin/competitions/${compId}/sportsmen/new`);
  await page.locator('input[name=name]').fill('Sam Weiss');
  await page.locator('input[name=club]').fill('TV Köln');
  await page.locator('select[name=group_id]').selectOption({ label: 'Group A' });
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/admin/competitions/${compId}/sportsmen`);

  await page.goto(`/admin/competitions/${compId}/groups`);
  const groupRow = page.getByRole('row').filter({ hasText: 'Group A' });
  await groupRow.getByRole('link', { name: /Rounds/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds/);
  const [, groupId] = page.url().match(/\/groups\/(\d+)/);

  await page.locator('input[name=name]').fill('Finals');
  await page.locator('input[name=round_order]').fill('1');
  await page.locator('select[name=scoring_mode]').selectOption('sum');
  await page.locator('button[type=submit]').click();
  const roundRow = page.getByRole('row').filter({ hasText: 'Finals' });
  await roundRow.getByRole('link', { name: /Entries/ }).click();
  await page.waitForURL(adminEntriesUrlPattern);
  const [, roundId] = page.url().match(/\/rounds\/(\d+)\/entries/);

  await page.locator('select[name=sportsman_id]').selectOption({ label: 'Sam Weiss · TV Köln' });
  await page.locator('input[name=start_order]').fill('1');
  await page.locator('form').filter({ has: page.locator('select[name=sportsman_id]') }).getByRole('button', { name: /Add/ }).click();
  await page.waitForURL(adminEntriesUrlPattern);

  await page.locator('input[name=attempt_count]').fill('2');
  page.once('dialog', dialog => dialog.accept());
  await Promise.all([
    page.waitForURL(adminEntriesUrlPattern),
    page.getByRole('button', { name: /Create All Attempts/ }).click(),
  ]);

  await page.goto(`/admin/competitions/${compId}/judges`);
  const executionCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Execution' }) });
  await executionCard.locator('select[name=user_id]').selectOption({ label: 'Maria Schmidt · maria@example.com' });
  await executionCard.getByRole('button', { name: /Assign/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

  const difficultyCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Difficulty' }) });
  await difficultyCard.locator('select[name=user_id]').selectOption({ label: 'Judge Dana · judgedana@example.com' });
  await difficultyCard.getByRole('button', { name: /Assign/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

  const headJudgeCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Head Judge (Penalties)' }) });
  await headJudgeCard.locator('select[name=user_id]').selectOption({ label: 'Petra Voss · petra@example.com' });
  await headJudgeCard.getByRole('button', { name: /Assign/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

  await logout(page);

  const hjUrl = `/head-judge/competitions/${compId}/groups/${groupId}/rounds/${roundId}`;
  const refUrl = `/referee/competitions/${compId}/groups/${groupId}/rounds/${roundId}`;

  await loginAsHeadJudge(page);
  await page.goto(hjUrl);
  await page.getByRole('button', { name: /Start Round/ }).click();
  await logout(page);

  // Sam's best single attempt (10.0) would rank lower than a hypothetical better single attempt
  // elsewhere, but in "sum" mode what matters is the total across both: 7.0 + 10.0 = 17.0
  const attempts = [
    { difficultyEntry: '60' }, // attempt 1 → 1 + 6.0 = 7.0
    { difficultyEntry: '90' }, // attempt 2 → 1 + 9.0 = 10.0
  ];

  for (const { difficultyEntry } of attempts) {
    await loginAsHeadJudge(page);
    await page.goto(hjUrl);
    const trickCountCard = page.locator('.card').filter({ hasText: 'Trick count' });
    await trickCountCard.locator('input[name=element_count]').fill('1');
    await trickCountCard.getByRole('button', { name: /Save/ }).click();
    const penaltyCard = page.locator('.card').filter({ hasText: 'head judge penalty' });
    await penaltyCard.locator('input[name=score]').fill('0');
    await penaltyCard.getByRole('button', { name: /Save/ }).click();
    await logout(page);

    await loginAsReferee(page);
    await page.goto(refUrl);
    await page.locator('input[type=radio][name=element_1][value="0"]').check();
    await page.getByRole('button', { name: /Save/ }).click();
    await logout(page);

    await loginAsDifficultyJudge(page);
    await page.goto(refUrl);
    await page.locator('input[name=element_1]').fill(difficultyEntry);
    await page.getByRole('button', { name: /Save/ }).click();
    await logout(page);

    await loginAsHeadJudge(page);
    await page.goto(hjUrl);
    await page.getByRole('button', { name: /Next/ }).click();
    await logout(page);
  }

  await page.goto(`/leaderboard/competitions/${compId}/groups/${groupId}/rounds/${roundId}`);
  await expect(page.getByRole('columnheader', { name: 'Total Score' })).toBeVisible();
  const row = page.locator('tbody tr').filter({ hasText: 'Sam Weiss' });
  await expect(row).toContainText('17.000');
});
