import { describe, it, expect } from 'vitest';
import { makeCompetition, getJudgeRoleIds, require } from './testHelpers.js';
const { computeAttemptScore } = require('../../../src/services/scoring.service.js');
const { loadPanelSlots } = require('../../../src/services/panels.service.js');

// one map entry per skill, plus an optional landing in slot 11
function elements(perSkill, landing) {
  const m = new Map();
  perSkill.forEach((values, i) => m.set(i + 1, values));
  if (landing) m.set(11, landing);
  return m;
}

const repeat = (values, n) => Array.from({ length: n }, () => values);

function scoreSynchro(templateKey, elementScores, attemptScores, elementCount = 10) {
  const { panelTemplateId } = makeCompetition({ panelKey: templateKey });
  const roleIds = getJudgeRoleIds();
  const slots = loadPanelSlots(panelTemplateId);
  const elementMap = new Map(Object.entries(elementScores).map(([key, m]) => [roleIds[key], m]));
  const attemptMap = new Map(Object.entries(attemptScores).map(([key, v]) => [roleIds[key], v]));
  return computeAttemptScore(slots, attemptMap, elementMap, elementCount);
}

const value = (result, key) => result.breakdown.find(b => b.judgeRoleKey === key).value;

describe('fig_synchro scoring (FIG 17.2)', () => {
  const figElements = {
    // trampoline 1 medians: 10 x 0.2 plus landing 0.1 = 2.1 deducted
    execution_t1: elements(repeat([0.1, 0.2, 0.3], 10), [0.1, 0.1, 0.3]),
    // trampoline 2 medians: all 0
    execution_t2: elements(repeat([0, 0, 0.1], 10), [0, 0, 0]),
    difficulty: elements(repeat([0.5], 10)),
  };
  const figAttempt = { horizontal_displacement: [9], synchronisation: [8], head_judge: [0.5] };

  it('averages the per-trampoline median deductions into one E mark of at most 10', () => {
    const result = scoreSynchro('fig_synchro', figElements, figAttempt);

    const e = value(result, 'execution_t1') + value(result, 'execution_t2');
    expect(value(result, 'execution_t1')).toBeCloseTo(3.95);
    expect(value(result, 'execution_t2')).toBeCloseTo(5);
    expect(e).toBeCloseTo(10 - (2.1 + 0) / 2);
  });

  it('caps E at 10 when nobody deducts anything', () => {
    const clean = {
      ...figElements,
      execution_t1: elements(repeat([0, 0, 0], 10), [0, 0, 0]),
      execution_t2: elements(repeat([0, 0, 0], 10), [0, 0, 0]),
    };
    const result = scoreSynchro('fig_synchro', clean, figAttempt);

    expect(value(result, 'execution_t1') + value(result, 'execution_t2')).toBeCloseTo(10);
  });

  it('doubles the synchronisation device mark and has no time of flight in the total', () => {
    const result = scoreSynchro('fig_synchro', figElements, figAttempt);

    expect(value(result, 'synchronisation')).toBeCloseTo(16);
    expect(result.breakdown.map(b => b.judgeRoleKey)).not.toContain('time_of_flight');
    // E 8.95 + D 5 + H 9 + S 16 - P 0.5
    expect(result.total).toBeCloseTo(38.45);
    expect(result.isComplete).toBe(true);
  });

  it('is incomplete until the judges of both trampolines have scored', () => {
    const onlyT1 = { execution_t1: figElements.execution_t1, difficulty: figElements.difficulty };
    const result = scoreSynchro('fig_synchro', onlyT1, figAttempt);

    expect(result.isComplete).toBe(false);
  });
});

describe('local_synchro scoring', () => {
  const localElements = {
    // trampoline 1 means: 10 x 0.2 plus landing 0.1 = 2.1 deducted
    execution_t1: elements(repeat([0.1, 0.3], 10), [0.1, 0.1]),
    execution_t2: elements(repeat([0, 0], 10), [0, 0]),
    difficulty: elements(repeat([0.5], 10)),
    // ten deductions of 0.1 from the single per-skill synchronisation judge
    synchronisation_skill: elements(repeat([0.1], 10)),
  };

  it('averages the per-trampoline means and scores S as (skills - deductions) x 2 with no landing line', () => {
    const result = scoreSynchro('local_synchro', localElements, { head_judge: [0] });

    expect(value(result, 'execution_t1') + value(result, 'execution_t2')).toBeCloseTo(8.95);
    expect(value(result, 'synchronisation_skill')).toBeCloseTo((10 - 1) * 2);
    expect(result.breakdown.find(b => b.judgeRoleKey === 'synchronisation_skill').perTrick).toHaveLength(10);
    expect(result.total).toBeCloseTo(8.95 + 5 + 18);
    expect(result.isComplete).toBe(true);
  });

  it('scales S to the number of skills actually performed', () => {
    const six = {
      execution_t1: elements(repeat([0, 0], 6)),
      execution_t2: elements(repeat([0, 0], 6)),
      difficulty: elements(repeat([0.5], 6)),
      synchronisation_skill: elements(repeat([0.1], 6)),
    };
    const result = scoreSynchro('local_synchro', six, { head_judge: [0] }, 6);

    expect(value(result, 'synchronisation_skill')).toBeCloseTo((6 - 0.6) * 2);
  });
});
