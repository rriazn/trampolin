const { test, expect } = require('@playwright/test');

// Confirms that translation also covers seeded reference data (judge_roles, panel_templates),
// not just static UI copy — these are rendered from DB rows keyed off a stable `key` column,
// a different code path from the plain t('namespace:key') calls used elsewhere.
let seed;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  seed = await res.json();
});

async function loginAsAdminInGerman(page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'DE', exact: true }).click();
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.getByRole('button', { name: 'Einloggen' }).click();
  await page.waitForURL('/admin');
}

test.describe('dynamic seeded content translates with the language switcher', () => {
  test('judge role headings on the judges page translate to German, including a joined shared-role group', async ({ page }) => {
    await loginAsAdminInGerman(page);
    await page.goto(`/admin/competitions/${seed.panelCompetitionId}/judges`);

    await expect(page.getByRole('heading', { name: 'Ausführung' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Schwierigkeit' })).toBeVisible();
    // Time of Flight / Horizontal Displacement are deliberately kept as English technical terms
    // in the German translation (src/locales/de/common.json) — this still exercises the
    // roleKeys.map(...).join(' & ') mechanism for a joined shared-assignment group, even though
    // the two individual translated values happen to equal the English source text.
    await expect(page.getByRole('heading', { name: 'Time of Flight & Horizontal Displacement' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Wettkampfleiter (Strafabzug)' })).toBeVisible();

    // English names must not leak through for the roles that DO have distinct German text
    await expect(page.getByRole('heading', { name: 'Execution' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Head Judge (Penalties)' })).not.toBeVisible();
  });

  test('the panel name in the judges page subtitle translates to German', async ({ page }) => {
    await loginAsAdminInGerman(page);
    await page.goto(`/admin/competitions/${seed.panelCompetitionId}/judges`);

    await expect(page.locator('.page-hero p')).toContainText('FIG-Panel');
    await expect(page.locator('.page-hero p')).not.toContainText('FIG Panel');
  });

  test('confirm dialog for unassigning a judge uses the translated, joined role name', async ({ page }) => {
    await loginAsAdminInGerman(page);
    await page.goto(`/admin/competitions/${seed.panelCompetitionId}/judges`);

    const executionCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Ausführung' }) });
    await executionCard.locator('select[name=user_id]').selectOption({ label: 'Judge Referee A · judgerefa@test.com' });
    await executionCard.getByRole('button', { name: 'Zuweisen' }).click();
    await page.waitForURL(/\/admin\/competitions\/\d+\/judges/);

    const updatedCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Ausführung' }) });
    let capturedDialog;
    page.once('dialog', dialog => {
      capturedDialog = dialog;
      dialog.dismiss();
    });
    await updatedCard.locator('button.btn-outline-danger').click();
    await expect.poll(() => capturedDialog?.message()).toBe('Judge Referee A von Ausführung entfernen?');
  });

  test('the panel dropdown on the competition form shows translated names and description tooltips', async ({ page }) => {
    await loginAsAdminInGerman(page);
    await page.goto('/admin/competitions/new');

    const select = page.locator('select[name=panel_template_id]');
    await expect(select.locator('option', { hasText: 'FIG-Panel' })).toHaveCount(1);
    await expect(select.locator('option', { hasText: 'Lokales Panel' })).toHaveCount(1);
    await expect(select.locator('option', { hasText: 'FIG Panel' })).toHaveCount(0);

    const figOption = select.locator('option', { hasText: 'FIG-Panel' });
    await expect(figOption).toHaveAttribute('title', /Ausführung/);
  });
});
