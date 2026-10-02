const { test, expect } = require('@playwright/test');
const fs = require('fs');

async function login(page, email, password, landing) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(landing);
}

// pdfjs-dist is an ES module, a plain import() would be rewritten to require() by the test loader
const importModule = new Function('specifier', 'return import(specifier)');

// all text of a PDF with whitespace collapsed
async function pdfText(buffer) {
  const pdfjs = await importModule('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = '';
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const content = await (await doc.getPage(pageNumber)).getTextContent();
    text += `${content.items.map(item => item.str).join(' ')} `;
  }
  return text.replace(/\s+/g, ' ');
}

async function openResultsForm(page) {
  await page.goto('/admin/competitions');
  const row = page.getByRole('row').filter({ hasText: 'Spring Championship' });
  await row.getByText('Results PDF').click();
  return row;
}

async function downloadResults(page, row) {
  const downloading = page.waitForEvent('download');
  await row.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloading;
  return { filename: download.suggestedFilename(), buffer: fs.readFileSync(await download.path()) };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  expect(res.ok()).toBeTruthy();
});

test('admin closes a scored competition and downloads the results PDF', async ({ page }) => {
  await login(page, 'maria@example.com', 'referee123', '/referee');
  await page.getByText('Qualifications').click();
  await page.waitForURL(/\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);
  await page.locator('input[name=score]').fill('9.0');
  await page.getByRole('button', { name: /Save/ }).click();
  await page.waitForURL(/\/referee\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);

  // a logged in user is redirected away from /login, so end the referee session first
  await page.context().clearCookies();
  await login(page, 'admin@example.com', 'admin123', '/admin');
  await page.goto('/admin/competitions');
  const closing = page.getByRole('row').filter({ hasText: 'Spring Championship' });
  await closing.getByRole('button', { name: /Close/ }).click();
  await expect(closing.getByRole('cell', { name: 'closed' })).toBeVisible();

  const { filename, buffer } = await downloadResults(page, await openResultsForm(page));
  expect(filename).toBe('results-spring-championship.pdf');
  expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');

  const text = await pdfText(buffer);
  for (const expected of ['Spring Championship', 'Junior', 'Leon Weber', 'TSV München', 'Emma Fischer', 'SV Hamburg']) {
    expect(text).toContain(expected);
  }
  expect(text).toMatch(/Round total: 9\.0 \(Rank 1\)/);
  // the sample data is only for previews and must never leak into a real PDF
  expect(text).not.toContain('Athlete A');
});

test('admin downloads the results PDF with an uploaded template', async ({ page }) => {
  await login(page, 'admin@example.com', 'admin123', '/admin');
  const row = await openResultsForm(page);
  const source = '#let d = json("results.json")\n= Custom layout for #d.groups.at(0).competitors.at(0).name';
  await row.locator('input[name=template]').setInputFiles({ name: 'mine.typ', mimeType: 'text/plain', buffer: Buffer.from(source) });

  const { buffer } = await downloadResults(page, row);
  expect(await pdfText(buffer)).toContain('Custom layout for Leon Weber');
});

test('admin sees the Typst error when the uploaded template is broken', async ({ page }) => {
  await login(page, 'admin@example.com', 'admin123', '/admin');
  const row = await openResultsForm(page);
  await row.locator('input[name=template]').setInputFiles({ name: 'broken.typ', mimeType: 'text/plain', buffer: Buffer.from('= Title\n#let x = ') });
  await row.getByRole('button', { name: 'Download PDF' }).click();

  await page.waitForURL('/admin/competitions');
  await expect(page.getByText('Template error at line 2, column 8: expected expression')).toBeVisible();
});
