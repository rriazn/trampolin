const { test, expect } = require('@playwright/test');

let seed;

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/admin/competitions/1/sportsmen/new');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen/new`);
  });

  //------------- Adding a new athlete/general --------------
  // Page structure
  test('shows the "New Athlete" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'New Athlete' })).toBeVisible();
  });

  test('has the correct form fields', async ({ page }) => {
    await expect(page.locator('input[name=name]')).toBeVisible();
    await expect(page.locator('input[name=club]')).toBeVisible();
    await expect(page.locator('select[name=gender]')).toBeVisible();
    await expect(page.locator('input[name=birth_year]')).toBeVisible();
    await expect(page.locator('input[name=routine]')).toBeVisible();
    await expect(page.locator('select[name=group_id]')).toBeVisible();
  });

  test('has a "Create" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  test('has a "Cancel" button', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Cancel' })).toBeVisible();
  });

  // Functionality

  test('"Cancel" button goes back to the athletes list', async ({ page }) => {
    await page.getByRole('link', { name: 'Cancel' }).click();
    await page.waitForURL(`/admin/competitions/${seed.competitionId}/sportsmen`);
  });

  test('creating a new athlete with valid data adds it to the athletes list', async ({ page }) => {
    await page.locator('input[name=name]').fill('David');
    await page.locator('input[name=club]').fill('Test Club');
    await page.locator('input[name=routine]').fill('DMT');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(`/admin/competitions/${seed.competitionId}/sportsmen`);
    const newAthleteRow = page.getByRole('row').filter({ hasText: 'David' });
    await expect(newAthleteRow.getByRole('cell', { name: 'David' })).toBeVisible();
    await expect(newAthleteRow.getByRole('cell', { name: 'Test Club' })).toBeVisible();
    await expect(newAthleteRow.getByRole('cell', { name: 'DMT' })).toBeVisible();
  });

  test('submitting empty form shows a server validation error', async ({ page }) => {
    await page.locator(`form[action="/admin/competitions/${seed.competitionId}/sportsmen"]`).evaluate(form => form.setAttribute('novalidate', ''));
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Name is required.')).toBeVisible();
  });

  // Breadcrumbs

  test('"Competitions" breadcrumb navigates to the competitions list', async ({ page }) => {
    await page.locator('.breadcrumb').getByRole('link', { name: 'Competitions' }).click();
    await page.waitForURL('/admin/competitions');
  });

  test('competition name breadcrumb navigates to the groups page', async ({ page }) => {
    await page.locator('.breadcrumb').getByRole('link', { name: 'Spring Cup' }).click();
    await page.waitForURL(`/admin/competitions/${seed.competitionId}/groups`);
  });

  test('"Athletes" breadcrumb navigates to the sportsmen list', async ({ page }) => {
    await page.locator('.breadcrumb').getByRole('link', { name: 'Athletes' }).click();
    await page.waitForURL(`/admin/competitions/${seed.competitionId}/sportsmen`);
  });

  //------------- Editing athletes --------------

  test.describe('edit athlete form', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen/${seed.sportsmanId}/edit`);
    });

    // Page structure

    test('shows the "Edit Athlete" heading', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Edit Athlete' })).toBeVisible();
    });

    test('pre-fills the existing name, club, and routine', async ({ page }) => {
      await expect(page.locator('input[name=name]')).toHaveValue('Alice');
      await expect(page.locator('input[name=club]')).toHaveValue('Test Club');
      await expect(page.locator('input[name=routine]')).toHaveValue('W11');
    });

    test('has a "Save" button instead of "Create"', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create' })).not.toBeVisible();
    });

    test('"Cancel" link goes back to the athletes list', async ({ page }) => {
      await page.getByRole('link', { name: 'Cancel' }).click();
      await page.waitForURL(`/admin/competitions/${seed.competitionId}/sportsmen`);
    });

    // Validation

    test('saving with blank name shows a validation error', async ({ page }) => {
      await page.locator(`form[action="/admin/competitions/${seed.competitionId}/sportsmen/${seed.sportsmanId}"]`).evaluate(form => form.setAttribute('novalidate', ''));
      await page.locator('input[name=name]').fill('');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Name is required.')).toBeVisible();
    });

    test('saving with valid changes updates the athlete and redirects', async ({ page }) => {
      await page.locator('input[name=name]').fill('Alice2');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.waitForURL(`/admin/competitions/${seed.competitionId}/sportsmen`);
      await expect(page.getByRole('row').filter({ hasText: 'Alice2' })).toBeVisible();
    });
  });
});
