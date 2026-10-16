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

  it('seeds two groups of one starting group with the rounds not started', async () => {
    const result = await seedTestData({ type: 'startingGroup' });

    expect(competition(result.competitionId)).toMatchObject({ type: 'individual', template_key: 'test' });
    const groups = db.prepare('SELECT id, name, starting_group_id, starting_group_position FROM groups WHERE competition_id=? ORDER BY starting_group_position').all(result.competitionId);
    expect(groups.map(g => g.id)).toEqual([result.groupId, result.groupBId]);
    expect(new Set(groups.map(g => g.starting_group_id)).size).toBe(1);
    expect(groups.map(g => g.starting_group_position)).toEqual([1, 2]);
    expect(result.startingGroupId).toBe(groups[0].starting_group_id);
    for (const roundId of [result.roundId, result.roundBId]) {
      expect(db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(roundId)).toEqual({ status: 'not_started', current_attempt_id: null });
      expect(db.prepare('SELECT COUNT(*) AS n FROM entries WHERE round_id=?').get(roundId).n).toBe(2);
      expect(db.prepare('SELECT COUNT(*) AS n FROM attempts a JOIN entries e ON e.id=a.entry_id WHERE e.round_id=?').get(roundId).n).toBe(4);
    }
  });

  it('staffs the starting group fixture so the head judge can start it', async () => {
    const result = await seedTestData({ type: 'startingGroup' });
    const roles = db.prepare(`
      SELECT jr.key, u.email FROM panel_assignments pa
      JOIN judge_roles jr ON jr.id = pa.judge_role_id JOIN users u ON u.id = pa.user_id
      WHERE pa.competition_id=? ORDER BY jr.key, u.email
    `).all(result.competitionId);
    expect(roles).toEqual([
      { key: 'difficulty', email: 'maria@example.com' },
      { key: 'execution', email: 'maria@example.com' },
      { key: 'head_judge', email: 'petra@example.com' },
    ]);
  });
});
