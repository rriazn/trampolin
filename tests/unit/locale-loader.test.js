import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { require } from './services/testHelpers.js';
const { LANGUAGES, loadNamespace } = require('../../../src/locales/index.js');

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/locales');

describe('locale loader', () => {
  it('lists every language folder', () => {
    const folders = fs.readdirSync(localesDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    expect([...LANGUAGES].sort()).toEqual(folders.sort());
  });

  it('loads a namespace of a language', () => {
    expect(loadNamespace('de', 'admin').sportsmen.genderAbbr.f).toBe('w');
  });
});
