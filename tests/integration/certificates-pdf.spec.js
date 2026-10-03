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

// page count and all text of a PDF with whitespace collapsed
async function readPdf(buffer) {
  const pdfjs = await importModule('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = '';
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const content = await (await doc.getPage(pageNumber)).getTextContent();
    text += `${content.items.map(item => item.str).join(' ')} `;
  }
  return { pages: doc.numPages, text: text.replace(/\s+/g, ' ') };
}

async function openCertificates(page, competitionId) {
  await page.goto(`/admin/competitions/${competitionId}/documents`);
  return page.locator('#document-certificates');
}

async function download(page, button) {
  const downloading = page.waitForEvent('download');
  await button.click();
  const download = await downloading;
  return { filename: download.suggestedFilename(), buffer: fs.readFileSync(await download.path()) };
}

test.describe.configure({ mode: 'serial' });

let competitionId;

test.beforeAll(async ({ request }) => {
  // Leon's first attempt is fully scored, total 4.1, Emma has no score
  const res = await request.post('/test/seed', { data: { type: 'scored' } });
  expect(res.ok()).toBeTruthy();
  competitionId = (await res.json()).competitionId;
});

test('a group whose round is still running offers no download', async ({ page }) => {
  await login(page, 'admin@example.com', 'admin123', '/admin');
  const card = await openCertificates(page, competitionId);
  const junior = card.locator('li', { hasText: 'Junior' });
  await expect(junior.getByText('Rounds still running')).toBeVisible();
  await expect(junior.getByRole('button')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Download all (ZIP)' })).toHaveCount(0);
});

test('head judge completes the round', async ({ page }) => {
  await login(page, 'petra@example.com', 'headjudge123', '/head-judge');
  await page.goto('/head-judge');
  await page.getByText('Qualifications').click();
  await page.waitForURL(/\/head-judge\/competitions\/\d+\/groups\/\d+\/rounds\/\d+/);

  // Leon's first attempt is scored, so Next moves on, the other three attempts are skipped
  await page.getByRole('button', { name: /Next/ }).click();
  for (let i = 0; i < 3; i++) {
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /Skip Athlete/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Round completed' })).toBeVisible();
});

test('admin downloads the certificates of the finished group with a page per athlete', async ({ page }) => {
  await login(page, 'admin@example.com', 'admin123', '/admin');
  const card = await openCertificates(page, competitionId);
  const junior = card.locator('li', { hasText: 'Junior' });
  await expect(junior.getByText('Ready')).toBeVisible();

  const { filename, buffer } = await download(page, junior.getByRole('button', { name: 'Download' }));
  expect(filename).toBe('certificates-spring-championship-junior.pdf');
  const { pages, text } = await readPdf(buffer);
  expect(pages).toBe(2);
  for (const expected of ['Certificate', 'Spring Championship', 'Leon Weber', 'TSV München', 'Emma Fischer', 'SV Hamburg', '1st place', '4.1', 'Qualifications']) {
    expect(text).toContain(expected);
  }
  // the sample data is only for previews and must never leak into a real PDF
  expect(text).not.toContain('Anna Example');
});

test('admin downloads all groups as a ZIP', async ({ page }) => {
  await login(page, 'admin@example.com', 'admin123', '/admin');
  const card = await openCertificates(page, competitionId);
  const { filename, buffer } = await download(page, card.getByRole('button', { name: 'Download all (ZIP)' }));
  expect(filename).toBe('certificates-spring-championship.zip');
  expect(buffer.subarray(0, 2).toString()).toBe('PK');
  expect(buffer.includes('certificates-spring-championship-junior.pdf')).toBe(true);
});

test('admin downloads the example template and uses it as a PDF template', async ({ page }) => {
  await login(page, 'admin@example.com', 'admin123', '/admin');
  const card = await openCertificates(page, competitionId);
  const example = await download(page, card.getByRole('link', { name: 'Example template (PDF)' }));
  expect(example.filename).toBe('certificates-example-template.pdf');
  expect((await readPdf(example.buffer)).text).toContain('{{name}}');

  await card.locator('input[name=template]').setInputFiles({ name: 'mine.pdf', mimeType: 'application/pdf', buffer: example.buffer });
  const { buffer } = await download(page, card.locator('li', { hasText: 'Junior' }).getByRole('button', { name: 'Download' }));
  const { pages, text } = await readPdf(buffer);
  expect(pages).toBe(2);
  for (const expected of ['Spring Championship', 'Leon Weber', 'TSV München', 'Emma Fischer', '1st place', '4.1']) {
    expect(text).toContain(expected);
  }
});

test('admin sees an error for a PDF template without a name marker', async ({ page }) => {
  await login(page, 'admin@example.com', 'admin123', '/admin');
  const card = await openCertificates(page, competitionId);
  // a PDF made by hand with a single line of text and no marker
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 20 50 Td (Hello) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF');
  await card.locator('input[name=template]').setInputFiles({ name: 'plain.pdf', mimeType: 'application/pdf', buffer: pdf });
  await card.locator('li', { hasText: 'Junior' }).getByRole('button', { name: 'Download' }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/documents$/);
  await expect(page.getByText(/needs a .* marker|could not be read/)).toBeVisible();
});
