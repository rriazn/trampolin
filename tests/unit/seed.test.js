import { describe, it, expect } from 'vitest';
import seed from '../../src/seed.js';
import { db } from './services/testHelpers.js';

describe('seed', () => {
  it('creates the admin, referees, head judge, viewer, competition and athletes without throwing', async () => {
    await seed();

    expect(db.prepare('SELECT id FROM users WHERE email=?').get('admin@example.com')).toBeDefined();
    expect(db.prepare('SELECT id FROM users WHERE email=?').get('karl@example.com')).toBeDefined();
    expect(db.prepare('SELECT id FROM users WHERE email=?').get('viewer@example.com')).toBeDefined();
    expect(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='referee'").get().n).toBe(8);
    expect(db.prepare('SELECT id FROM competitions WHERE name=?').get('Spring Championship')).toBeDefined();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sportsmen').get().n).toBe(10);
  });

  // sportsmen aren't deduplicated on re-seed (separate pre-existing gap), so not asserted here
  it('running it again does not throw, and does not duplicate users/competitions/groups', async () => {
    await seed();
    await seed();

    expect(db.prepare('SELECT COUNT(*) AS n FROM competitions WHERE name=?').get('Spring Championship').n).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='referee'").get().n).toBe(8);
    expect(db.prepare('SELECT COUNT(*) AS n FROM groups').get().n).toBe(4);
  });
});
