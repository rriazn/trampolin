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
  const res = await request.get('/admin/sportsmen/new');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/sportsmen/new');
  });

  //------------- Adding a new athlete/general --------------
  // Page structure
  test('shows the "New Athlete" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'New Athlete' })).toBeVisible();
  });

  test('has the correct form fields', async ({ page }) => {
    await expect(page.locator('input[name=name]')).toBeVisible();
    await expect(page.locator('input[name=club]')).toBeVisible();
    await expect(page.locator('input[name=category]')).toBeVisible();
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
    await page.waitForURL('/admin/sportsmen');
  });

  test('creating a new athlete with valid data adds it to the athletes list', async ({ page }) => {
    await page.locator('input[name=name]').fill('David');
    await page.locator('input[name=club]').fill('Test Club');
    await page.locator('input[name=category]').fill('Senior Men');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL('/admin/sportsmen');
    const newAthleteRow = page.getByRole('row').filter({ hasText: 'David' });
    await expect(newAthleteRow.getByRole('cell', { name: 'David' })).toBeVisible();
    await expect(newAthleteRow.getByRole('cell', { name: 'Test Club' })).toBeVisible();
    await expect(newAthleteRow.getByRole('cell', { name: 'Senior Men' })).toBeVisible();
  });

  test('submitting empty form shows a server validation error', async ({ page }) => {
    await page.locator('form[action="/admin/sportsmen"]').evaluate(form => form.setAttribute('novalidate', ''));
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Name is required.')).toBeVisible();
  });

  //------------- Editing athletes --------------
  
    test.describe('edit athlete form', () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(`/admin/sportsmen/${seed.sportsmanId}/edit`);
      });
  
      // Page structure
  
      test('shows the "Edit Athlete" heading', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Edit Athlete' })).toBeVisible();
      });
  
      test('pre-fills the existing name, club, and category', async ({ page }) => {
        await expect(page.locator('input[name=name]')).toHaveValue('Alice');
        await expect(page.locator('input[name=club]')).toHaveValue('Test Club');
        await expect(page.locator('input[name=category]')).toHaveValue('Junior Women');
      });
  
      test('has a "Save" button instead of "Create"', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Create' })).not.toBeVisible();
      });
  
      test('"Cancel" link goes back to the athletes list', async ({ page }) => {
        await page.getByRole('link', { name: 'Cancel' }).click();
        await page.waitForURL('/admin/sportsmen');
      });
  
      // Validation
  
      test('saving with blank name shows a validation error', async ({ page }) => {
        await page.locator(`form[action="/admin/sportsmen/${seed.sportsmanId}"]`).evaluate(form => form.setAttribute('novalidate', ''));
        await page.locator('input[name=name]').fill('');
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByText('Name is required.')).toBeVisible();
      });
  
      test('saving with valid changes updates the athlete and redirects', async ({ page }) => {
        await page.locator('input[name=name]').fill('Alice2');
        await page.getByRole('button', { name: 'Save' }).click();
        await page.waitForURL('/admin/sportsmen');
        await expect(page.getByRole('row').filter({ hasText: 'Alice2' })).toBeVisible();
      });
    });
  
});