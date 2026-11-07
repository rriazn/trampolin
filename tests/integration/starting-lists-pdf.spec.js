const { test, expect } = require('../helpers/english-session');
const fs = require('fs');

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
  return { text: text.replace(/\s+/g, ' '), pages: doc.numPages };
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed', { data: { type: 'startingGroup' } });
  expect(res.ok()).toBeTruthy();
});

test('admin downloads all starting lists of a starting group, one page per round in start order', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@example.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');

  await page.goto('/admin/competitions');
  await page.getByRole('row').filter({ hasText: 'Spring Championship' }).getByRole('link', { name: 'Documents' }).click();
  await page.waitForURL(/\/admin\/competitions\/\d+\/documents$/);
  const card = page.locator('#document-starting-lists');

  const downloading = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Download all' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('starting-lists-spring-championship.pdf');

  const { text, pages } = await pdfText(fs.readFileSync(await download.path()));
  expect(pages).toBe(2);
  expect(text).toContain('Junior – Qualifications');
  expect(text).toContain('Youth – Qualifications');
  expect(text.match(/Starting group: Block 1/g)).toHaveLength(2);
  // groups in name order, each in its own start order
  const order = ['Leon Weber', 'Emma Fischer', 'Anna Klein', 'Mia Braun'].map(name => text.indexOf(name));
  expect(order.every(i => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});
