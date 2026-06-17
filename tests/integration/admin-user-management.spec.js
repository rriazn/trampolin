const { test, expect } = require('@playwright/test');

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@example.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  expect(res.ok()).toBeTruthy();
});

test('admin creates a new referee who can then log in and access the scoring dashboard', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users/new');
  await page.locator('input[name=name]').fill('Bob Jones');
  await page.locator('input[name=email]').fill('bob@example.com');
  await page.locator('input[name=password]').fill('bob123');
  await page.locator('select[name=role]').selectOption('referee');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/admin/users');
  await expect(page.getByRole('cell', { name: 'Bob Jones' })).toBeVisible();

  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');

  await page.locator('input[name=email]').fill('bob@example.com');
  await page.locator('input[name=password]').fill('bob123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/referee');
  await expect(page.getByRole('heading', { name: 'Scoring Dashboard' })).toBeVisible();
});

test('admin edits a referee\'s name and the change is reflected in the user list', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');
  const row = page.getByRole('row').filter({ hasText: 'Bob Jones' });
  await row.locator('a.btn-outline-secondary').click();
  await page.locator('input[name=name]').fill('Bob Smith');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL('/admin/users');
  await expect(page.getByRole('cell', { name: 'Bob Smith' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Bob Jones' })).not.toBeVisible();
});

test('admin deletes a referee, they are removed from the list and can no longer log in', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');
  const row = page.getByRole('row').filter({ hasText: 'Bob Smith' });
  page.once('dialog', dialog => dialog.accept());
  await row.locator('button.btn-outline-danger').click();
  await expect(page.getByRole('cell', { name: 'Bob Smith' })).not.toBeVisible();

  await page.getByRole('button', { name: /Logout/ }).click();
  await page.waitForURL('/login');
  await page.locator('input[name=email]').fill('bob@example.com');
  await page.locator('input[name=password]').fill('bob123');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByText(/invalid/i)).toBeVisible();
});
