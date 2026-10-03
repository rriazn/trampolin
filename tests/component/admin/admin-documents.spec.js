const { test, expect } = require('@playwright/test');

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

// opens the documents page through the button in the competitions table
async function openDocuments(page, competitionName) {
  await page.goto('/admin/competitions');
  await page.getByRole('row').filter({ hasText: competitionName }).getByRole('link', { name: 'Documents' }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/documents$/);
}

test('returns 403 when not logged in', async ({ request }) => {
  const res = await request.get('/admin/competitions/1/documents');
  expect(res.status()).toBe(403);
});

test.describe('when logged in as admin', () => {
  test.beforeAll(async ({ request }) => {
    await request.post('/test/seed');
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('shows the heading, the competition name and a breadcrumb back to the competitions', async ({ page }) => {
    await openDocuments(page, 'Winter Cup');
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Competitions' })).toHaveAttribute('href', '/admin/competitions');
    await expect(page.getByText('Winter Cup').first()).toBeVisible();
  });

  test('enables the results list for a closed competition', async ({ page }) => {
    await openDocuments(page, 'Winter Cup');
    const card = page.locator('#document-results');
    await expect(card.getByText('Results list (PDF)')).toBeVisible();
    await expect(card.getByText('Available once the competition is closed.')).toHaveCount(0);
    await expect(card.locator('input[name=template]')).toBeEnabled();
    await expect(card.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  });

  test('disables the results list and explains why for a competition that is not closed', async ({ page }) => {
    await openDocuments(page, 'Spring Cup');
    const card = page.locator('#document-results');
    await expect(card.getByText('Available once the competition is closed.')).toBeVisible();
    await expect(card.locator('input[name=template]')).toBeDisabled();
    await expect(card.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    await expect(card.getByRole('button', { name: 'Preview template' })).toBeDisabled();
  });

  test('keeps the preview button disabled until a template file is chosen', async ({ page }) => {
    await openDocuments(page, 'Winter Cup');
    const card = page.locator('#document-results');
    const preview = card.getByRole('button', { name: 'Preview template' });
    await expect(preview).toBeDisabled();
    await card.locator('input[name=template]').setInputFiles({ name: 'mine.typ', mimeType: 'text/plain', buffer: Buffer.from('= Hello') });
    await expect(preview).toBeEnabled();
    await card.locator('input[name=template]').setInputFiles([]);
    await expect(preview).toBeDisabled();
  });

  test('links to the default template and offers no sample data download', async ({ page }) => {
    await openDocuments(page, 'Winter Cup');
    await expect(page.getByRole('link', { name: 'Default template' })).toHaveAttribute('href', /\/admin\/competitions\/\d+\/documents\/results\/template$/);
    await expect(page.getByText('Sample data')).toHaveCount(0);
  });
});
