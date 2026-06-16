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
  const res = await request.get('/admin/users/new');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/test/seed');
    seed = await res.json();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/users/new');
  });

  //------------- Adding a new user/general --------------
  // Page structure
  test('shows the "New User" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'New User' })).toBeVisible();
  });

  test('has the correct form fields', async ({ page }) => {
    await expect(page.locator('input[name=name]')).toBeVisible();
    await expect(page.locator('input[name=email]')).toBeVisible();
    await expect(page.locator('input[name=password]')).toBeVisible();
    await expect(page.locator('select[name=role]')).toBeVisible();
  });

  test('has a "Create" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  test('has a "Cancel" button', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Cancel' })).toBeVisible();
  });

  // Functionality

  test('Password is not visible when typing', async ({ page }) => {
    const passwordInput = page.locator('input[name=password]');
    await passwordInput.fill('secret123');
    expect(await passwordInput.inputValue()).toBe('secret123');
    expect(await passwordInput.evaluate(el => el.type)).toBe('password');
  });

  test('"Cancel" button goes back to the users list', async ({ page }) => {
    await page.getByRole('link', { name: 'Cancel' }).click();
    await page.waitForURL('/admin/users');
  });

  test('creating a new user with valid data adds it to the users list', async ({ page }) => {
    await page.locator('input[name=name]').fill('New Referee');
    await page.locator('input[name=email]').fill('newreferee@test.com');
    await page.locator('input[name=password]').fill('secret123');
    await page.locator('select[name=role]').selectOption('referee');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL('/admin/users');
    const newUserRow = page.getByRole('row').filter({ hasText: 'New Referee' });
    await expect(newUserRow.getByRole('cell', { name: 'New Referee' })).toBeVisible();
    await expect(newUserRow.getByRole('cell', { name: 'newreferee@test.com' })).toBeVisible();
    await expect(newUserRow.getByRole('cell', { name: 'referee', exact: true })).toBeVisible();
  });

  test('creating a user with an email that already exists shows an error', async ({ page }) => {
    await page.locator('input[name=name]').fill('Duplicate Email');
    await page.locator('input[name=email]').fill(seed.referee1.email);
    await page.locator('input[name=password]').fill('secret123');
    await page.locator('select[name=role]').selectOption('referee');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Email already in use.')).toBeVisible();
  });

  test('submitting empty form shows a server validation error', async ({ page }) => {
    await page.locator('form[action="/admin/users"]').evaluate(form => form.setAttribute('novalidate', ''));
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Name, email and password are required.')).toBeVisible();
  });

  //------------- Editing users --------------

  test.describe('edit user form', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/admin/users/${seed.referee1.id}/edit`);
    });

    // Page structure

    test('shows the "Edit User" heading', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();
    });

    test('pre-fills the existing name and email', async ({ page }) => {
      await expect(page.locator('input[name=name]')).toHaveValue('Referee One');
      await expect(page.locator('input[name=email]')).toHaveValue('referee1@test.com');
    });

    test('pre-selects the correct role', async ({ page }) => {
      await expect(page.locator('select[name=role]')).toHaveValue('referee');
    });

    test('has a "Save" button instead of "Create"', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create' })).not.toBeVisible();
    });

    test('"Cancel" link goes back to the users list', async ({ page }) => {
      await page.getByRole('link', { name: 'Cancel' }).click();
      await page.waitForURL('/admin/users');
    });

    // Validation

    test('saving with blank name shows a validation error', async ({ page }) => {
      await page.locator(`form[action="/admin/users/${seed.referee1.id}"]`).evaluate(form => form.setAttribute('novalidate', ''));
      await page.locator('input[name=name]').fill('');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Name and email are required.')).toBeVisible();
    });

    test('saving with a duplicate email shows an error', async ({ page }) => {
      await page.locator('input[name=email]').fill('admin@test.com');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Email already in use.')).toBeVisible();
    });

    test('saving without a new password keeps the existing password', async ({ page }) => {
      await page.getByRole('button', { name: 'Save' }).click();
      await page.waitForURL('/admin/users');
      await expect(page.getByRole('row').filter({ hasText: 'Referee One' })).toBeVisible();
    });

    test('saving with valid changes updates the user and redirects', async ({ page }) => {
      await page.locator('input[name=name]').fill('Referee Renamed');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.waitForURL('/admin/users');
      await expect(page.getByRole('row').filter({ hasText: 'Referee Renamed' })).toBeVisible();
    });
  });
});
