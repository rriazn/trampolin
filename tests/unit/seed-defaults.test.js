import { describe, it, expect } from 'vitest';
import { db, require } from './services/testHelpers.js';

const applySeedDefaults = require('../../../src/db/seedDefaults.js');

const role = (key) => db.prepare('SELECT * FROM judge_roles WHERE key=?').get(key);

function templateSlots(templateKey) {
  return db.prepare(`
    SELECT jr.key AS role, s.judge_count, s.drop_high, s.drop_low, s.combine, s.multiplier, s.shared_assignment_group, s.aggregation
    FROM panel_template_slots s
    JOIN panel_templates t ON t.id = s.panel_template_id
    JOIN judge_roles jr ON jr.id = s.judge_role_id
    WHERE t.key = ?
    ORDER BY s.sort_order
  `).all(templateKey);
}

describe('seed defaults: judge roles', () => {
  it('flags only execution as having a landing line among the individual roles', () => {
    expect(role('execution').has_landing).toBe(1);
    for (const key of ['difficulty', 'time_of_flight', 'horizontal_displacement', 'head_judge']) {
      expect(role(key).has_landing).toBe(0);
    }
  });

  it.each([
    ['execution_t1', 'element', 1, 0, 0.5, 1],
    ['execution_t2', 'element', 1, 0, 0.5, 1],
    ['synchronisation', 'attempt', 0, 0, 10, 0],
    ['synchronisation_skill', 'element', 1, 0, 0.5, 0],
  ])('creates the synchro role %s', (key, granularity, isDeduction, scoreMin, scoreMax, hasLanding) => {
    expect(role(key)).toMatchObject({
      granularity, is_deduction: isDeduction, score_min: scoreMin, score_max: scoreMax, has_landing: hasLanding,
    });
  });

  it('upgrades has_landing on an existing execution role that predates the flag', () => {
    db.prepare("UPDATE judge_roles SET has_landing=0 WHERE key='execution'").run();

    applySeedDefaults(db);

    expect(role('execution').has_landing).toBe(1);
  });

  it('does not duplicate roles when run again', () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM judge_roles').get().n;

    applySeedDefaults(db);

    expect(db.prepare('SELECT COUNT(*) AS n FROM judge_roles').get().n).toBe(before);
  });
});

describe('seed defaults: panel templates', () => {
  const type = (key) => db.prepare('SELECT competition_type FROM panel_templates WHERE key=?').get(key)?.competition_type;

  it('keeps the existing templates individual and adds the two synchro templates', () => {
    expect(type('fig')).toBe('individual');
    expect(type('local')).toBe('individual');
    expect(type('test')).toBe('individual');
    expect(type('fig_synchro')).toBe('synchro');
    expect(type('local_synchro')).toBe('synchro');
    expect(type('test_synchro')).toBe('synchro');
  });

  it('resets the competition type of a seeded template when run again', () => {
    db.prepare("UPDATE panel_templates SET competition_type='synchro' WHERE key='fig'").run();

    applySeedDefaults(db);

    expect(type('fig')).toBe('individual');
  });

  it('builds fig_synchro with a median E per trampoline and the device S doubled', () => {
    expect(templateSlots('fig_synchro')).toEqual([
      { role: 'execution_t1', judge_count: 3, drop_high: 0, drop_low: 0, combine: 'median', multiplier: 0.5, shared_assignment_group: null, aggregation: 'per_trick' },
      { role: 'execution_t2', judge_count: 3, drop_high: 0, drop_low: 0, combine: 'median', multiplier: 0.5, shared_assignment_group: null, aggregation: 'per_trick' },
      { role: 'difficulty', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1, shared_assignment_group: null, aggregation: 'per_trick' },
      { role: 'horizontal_displacement', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1, shared_assignment_group: 'hd_sync', aggregation: 'per_trick' },
      { role: 'synchronisation', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 2, shared_assignment_group: 'hd_sync', aggregation: 'per_trick' },
      { role: 'head_judge', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: -1, shared_assignment_group: null, aggregation: 'per_trick' },
    ]);
  });

  it('builds local_synchro with a mean E per trampoline and S per skill', () => {
    expect(templateSlots('local_synchro')).toEqual([
      { role: 'execution_t1', judge_count: 2, drop_high: 0, drop_low: 0, combine: 'mean', multiplier: 0.5, shared_assignment_group: null, aggregation: 'per_trick' },
      { role: 'execution_t2', judge_count: 2, drop_high: 0, drop_low: 0, combine: 'mean', multiplier: 0.5, shared_assignment_group: null, aggregation: 'per_trick' },
      { role: 'difficulty', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1, shared_assignment_group: null, aggregation: 'per_trick' },
      { role: 'synchronisation_skill', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 2, shared_assignment_group: null, aggregation: 'per_trick' },
      { role: 'head_judge', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: -1, shared_assignment_group: null, aggregation: 'per_trick' },
    ]);
  });

  it('builds test_synchro with one judge per role and the synchronisation device mark', () => {
    const slots = templateSlots('test_synchro');

    expect(slots.map((s) => s.role)).toEqual(['execution_t1', 'execution_t2', 'difficulty', 'synchronisation', 'head_judge']);
    expect(slots.every((s) => s.judge_count === 1)).toBe(true);
    expect(slots.find((s) => s.role === 'synchronisation').multiplier).toBe(2);
  });

  it('has no time of flight in either synchro template', () => {
    for (const key of ['fig_synchro', 'local_synchro']) {
      const roles = templateSlots(key).map((s) => s.role);
      expect(roles.length).toBeGreaterThan(0);
      expect(roles).not.toContain('time_of_flight');
    }
  });
});
