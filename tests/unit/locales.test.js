import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './services/testHelpers.js';

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/locales');
const namespaces = fs.readdirSync(path.join(localesDir, 'en')).map((f) => f.replace('.json', ''));
const load = (lng, ns) => JSON.parse(fs.readFileSync(path.join(localesDir, lng, `${ns}.json`), 'utf8'));

// flattens nested objects to dotted key paths
function keyPaths(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => (
    value && typeof value === 'object' ? keyPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  ));
}

describe('locale files', () => {
  it.each(namespaces)('%s has the same keys in en and de', (ns) => {
    expect(keyPaths(load('de', ns)).sort()).toEqual(keyPaths(load('en', ns)).sort());
  });

  it.each(['en', 'de'])('%s translates every seeded judge role, panel template and competition type', (lng) => {
    const common = load(lng, 'common');
    for (const { key } of db.prepare('SELECT key FROM judge_roles').all()) {
      expect(common.judgeRoles[key], `judgeRoles.${key}`).toBeTruthy();
    }
    for (const { key } of db.prepare('SELECT key FROM panel_templates').all()) {
      expect(common.panelTemplates[key]?.name, `panelTemplates.${key}.name`).toBeTruthy();
      expect(common.panelTemplates[key]?.description, `panelTemplates.${key}.description`).toBeTruthy();
    }
    for (const type of ['individual', 'synchro']) {
      expect(common.competitionTypes[type], `competitionTypes.${type}`).toBeTruthy();
    }
  });
});
