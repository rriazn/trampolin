import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { makeT, require } from './testHelpers.js';
const { compilePdf, createPackageGuard, readUploadedTemplate, readDefaultTemplate, readSampleData } = require('../../../src/services/pdf.service.js');

const t = makeT('en');
const data = { name: 'Anna' };
const compile = (source, options) => compilePdf(source, data, t, options);
// smallest valid PNG, one transparent pixel
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// own temp directory for this file, so compiles of other test files running at the same time are not counted
const privateTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-test-'));
process.env.TMPDIR = privateTmp;
afterAll(() => fs.rmSync(privateTmp, { recursive: true, force: true }));
const resultsDirs = () => fs.readdirSync(privateTmp).filter(name => name.startsWith('trampolin-results-'));

describe('compilePdf', { timeout: 20000 }, () => {
  it('compiles the default template with the sample data into a PDF', async () => {
    const pdf = await compilePdf(readDefaultTemplate(), readSampleData(), t);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('embeds the shipped Lato font in the default template', async () => {
    const pdf = await compilePdf(readDefaultTemplate(), readSampleData(), t);
    expect(pdf.includes('Lato')).toBe(true);
  });

  it('gives the template the data as results.json', async () => {
    const pdf = await compile('#let d = json("results.json")\n#assert.eq(d.name, "Anna")\nHello');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('writes the data under the given file name and copies extra files next to the template', async () => {
    const source = '#assert.eq(json("certificates.json").name, "Anna")\n#image("image.png", width: 1cm)';
    const pdf = await compilePdf(source, data, t, { dataFile: 'certificates.json', files: [{ name: 'image.png', buffer: PNG }] });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('reports a compile error with its message, line and column', async () => {
    await expect(compile('= Title\n#let x = ')).rejects.toMatchObject({
      name: 'TemplateError', message: 'expected expression', line: 2, column: 8,
    });
  });

  it('fails cleanly when the PDF would exceed the output size cap', async () => {
    const before = resultsDirs().length;
    await expect(compile('Hello', { outputBlocks: 1 })).rejects.toMatchObject({ name: 'TemplateError', message: t('results:errors.outputTooLarge') });
    expect(resultsDirs().length).toBe(before);
  });

  it('keeps only the start of a very long error output', async () => {
    const source = `#let x = ${'a'.repeat(200)}\n#panic("${'b'.repeat(100000)}")`;
    await expect(compile(source)).rejects.toMatchObject({ name: 'TemplateError' });
  });

  it('lets two compiles run at once and makes a third wait, or fail when no slot frees up in time', async () => {
    const runaway = '#for i in range(100000) { for j in range(100000) { let x = i * j } }';
    const slow = [compile(runaway, { timeoutMs: 2500 }), compile(runaway, { timeoutMs: 2500 })].map(p => p.catch(e => e));
    await expect(compile('Hello', { queueWaitMs: 200 })).rejects.toMatchObject({ name: 'TemplateError', message: t('results:errors.busy') });
    const waited = await compile('Hello', { queueWaitMs: 15000 });
    expect(waited.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await Promise.all(slow)).every(e => e.message === t('results:errors.timeout'))).toBe(true);
  });

  it('stops a runaway template at the timeout', async () => {
    const started = Date.now();
    await expect(compile('#for i in range(100000) { for j in range(100000) { let x = i * j } }', { timeoutMs: 1500 }))
      .rejects.toMatchObject({ name: 'TemplateError', message: t('results:errors.timeout') });
    expect(Date.now() - started).toBeLessThan(6000);
  });

  it('fails a template that allocates far too much memory', async () => {
    await expect(compile('#let a = range(100000000).map(x => x)\n#a.len()'))
      .rejects.toMatchObject({ name: 'TemplateError', message: t('results:errors.compileFailed') });
  });

  it('does not read files outside the compile root', async () => {
    await expect(compile('#read("../../../../../../etc/hostname")')).rejects.toMatchObject({ name: 'TemplateError' });
    await expect(compile('#read("/etc/hostname")')).rejects.toMatchObject({ name: 'TemplateError' });
  });

  it('does not load packages, also when the import path is built at runtime', async () => {
    await expect(compile('#import "@preview/cetz:0.2.2": canvas')).rejects.toMatchObject({ name: 'TemplateError' });
    await expect(compile('#let p = "@pre" + "view/cetz:0.2.2"\n#import p: canvas')).rejects.toMatchObject({ name: 'TemplateError' });
  });

  // a refused connection to the dead local proxy means no request left the host
  it('does not reach the package server, the download fails at a dead local proxy', async () => {
    await expect(compile('#let p = "@pre" + "view/cetz:0.2.2"\n#import p: canvas')).rejects.toMatchObject({
      name: 'TemplateError',
      message: expect.stringMatching(/failed to download package.*Connection refused/),
    });
  });

  it('removes its temporary files after success and after failure', async () => {
    const before = resultsDirs().length;
    await compile('Hello');
    await compile('#let x = ').catch(() => {});
    expect(resultsDirs().length).toBe(before);
  });
});

describe('createPackageGuard', () => {
  // a directory would not stop root from storing packages, nothing can be created below a file
  it('is a plain file, so no user can store a package below it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-guard-test-'));
    try {
      const guard = createPackageGuard(dir);
      expect(fs.statSync(guard).isFile()).toBe(true);
      expect(() => fs.mkdirSync(path.join(guard, 'preview'), { recursive: true })).toThrow(/ENOTDIR|EEXIST/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('readUploadedTemplate', () => {
  const upload = (name, content) => ({ originalname: name, buffer: Buffer.from(content), size: Buffer.byteLength(content) });
  const reason = (key) => ({ name: 'TemplateError', message: t(`results:errors.${key}`) });

  it('returns the source of a valid .typ file', () => {
    expect(readUploadedTemplate(upload('mine.typ', '= Hello'), t)).toBe('= Hello');
    expect(readUploadedTemplate(upload('MINE.TYP', '= Hello'), t)).toBe('= Hello');
  });

  it('rejects a missing file', () => {
    expect(() => readUploadedTemplate(undefined, t)).toThrow(expect.objectContaining(reason('noFile')));
  });

  it('rejects a file that is not a .typ file', () => {
    expect(() => readUploadedTemplate(upload('mine.txt', '= Hello'), t)).toThrow(expect.objectContaining(reason('notTyp')));
  });

  it('rejects a file over 256 KB', () => {
    expect(() => readUploadedTemplate(upload('big.typ', 'a'.repeat(256 * 1024 + 1)), t)).toThrow(expect.objectContaining(reason('tooLarge')));
  });

  it('rejects a file that is not valid UTF-8', () => {
    const file = { originalname: 'bad.typ', buffer: Buffer.from([0xff, 0xfe, 0x41]), size: 3 };
    expect(() => readUploadedTemplate(file, t)).toThrow(expect.objectContaining(reason('notUtf8')));
  });

  it('rejects a package import', () => {
    expect(() => readUploadedTemplate(upload('pkg.typ', '#import "@preview/cetz:0.2.2": canvas'), t)).toThrow(expect.objectContaining(reason('packages')));
    expect(() => readUploadedTemplate(upload('pkg.typ', "#import '@local/mine:0.1.0': x"), t)).toThrow(expect.objectContaining(reason('packages')));
  });
});

describe('default certificates template', { timeout: 20000 }, () => {
  const compileCertificates = (sample, files = []) =>
    compilePdf(readDefaultTemplate('certificates'), sample, t, { dataFile: 'certificates.json', files });

  it('compiles with the sample data into one page per certificate', async () => {
    const sample = readSampleData('certificates');
    const pdf = await compileCertificates(sample);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length).toBe(sample.certificates.length);
  });
});

describe('default templates and sample data per document', () => {
  it('reads the results ones by default and the ones of another document by name', () => {
    expect(readDefaultTemplate()).toBe(readDefaultTemplate('results'));
    expect(readSampleData()).toEqual(readSampleData('results'));
    expect(() => readDefaultTemplate('nothing')).toThrow();
  });
});
