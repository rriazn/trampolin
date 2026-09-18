const { test, expect } = require('@playwright/test');

test('unknown route shows the 404 page', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response.status()).toBe(404);
  await expect(page.getByText('404')).toBeVisible();
  await expect(page.getByText('Page Not Found')).toBeVisible();
  await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible();
});

test('accessing a protected route while logged out shows the 403 page', async ({ page }) => {
  const response = await page.goto('/admin');
  expect(response.status()).toBe(403);
  await expect(page.getByText('403')).toBeVisible();
  await expect(page.getByText('Access Denied')).toBeVisible();
  await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible();
});

test('an unhandled server error shows the 500 page', async ({ page }) => {
  const response = await page.goto('/test/throw');
  expect(response.status()).toBe(500);
  await expect(page.getByText('500')).toBeVisible();
  await expect(page.getByText('Something Went Wrong')).toBeVisible();
  await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible();
});
