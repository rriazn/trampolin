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

  test('shows only the reason instead of unusable controls for a competition that is not closed', async ({ page }) => {
    await openDocuments(page, 'Spring Cup');
    const card = page.locator('#document-results');
    await expect(card.getByText('Results list (PDF)')).toBeVisible();
    await expect(card.getByText('Available once the competition is closed.')).toBeVisible();
    await expect(card.locator('input[name=template]')).toHaveCount(0);
    await expect(card.getByRole('button')).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Default template' })).toHaveCount(0);
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

  test('shows the preview hint on the file input only until a template file is chosen', async ({ page }) => {
    await openDocuments(page, 'Winter Cup');
    const card = page.locator('#document-results');
    const input = card.locator('input[name=template]');
    const hint = card.getByText('Choose a template file to enable the preview.');
    await expect(hint).toBeVisible();
    await expect(input).toHaveAccessibleDescription('Choose a template file to enable the preview.');
    await input.setInputFiles({ name: 'mine.typ', mimeType: 'text/plain', buffer: Buffer.from('= Hello') });
    await expect(hint).toBeHidden();
    await expect(input).not.toHaveAttribute('aria-describedby');
    await input.setInputFiles([]);
    await expect(hint).toBeVisible();
  });

  test('links to the default template and offers no sample data download', async ({ page }) => {
    await openDocuments(page, 'Winter Cup');
    await expect(page.locator('#document-results').getByRole('link', { name: 'Default template' })).toHaveAttribute('href', /\/admin\/competitions\/\d+\/documents\/results\/template$/);
    await expect(page.getByText('Sample data')).toHaveCount(0);
  });
});

test.describe('certificates card', () => {
  async function openCertificates(page, request) {
    const { competitionId } = await (await request.post('/test/seed/certificates')).json();
    await loginAsAdmin(page);
    await page.goto(`/admin/competitions/${competitionId}/documents`);
    return { card: page.locator('#document-certificates'), competitionId };
  }

  test('lists every group with its status and only offers the download of a ready group with participants', async ({ page, request }) => {
    const { card, competitionId } = await openCertificates(page, request);
    await expect(card.getByText('Certificates (PDF)')).toBeVisible();

    const done = card.locator('li', { hasText: 'Done' });
    await expect(done.getByText('Ready')).toBeVisible();
    await expect(done.getByText('2 participants')).toBeVisible();
    await expect(done.getByRole('button', { name: 'Download' })).toBeEnabled();
    await expect(done.getByRole('button', { name: 'Download' })).toHaveAttribute('formaction', /\/admin\/competitions\/\d+\/groups\/\d+\/documents\/certificates$/);

    const running = card.locator('li', { hasText: 'Running' });
    await expect(running.getByText('Rounds still running')).toBeVisible();
    await expect(running.getByRole('button')).toHaveCount(0);

    const planned = card.locator('li', { hasText: 'Planned' });
    await expect(planned.getByText('No rounds yet')).toBeVisible();
    await expect(planned.getByText('Rounds still running')).toHaveCount(0);
    await expect(planned.getByRole('button')).toHaveCount(0);

    const empty = card.locator('li', { hasText: 'Empty' });
    await expect(empty.getByText('No participants')).toBeVisible();
    await expect(empty.getByRole('button')).toHaveCount(0);

    await expect(card.getByRole('button', { name: 'Download all (ZIP)' })).toBeEnabled();
    await expect(card.getByRole('link', { name: 'Example template (PDF)' })).toHaveAttribute('href', `/admin/competitions/${competitionId}/documents/certificates/template`);
    // the custom template is a PDF with markers, there is no separate image upload
    await expect(card.locator('input[name=template]')).toHaveAttribute('accept', '.pdf');
    await expect(card.getByText('{{name}}', { exact: false }).first()).toBeVisible();
    await expect(card.locator('input[name=image]')).toHaveCount(0);
  });

  test('offers neither a ZIP nor a download when no group is ready', async ({ page, request }) => {
    await request.post('/test/seed');
    await loginAsAdmin(page);
    await openDocuments(page, 'Spring Cup');
    const card = page.locator('#document-certificates');
    await expect(card.getByText('Rounds still running')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Download all (ZIP)' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Download' })).toHaveCount(0);
  });

  test('says so when the competition has no groups', async ({ page, request }) => {
    await request.post('/test/seed');
    await loginAsAdmin(page);
    await openDocuments(page, 'Winter Cup');
    const card = page.locator('#document-certificates');
    await expect(card.getByText('This competition has no groups yet.')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Download all (ZIP)' })).toHaveCount(0);
  });

  test('keeps the preview disabled until a PDF template is chosen', async ({ page, request }) => {
    const { card } = await openCertificates(page, request);
    const preview = card.getByRole('button', { name: 'Preview' });
    await expect(preview).toBeDisabled();
    await card.locator('input[name=template]').setInputFiles({ name: 'mine.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') });
    await expect(preview).toBeEnabled();
    await card.locator('input[name=template]').setInputFiles([]);
    await expect(preview).toBeDisabled();
  });
});
