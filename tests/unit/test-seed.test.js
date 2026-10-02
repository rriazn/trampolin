import { describe, it, expect } from 'vitest';
import { db, require } from './services/testHelpers.js';
const { seedTestData } = require('../../../src/services/test-seed.service.js');

const competition = (id) => db.prepare('SELECT c.*, t.key AS template_key FROM competitions c JOIN panel_templates t ON t.id = c.panel_template_id WHERE c.id=?').get(id);

describe('seedTestData', () => {
  it('seeds an individual competition on the fig panel by default', async () => {
    const result = await seedTestData();

    expect(result).toMatchObject({ ok: true });
    expect(competition(result.competitionId)).toMatchObject({ type: 'individual', template_key: 'fig' });
    expect(db.prepare('SELECT partner_name FROM sportsmen WHERE competition_id=?').all(result.competitionId).every(s => s.partner_name === null)).toBe(true);
  });

  it('seeds a synchro competition with pairs when asked for one', async () => {
    const result = await seedTestData({ type: 'synchro' });

    expect(result).toMatchObject({ ok: true });
    expect(competition(result.competitionId)).toMatchObject({ type: 'synchro', template_key: 'test_synchro' });
    const pairs = db.prepare('SELECT name, partner_name FROM sportsmen WHERE competition_id=? ORDER BY id').all(result.competitionId);
    expect(pairs).toEqual([
      { name: 'Leon Weber', partner_name: 'Emma Fischer' },
      { name: 'Anna Klein', partner_name: 'Mia Braun' },
    ]);
  });

  it('returns the same ids for both types, with the round started on the first pair', async () => {
    const result = await seedTestData({ type: 'synchro' });

    for (const key of ['competitionId', 'groupId', 'roundId', 'sp1Id', 'sp2Id', 'attempt1Id', 'attempt2Id', 'attempt3Id', 'attempt4Id', 'headJudgeRoleId', 'headJudgeUserId']) {
      expect(result[key], key).toEqual(expect.any(Number));
    }
    const round = db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(result.roundId);
    expect(round).toEqual({ status: 'in_progress', current_attempt_id: result.attempt1Id });
  });

  it('staffs one referee for the synchronisation device mark and one head judge', async () => {
    const result = await seedTestData({ type: 'synchro' });

    const roles = db.prepare(`
      SELECT jr.key, u.email FROM panel_assignments pa
      JOIN judge_roles jr ON jr.id = pa.judge_role_id JOIN users u ON u.id = pa.user_id
      WHERE pa.competition_id=? ORDER BY jr.key
    `).all(result.competitionId);
    expect(roles).toEqual([
      { key: 'head_judge', email: 'petra@example.com' },
      { key: 'synchronisation', email: 'maria@example.com' },
    ]);
    expect(result.synchronisationRoleId).toEqual(expect.any(Number));
  });

  it('can be re-run to reset the data, switching type', async () => {
    await seedTestData({ type: 'synchro' });
    const result = await seedTestData();

    expect(db.prepare('SELECT COUNT(*) AS n FROM competitions').get().n).toBe(1);
    expect(competition(result.competitionId).type).toBe('individual');
  });
});
