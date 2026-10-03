import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { makeT, require } from './testHelpers.js';
const { compilePdf, readSampleData } = require('../../../src/services/pdf.service.js');
const { readUploadedPdfTemplate, compileOverlay, buildExampleTemplate, MARKER_KEYS, MAX_PDF_TEMPLATE_BYTES } = require('../../../src/services/pdf-template.service.js');

// the stub translator of the helpers does not interpolate
const stub = makeT('en');
const t = (key, options = {}) => stub(key).replace(/\{\{(\w+)\}\}/g, (_, name) => options[name]);
const page = '#set page(width: 200pt, height: 100pt, margin: 0pt)\n#set text(font: "Lato")\n';
const make = (source) => compilePdf(page + source, {}, t);
const upload = (buffer, size = buffer.length) => ({ originalname: 'template.pdf', buffer, size });
const read = async (source) => readUploadedPdfTemplate(upload(await make(source)), t);
const reason = (key) => ({ name: 'TemplateError', message: t(`certificates:errors.${key}`) });

describe('readUploadedPdfTemplate', { timeout: 20000 }, () => {
  it('returns the PDF as background.pdf with the page size and the markers', async () => {
    const result = await read('#place(top + left, dx: 20pt, dy: 30pt)[#text(size: 12pt)[\\{\\{name\\}\\}]]');
    expect(result.pdf.name).toBe('background.pdf');
    expect(result.pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.layout.page).toEqual({ width: 200, height: 100 });
    expect(result.layout.markers).toHaveLength(1);
    const [marker] = result.layout.markers;
    expect(marker.key).toBe('name');
    expect(marker.size).toBeCloseTo(12, 1);
    expect(marker.x).toBeCloseTo(20, 0);
    // baseline from the top of the page, a 12pt Lato line starting at 30pt has its baseline near 30 + 12 * 0.8
    expect(marker.y).toBeGreaterThan(36);
    expect(marker.y).toBeLessThan(44);
    expect(marker.width).toBeGreaterThan(30);
    expect(marker.width).toBeLessThan(60);
  });

  it('finds several markers on several lines and ignores other text', async () => {
    const { layout } = await read('Some static text\n\n\\{\\{name\\}\\}\n\n#text(size: 20pt)[\\{\\{ club \\}\\}]');
    expect(layout.markers.map(m => m.key).sort()).toEqual(['club', 'name']);
    expect(layout.markers.find(m => m.key === 'club').size).toBeCloseTo(20, 1);
  });

  it('finds a marker that the editor split into several text runs', async () => {
    const { layout } = await read('#place(top + left, dx: 10pt, dy: 10pt)[\\{\\{#strong[na]#text(fill: red)[me]\\}\\}]');
    expect(layout.markers.map(m => m.key)).toEqual(['name']);
    expect(layout.markers[0].x).toBeCloseTo(10, 0);
  });

  it('accepts every documented marker', async () => {
    const source = MARKER_KEYS.map(key => `\\{\\{${key}\\}\\}`).join(' ');
    const { layout } = await read(`#set text(size: 6pt)\n${source}`);
    expect(layout.markers.map(m => m.key).sort()).toEqual([...MARKER_KEYS].sort());
  });

  it('rejects an unknown marker and names it', async () => {
    await expect(read('\\{\\{name\\}\\} \\{\\{colour\\}\\}')).rejects.toMatchObject({
      name: 'TemplateError', message: t('certificates:errors.unknownMarker', { names: 'colour' }),
    });
  });

  it('rejects a PDF without a name marker', async () => {
    const noName = { name: 'TemplateError', message: t('certificates:errors.noNameMarker', { marker: '{{name}}' }) };
    await expect(read('\\{\\{club\\}\\}')).rejects.toMatchObject(noName);
    await expect(read('Hello')).rejects.toMatchObject(noName);
  });

  it('rejects a PDF with more than one page', async () => {
    await expect(read('\\{\\{name\\}\\}\n#pagebreak()\nPage two')).rejects.toMatchObject(reason('pdfPages'));
  });

  it('rejects a file that is not a PDF, whatever its name', async () => {
    await expect(readUploadedPdfTemplate(upload(Buffer.from('#let x = 1')), t)).rejects.toMatchObject(reason('notPdf'));
    await expect(readUploadedPdfTemplate({ ...upload(Buffer.from('<svg/>')), originalname: 'a.pdf' }, t)).rejects.toMatchObject(reason('notPdf'));
  });

  it('rejects a broken PDF', async () => {
    const pdf = await make('\\{\\{name\\}\\}');
    await expect(readUploadedPdfTemplate(upload(pdf.subarray(0, 200)), t)).rejects.toMatchObject(reason('pdfUnreadable'));
  });

  it('reads only a few PDFs at the same time and turns the others away when they wait too long', async () => {
    const pdf = await make('\\{\\{name\\}\\}');
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => readUploadedPdfTemplate(upload(pdf), t, { queueWaitMs: 1 })));
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(fulfilled.length).toBeLessThanOrEqual(2);
    expect(rejected.length).toBeGreaterThanOrEqual(3);
    expect(rejected.every(r => r.reason.message === t('results:errors.busy'))).toBe(true);
  });

  it('rejects a missing file and a file over the size limit', async () => {
    await expect(readUploadedPdfTemplate(undefined, t)).rejects.toMatchObject(reason('noPdf'));
    await expect(readUploadedPdfTemplate(upload(await make('\\{\\{name\\}\\}'), MAX_PDF_TEMPLATE_BYTES + 1), t)).rejects.toMatchObject(reason('pdfTooLarge'));
  });

  it('stops reading after the timeout', async () => {
    const pdf = await make('\\{\\{name\\}\\}');
    await expect(readUploadedPdfTemplate(upload(pdf), t, { timeoutMs: 1 })).rejects.toMatchObject(reason('pdfUnreadable'));
  });
});

const importModule = (specifier) => import(specifier);

async function pagesOf(buffer) {
  const pdfjs = await importModule('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages;
}

describe('example template and overlay', { timeout: 30000 }, () => {
  const sample = () => ({ ...readSampleData('certificates'), labels: { ...readSampleData('certificates').labels, title: 'Certificate' } });

  it('builds an example PDF that is itself a valid template with every marker', async () => {
    const example = await buildExampleTemplate(t);
    expect(example.subarray(0, 5).toString()).toBe('%PDF-');
    const { layout } = await readUploadedPdfTemplate(upload(example), t);
    expect(layout.markers.map(m => m.key).sort()).toEqual([...MARKER_KEYS].sort());
  });

  it('prints the data of every certificate on its own page of the template size', async () => {
    const template = await readUploadedPdfTemplate(upload(await buildExampleTemplate(t)), t);
    const pdf = await compileOverlay(sample(), template, t);
    const pages = await pagesOf(pdf);
    expect(pages).toHaveLength(sample().certificates.length);
    expect(pages[0]).toContain('Anna Example');
    expect(pages[0]).toContain('1st place');
    expect(pages[1]).toContain('Berta Beispiel');
    // a pair names the partner in the partner line
    expect(pages[1]).toContain('together with Clara Beispiel');
    // an athlete without a result gets no place text, and an individual no partner line
    expect(pages[3]).toContain('Dora Demo');
    expect(pages[3]).not.toContain('together with');
  });

  it('keeps a long name inside the page', async () => {
    const data = sample();
    data.certificates = [{ ...data.certificates[0], name: 'Bertholdine-Annemarie von Beispielhausen-Musterfeld-Neuhausen' }];
    const template = await readUploadedPdfTemplate(upload(await buildExampleTemplate(t)), t);
    const pdf = await compileOverlay(data, template, t);
    const pdfjs = await importModule('pdfjs-dist/legacy/build/pdf.mjs');
    const page = await (await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise).getPage(1);
    const item = (await page.getTextContent()).items.find(i => i.str.includes('Bertholdine'));
    const [left, , right] = page.view;
    expect(item.transform[4]).toBeGreaterThan(left + 10);
    expect(item.transform[4] + item.width).toBeLessThan(right - 10);
  });

  it('moves a long value away from the page edge when its marker is close to it', async () => {
    const template = await readUploadedPdfTemplate(upload(await make('#place(top + left, dx: 10pt, dy: 30pt)[#text(size: 12pt)[\\{\\{name\\}\\}]]')), t);
    const data = sample();
    data.certificates = [{ ...data.certificates[0], name: 'Bertholdine-Annemarie von Beispielhausen' }];
    const pdfjs = await importModule('pdfjs-dist/legacy/build/pdf.mjs');
    const page = await (await pdfjs.getDocument({ data: new Uint8Array(await compileOverlay(data, template, t)) }).promise).getPage(1);
    // the editor may split the text into several items, the whole name counts
    // the covered marker text of the design is still in the text layer, it does not count
    const items = (await page.getTextContent()).items.filter(i => i.str.trim() && !/[{}]/.test(i.str));
    const left = Math.min(...items.map(i => i.transform[4]));
    const right = Math.max(...items.map(i => i.transform[4] + i.width));
    // 15 mm margin is about 42.5 points, the page is 200 points wide
    expect(left).toBeGreaterThan(42);
    expect(right).toBeLessThan(200 - 42);
  });

  it('explains a PDF that Typst cannot embed without pointing at the internal template', async () => {
    // PDF/A-4 is PDF 2.0, which pdf.js reads but Typst refuses as an image
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-a4-test-'));
    try {
      fs.writeFileSync(path.join(dir, 'main.typ'), `${page}\\{\\{name\\}\\}`);
      execFileSync(process.env.TYPST_BIN || 'typst', ['compile', '--ignore-system-fonts', '--pdf-standard', 'a-4', path.join(dir, 'main.typ'), path.join(dir, 'a4.pdf')]);
      const template = await readUploadedPdfTemplate(upload(fs.readFileSync(path.join(dir, 'a4.pdf'))), t);
      const error = await compileOverlay(sample(), template, t).catch(e => e);
      expect(error).toMatchObject({ name: 'TemplateError' });
      expect(error.line).toBeUndefined();
      expect(error.message).toBe(t('certificates:errors.pdfNotUsable', { message: 'the version of the PDF is too high' }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
