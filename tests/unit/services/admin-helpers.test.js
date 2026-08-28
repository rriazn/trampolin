import { describe, it, expect } from 'vitest';
import { makeUser, makeCompetition, makeSportsman, db, require } from './testHelpers.js';
const { getAdminStats } = require('../../../src/services/admin-helpers.js');

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
