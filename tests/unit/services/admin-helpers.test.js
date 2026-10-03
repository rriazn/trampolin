import { describe, it, expect } from 'vitest';
import { makeUser, makeCompetition, makeSportsman, db, require } from './testHelpers.js';
const { getAdminStats, fileNameSlug } = require('../../../src/services/helpers/admin.helpers.js');

describe('getAdminStats', () => {
  it('counts referees (not admins/head judges), sportsmen, and competitions', () => {
    const before = getAdminStats();

    makeUser('referee');
    makeUser('admin');
    makeUser('head_judge');
    const comp = makeCompetition();
    makeSportsman(comp.id, null);
    makeSportsman(comp.id, null);

    const after = getAdminStats();
    expect(after.users).toBe(before.users + 1);
    expect(after.sportsmen).toBe(before.sportsmen + 2);
    expect(after.competitions).toBe(before.competitions + 1);
  });

  it('reflects an empty database as all zeros', () => {
    db.prepare('DELETE FROM sportsmen').run();
    db.prepare('DELETE FROM competitions').run();
    db.prepare('DELETE FROM users').run();

    const stats = getAdminStats();
    expect(stats).toEqual({ users: 0, sportsmen: 0, competitions: 0 });
  });
});

describe('fileNameSlug', () => {
  it('lowercases, joins words with dashes and drops accents', () => {
    expect(fileNameSlug('City Open 2026')).toBe('city-open-2026');
    expect(fileNameSlug('Österreich Cup')).toBe('osterreich-cup');
  });

  it('removes characters that are not allowed in file names and trailing dots', () => {
    expect(fileNameSlug('A/B: "Cup"?*.')).toBe('ab-cup');
  });

  it('keeps only ASCII, so the name is safe in a header and a zip entry', () => {
    expect(fileNameSlug('Straße ★ Cup')).toBe('strasse-cup');
  });

  it('transliterates common letters that have no accent form', () => {
    expect(fileNameSlug('Søren Cup')).toBe('soren-cup');
    expect(fileNameSlug('Łódź Æble Đorđe')).toBe('lodz-aeble-dorde');
  });

  it('uses the fallback when nothing is left, such as for Cyrillic or CJK names', () => {
    expect(fileNameSlug('Кубок', 'competition')).toBe('competition');
    expect(fileNameSlug('東京')).toBe('file');
    expect(fileNameSlug('???')).toBe('file');
  });
});
