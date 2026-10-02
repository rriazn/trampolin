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
    expect(db.prepare('SELECT COUNT(*) AS n FROM sportsmen').get().n).toBe(14);
  });

  it('is idempotent: running it again does not throw or duplicate fixtures', async () => {
    await seed();
    await seed();

    expect(db.prepare('SELECT COUNT(*) AS n FROM competitions WHERE name=?').get('Spring Championship').n).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='referee'").get().n).toBe(8);
    expect(db.prepare('SELECT COUNT(*) AS n FROM groups').get().n).toBe(5);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sportsmen').get().n).toBe(14);
    expect(db.prepare('SELECT COUNT(*) AS n FROM competitions').get().n).toBe(2);
  });
});

describe('seed: sample synchro competition', () => {
  const synchroComp = () => db.prepare("SELECT c.*, t.key AS template_key FROM competitions c LEFT JOIN panel_templates t ON t.id = c.panel_template_id WHERE c.name='Synchro Cup'").get();

  it('creates a synchro competition on the local synchro panel', async () => {
    await seed();

    expect(synchroComp()).toMatchObject({ type: 'synchro', status: 'active', template_key: 'local_synchro' });
  });

  it('creates pairs with both athletes on one row', async () => {
    await seed();

    const pairs = db.prepare('SELECT * FROM sportsmen WHERE competition_id=? ORDER BY name').all(synchroComp().id);
    expect(pairs).toHaveLength(4);
    for (const pair of pairs) {
      expect(pair.partner_name).toBeTruthy();
      expect(pair.group_id).not.toBeNull();
    }
  });

  it('staffs the whole local synchro panel', async () => {
    await seed();

    const counts = db.prepare(`
      SELECT jr.key, COUNT(*) AS n FROM panel_assignments pa JOIN judge_roles jr ON jr.id = pa.judge_role_id
      WHERE pa.competition_id=? GROUP BY jr.key
    `).all(synchroComp().id);
    expect(Object.fromEntries(counts.map(c => [c.key, c.n]))).toEqual({
      execution_t1: 2, execution_t2: 2, difficulty: 1, synchronisation_skill: 1, head_judge: 1,
    });
  });
});
