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
  const res = await request.get('/admin/competitions/new');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/competitions/new');
  });

  //------------- Adding a new competition/general --------------
  // Page structure
  test('shows the "New Competition" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'New Competition' })).toBeVisible();
  });

  test('has the correct form fields', async ({ page }) => {
    await expect(page.locator('input[name=name]')).toBeVisible();
    await expect(page.locator('input[name=date]')).toBeVisible();
  });

  test('has a "Create" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  test('has a "Cancel" button', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Cancel' })).toBeVisible();
  });

  // Functionality

  test('"Cancel" button goes back to the competitions list', async ({ page }) => {
    await page.getByRole('link', { name: 'Cancel' }).click();
    await page.waitForURL('/admin/competitions');
  });

  test('creating a new competition with valid data adds it to the competitions list', async ({ page }) => {
    await page.locator('input[name=name]').fill('Summer Open');
    await page.locator('input[name=date]').fill('2026-08-17');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL('/admin/competitions');
    const newAthleteRow = page.getByRole('row').filter({ hasText: 'Summer Open' });
    await expect(newAthleteRow.getByRole('cell', { name: 'Summer Open' })).toBeVisible();
    await expect(newAthleteRow.getByRole('cell', { name: '2026-08-17' })).toBeVisible();
    await expect(newAthleteRow.getByRole('cell', { name: 'planned' })).toBeVisible();
  });

  test('submitting empty form shows a server validation error', async ({ page }) => {
    await page.locator('form[action="/admin/competitions"]').evaluate(form => form.setAttribute('novalidate', ''));
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Name is required.')).toBeVisible();
  });

  //------------- Editing competitions --------------
  
  test.describe('edit competitions form', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/admin/competitions/${seed.competitionId}/edit`);
    });

    // Page structure

    test('shows the "Edit Competition" heading', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Edit Competition' })).toBeVisible();
    });

    test('pre-fills the existing name and date', async ({ page }) => {
      await expect(page.locator('input[name=name]')).toHaveValue('Spring Cup');
    });

    test('has a "Save" button instead of "Create"', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create' })).not.toBeVisible();
    });

    test('"Cancel" link goes back to the competitions list', async ({ page }) => {
      await page.getByRole('link', { name: 'Cancel' }).click();
      await page.waitForURL('/admin/competitions');
    });

    // Validation

    test('saving with blank name shows a validation error', async ({ page }) => {
      await page.locator(`form[action="/admin/competitions/${seed.competitionId}"]`).evaluate(form => form.setAttribute('novalidate', ''));
      await page.locator('input[name=name]').fill('');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Name is required.')).toBeVisible();
    });

    test('saving with valid changes updates the athlete and redirects', async ({ page }) => {
      await page.locator('input[name=name]').fill('Spring Open');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.waitForURL('/admin/competitions');
      await expect(page.getByRole('row').filter({ hasText: 'Spring Open' })).toBeVisible();
    });
  });
});