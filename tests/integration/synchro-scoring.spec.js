const { test, expect } = require('@playwright/test');

async function login(page, email, password, landing) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(landing);
}

let seed;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed', { data: { type: 'synchro' } });
  expect(res.ok()).toBeTruthy();
  seed = await res.json();
});

const refereeRoundUrlPattern = /\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/;
const leaderboardUrl = () => `/leaderboard/competitions/${seed.competitionId}/groups/${seed.groupId}/rounds/${seed.roundId}`;

// the seeded test_synchro panel only staffs the device mark and the head judge, so this covers one pair being scored on the current turn
test('referee scores the synchronisation device mark for a pair and the leaderboard shows the doubled S mark under both names', async ({ page }) => {
  await login(page, 'maria@example.com', 'referee123', '/referee');
  await page.getByText('Qualifications').click();
  await page.waitForURL(refereeRoundUrlPattern);
  await expect(page.getByText('Leon Weber / Emma Fischer')).toBeVisible();
  await expect(page.getByText('TSV München / SV Hamburg')).toBeVisible();

  await page.locator('input[name=score]').fill('8.55');
  await page.getByRole('button', { name: /Save/ }).click();
  await page.waitForURL(refereeRoundUrlPattern);
  await expect(page.locator('input[name=score]')).toHaveValue('8.55');

  await page.goto(leaderboardUrl());
  const row = page.locator('tbody tr').first();
  await expect(row).toContainText('Leon Weber / Emma Fischer');
  await expect(row).toContainText('17.100');
});

test('the second pair shares one club and shows it once', async ({ page }) => {
  await login(page, 'admin@example.com', 'admin123', '/admin');
  await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen`);
  const row = page.getByRole('row').filter({ hasText: 'Anna Klein' });
  await expect(row).toContainText('Anna Klein / Mia Braun');
  await expect(row.getByText('TSV München', { exact: true })).toBeVisible();
});

test('admin adds a pair through the form and the athletes list shows it', async ({ page }) => {
  await login(page, 'admin@example.com', 'admin123', '/admin');
  await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen/new`);
  await page.locator('input[name=name]').fill('Ida Vogel');
  await page.locator('input[name=partner_name]').fill('Lena Roth');
  await page.locator('input[name=partner_club]').fill('SC Berlin');
  await page.getByRole('button', { name: /Create/ }).click();
  await page.waitForURL(`**/admin/competitions/${seed.competitionId}/sportsmen`);

  await expect(page.getByRole('row').filter({ hasText: 'Ida Vogel' })).toContainText('Ida Vogel / Lena Roth');
});
