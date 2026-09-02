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

async function loginAs(page, email, password) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/referee');
}

async function logout(page) {
  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');
}

async function createUser(page, name, email, role, password = 'judge123') {
  await page.goto('/admin/users/new');
  await page.locator('input[name=name]').fill(name);
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('select[name=role]').selectOption(role);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/admin/users');
}

// Creates and activates a competition on the given panel, with one group/round/sportsman and one
// attempt already created. Returns the ids needed to navigate the head-judge/referee/leaderboard
// pages. Panel staffing is left to the caller.
async function seedSingleAttemptCompetition(page, { competitionName, panelLabel, sportsmanName = 'Nora Voigt', club = 'TSV Köln' }) {
  await page.goto('/admin/competitions/new');
  await page.locator('input[name=name]').fill(competitionName);
  await page.locator('select[name=panel_template_id]').selectOption({ label: panelLabel });
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/admin/competitions');

  const compRow = page.getByRole('row').filter({ hasText: competitionName });
  await compRow.getByRole('button', { name: /Activate/ }).click();
  await expect(compRow.getByRole('cell', { name: 'active' })).toBeVisible();
  await compRow.getByRole('link', { name: /Groups/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups/);
  const [, compId] = page.url().match(/\/competitions\/(\d+)/);

  await page.goto(`/admin/competitions/${compId}/groups`);
  await page.locator('input[name=name]').fill('Group A');
  await page.locator('input[name=abbreviation]').fill('GA');
  await page.locator('button[type=submit]').click();

  // Entries are scoped to the round's group, so the athlete must be assigned to it here
  await page.goto(`/admin/competitions/${compId}/sportsmen/new`);
  await page.locator('input[name=name]').fill(sportsmanName);
  await page.locator('input[name=club]').fill(club);
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
  await page.locator('button[type=submit]').click();
  const roundRow = page.getByRole('row').filter({ hasText: 'Finals' });
  await roundRow.getByRole('link', { name: /Entries/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds\/\d+\/entries/);
  const [, roundId] = page.url().match(/\/rounds\/(\d+)\/entries/);

  await page.locator(`select[name=sportsman_id]`).selectOption({ label: `${sportsmanName} · ${club}` });
  await page.locator('input[name=start_order]').fill('1');
  await page.locator('form').filter({ has: page.locator('select[name=sportsman_id]') }).getByRole('button', { name: /Add/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds\/\d+\/entries/);

  await page.locator('input[name=attempt_count]').fill('1');
  page.once('dialog', dialog => dialog.accept());
  await Promise.all([
    page.waitForURL(/\/admin\/competitions\/\d+\/groups\/\d+\/rounds\/\d+\/entries/),
    page.getByRole('button', { name: /Create All Attempts/ }).click(),
  ]);

  return { compId, groupId, roundId };
}

async function assignJudge(page, compId, roleHeading, userLabel) {
  await page.goto(`/admin/competitions/${compId}/judges`);
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: roleHeading }) });
  await card.locator('select[name=user_id]').selectOption({ label: userLabel });
  await card.getByRole('button', { name: /Assign/ }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  expect(res.ok()).toBeTruthy();
});

// The seed's fig-panel round only staffs time_of_flight and head_judge, so it can never reach
// isComplete — but Skip bypasses that check entirely (head-judge.js's /skip route only requires
// the round to be in_progress). This exercises Skip through the real UI without needing to staff
// the rest of the panel.
test('head judge skips an attempt and the round advances without the panel being complete', async ({ page, request }) => {
  const seedRes = await request.post('/test/seed');
  const seed = await seedRes.json();
  const roundUrl = `/head-judge/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`;

  await loginAsHeadJudge(page);
  await page.goto(roundUrl);
  await expect(page.getByText('Leon Weber')).toBeVisible();
  await expect(page.getByText('Attempt #1')).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Skip Athlete/ }).click();
  // Round-robin order is attempt_number then start_order, so skipping Leon's attempt 1 advances
  // to Emma's attempt 1 (not Leon's attempt 2)
  await expect(page.getByText('Emma Fischer')).toBeVisible();
  await expect(page.getByText('Attempt #1')).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Skip Athlete/ }).click();
  await expect(page.getByText('Leon Weber')).toBeVisible();
  await expect(page.getByText('Attempt #2')).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Skip Athlete/ }).click();
  await expect(page.getByText('Emma Fischer')).toBeVisible();
  await expect(page.getByText('Attempt #2')).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Skip Athlete/ }).click();
  await expect(page.getByRole('heading', { name: 'Round completed' })).toBeVisible();
  await logout(page);

  // Every attempt was skipped, not scored — the leaderboard shows both athletes with no score
  await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('.lb-score')).toHaveCount(0);
});

// Local Panel's execution role defaults to per_judge aggregation: each judge sums their own
// deductions into a personal final score first, then those 4 personal finals get drop-high/
// drop-low/sum — as opposed to per_trick mode, which combines per element across judges first.
// This drives 4 distinct execution judges through the real checkbox UI and confirms the leaderboard
// reflects the per-judge combine, not a per-trick one.
test('per_judge execution aggregation on a Local Panel competition combines each judge\'s own total', async ({ page }) => {
  test.setTimeout(90_000); // builds a competition, staffs 6 judges, and cycles through 6 logins
  await loginAsAdmin(page);
  // Candidates for a non-head_judge role are queried by login role='referee', so all 4 execution
  // slots (and difficulty) need referee-role users — Petra (login role head_judge) isn't eligible.
  await createUser(page, 'Judge Exec2', 'judgeexec2@example.com', 'referee');
  await createUser(page, 'Judge Exec3', 'judgeexec3@example.com', 'referee');
  await createUser(page, 'Judge Exec4', 'judgeexec4@example.com', 'referee');
  await createUser(page, 'Judge Diff', 'judgediffpj@example.com', 'referee');

  const { compId, groupId, roundId } = await seedSingleAttemptCompetition(page, {
    competitionName: 'Combine Cup',
    panelLabel: 'Local Panel',
  });

  await assignJudge(page, compId, 'Execution', 'Maria Schmidt · maria@example.com');
  await assignJudge(page, compId, 'Execution', 'Judge Exec2 · judgeexec2@example.com');
  await assignJudge(page, compId, 'Execution', 'Judge Exec3 · judgeexec3@example.com');
  await assignJudge(page, compId, 'Execution', 'Judge Exec4 · judgeexec4@example.com');
  await assignJudge(page, compId, 'Difficulty', 'Judge Diff · judgediffpj@example.com');
  await assignJudge(page, compId, 'Head Judge (Penalties)', 'Petra Voss · petra@example.com');
  await logout(page);

  const hjUrl = `/head-judge/competitions/${compId}/groups/${groupId}/rounds/${roundId}`;
  const refUrl = `/referee/competitions/${compId}/groups/${groupId}/rounds/${roundId}`;

  await loginAsHeadJudge(page);
  await page.goto(hjUrl);
  await page.getByRole('button', { name: /Start Round/ }).click();
  // With the default elementCount=10, a deduction role also requires a landing (element 11)
  // submission and per_judge completeness needs each judge to cover every required element
  // themselves — set trick count to 1 to keep this to a single deduction per judge.
  const trickCountCard = page.locator('.card').filter({ hasText: 'Trick count' });
  await trickCountCard.locator('input[name=element_count]').fill('1');
  await trickCountCard.getByRole('button', { name: /Save/ }).click();
  const penaltyCard = page.locator('.card').filter({ hasText: 'head judge penalty' });
  await penaltyCard.locator('input[name=score]').fill('0');
  await penaltyCard.getByRole('button', { name: /Save/ }).click();
  await logout(page);

  // 4 execution judges each check a different deduction for the attempt's single trick.
  const executionJudges = [
    ['maria@example.com', 'referee123', '0'],
    ['judgeexec2@example.com', 'judge123', '0.1'],
    ['judgeexec3@example.com', 'judge123', '0.2'],
    ['judgeexec4@example.com', 'judge123', '0.3'],
  ];
  for (const [email, password, deduction] of executionJudges) {
    await loginAs(page, email, password);
    await page.goto(refUrl);
    await page.locator(`input[type=radio][name=element_1][value="${deduction}"]`).check();
    await page.getByRole('button', { name: /Save/ }).click();
    await logout(page);
  }

  await loginAs(page, 'judgediffpj@example.com', 'judge123');
  await page.goto(refUrl);
  await page.locator('input[name=element_1]').fill('0');
  await page.getByRole('button', { name: /Save/ }).click();
  await logout(page);

  await loginAsHeadJudge(page);
  await page.goto(hjUrl);
  await page.getByRole('button', { name: /Next/ }).click();
  await expect(page.getByRole('heading', { name: 'Round completed' })).toBeVisible();
  await logout(page);

  // Per-judge personal finals (elementCount 1 minus each judge's own deduction): 1.0, 0.9, 0.8,
  // 0.7. Local Panel drops 1 high (1.0) and 1 low (0.7), keeping [0.9, 0.8] → 1.7. Difficulty and
  // head judge both contributed 0.
  await page.goto(`/leaderboard/competitions/${compId}/groups/${groupId}/rounds/${roundId}`);
  await expect(page.locator('tbody tr').first()).toContainText('1.700');
});

// The head judge can lower the trick count mid-round (e.g. the routine was interrupted). At
// element_count=0, attempt-granularity roles (time_of_flight, horizontal_displacement) show a
// "does not apply" message and auto-complete with a 0 contribution — so the round can advance
// even though execution/difficulty/horizontal_displacement have no judges assigned at all in the
// seed, and the total can go negative from the head judge's own penalty alone. (Element-
// granularity roles like execution/difficulty auto-complete the same way, but render an empty
// scoring section rather than the "does not apply" text — see referee.js's per-role notApplicable
// flag, which only applies to attempt-granularity roles.)
test('head judge sets trick count to 0 and the round advances on an otherwise-unstaffed panel', async ({ page, request }) => {
  const seedRes = await request.post('/test/seed');
  const seed = await seedRes.json();
  const hjUrl = `/head-judge/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`;
  const refUrl = `/referee/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`;

  await loginAsHeadJudge(page);
  await page.goto(hjUrl);

  const trickCountCard = page.locator('.card').filter({ hasText: 'Trick count' });
  await trickCountCard.locator('input[name=element_count]').fill('0');
  await trickCountCard.getByRole('button', { name: /Save/ }).click();

  const penaltyCard = page.locator('.card').filter({ hasText: 'head judge penalty' });
  await penaltyCard.locator('input[name=score]').fill('2');
  await penaltyCard.getByRole('button', { name: /Save/ }).click();
  await logout(page);

  // Maria is assigned time_of_flight (attempt granularity) — she sees the "does not apply"
  // message instead of a score input, and doesn't need to submit anything
  await loginAsReferee(page);
  await page.goto(refUrl);
  await expect(page.getByText(/does not apply/)).toBeVisible();
  await logout(page);

  // Execution, difficulty and horizontal_displacement have no judges assigned in the seed at all,
  // yet Next still succeeds — every non-head_judge role is exempted when elementCount is 0
  await loginAsHeadJudge(page);
  await page.goto(hjUrl);
  await page.getByRole('button', { name: /Next/ }).click();
  // Round-robin order (attempt_number then start_order) advances to Emma's attempt 1
  await expect(page.getByText('Emma Fischer')).toBeVisible();
  await logout(page);

  await page.goto(`/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`);
  await expect(page.locator('tbody tr').filter({ hasText: 'Leon Weber' })).toContainText('-2.000');
});
