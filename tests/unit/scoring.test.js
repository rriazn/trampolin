import { describe, it, expect } from 'vitest';
import { combineScores, computeAttemptScore } from '../../src/utils/scoring.js';

describe('combineScores', () => {
  it('returns null for empty scores', () => {
    expect(combineScores({ scores: [] })).toBeNull();
  });

  it('sums by default', () => {
    expect(combineScores({ scores: [1, 2, 3] })).toBe(6);
  });

  it('combines with mean', () => {
    expect(combineScores({ scores: [4, 6], combine: 'mean' })).toBe(5);
  });

  it('combines with median (odd count)', () => {
    expect(combineScores({ scores: [9, 1, 5], combine: 'median' })).toBe(5);
  });

  it('combines with median (even count)', () => {
    expect(combineScores({ scores: [1, 2, 3, 4], combine: 'median' })).toBe(2.5);
  });

  it('drops the configured number of highs and lows before combining', () => {
    // sorted: 1,2,3,4,5,6 -> drop low 1 (1), drop high 1 (6) -> sum(2,3,4,5) = 14
    expect(combineScores({ scores: [6, 2, 4, 1, 5, 3], dropHigh: 1, dropLow: 1, combine: 'sum' })).toBe(14);
  });

  it('falls back to combining everything when there are not enough scores to drop from', () => {
    // Normal state during partial live judging: e.g. only 2 of 6 execution judges submitted yet.
    expect(combineScores({ scores: [3, 5], dropHigh: 2, dropLow: 2, combine: 'sum' })).toBe(8);
    expect(combineScores({ scores: [3, 5], dropHigh: 2, dropLow: 2, combine: 'mean' })).toBe(4);
  });

  it('applies the multiplier once, after combining', () => {
    expect(combineScores({ scores: [1, 2, 3], combine: 'sum', multiplier: 2 })).toBe(12);
    expect(combineScores({ scores: [10], combine: 'sum', multiplier: -1 })).toBe(-10);
  });

  it('is order-independent (unsorted input)', () => {
    expect(combineScores({ scores: [5, 9, 1], dropHigh: 1, dropLow: 1, combine: 'sum' })).toBe(5);
  });

  it('throws for an unknown combine mode', () => {
    expect(() => combineScores({ scores: [1], combine: 'bogus' })).toThrow();
  });
});

describe('computeAttemptScore', () => {
  // Mirrors the seeded 'fig' panel_template_slots (see src/db/seedDefaults.js).
  const FIG_SLOTS = [
    { judgeRoleId: 1, judgeRoleKey: 'execution', judgeRoleName: 'Execution', granularity: 'element', isDeduction: true, maxValue: 10, judgeCount: 6, dropHigh: 2, dropLow: 2, combine: 'sum', multiplier: 1 },
    { judgeRoleId: 2, judgeRoleKey: 'difficulty', judgeRoleName: 'Difficulty', granularity: 'element', isDeduction: false, maxValue: null, judgeCount: 1, dropHigh: 0, dropLow: 0, combine: 'sum', multiplier: 1 },
    { judgeRoleId: 3, judgeRoleKey: 'time_of_flight', judgeRoleName: 'Time of Flight', granularity: 'attempt', isDeduction: false, maxValue: null, judgeCount: 1, dropHigh: 0, dropLow: 0, combine: 'sum', multiplier: 1 },
    { judgeRoleId: 4, judgeRoleKey: 'horizontal_displacement', judgeRoleName: 'Horizontal Displacement', granularity: 'attempt', isDeduction: false, maxValue: null, judgeCount: 1, dropHigh: 0, dropLow: 0, combine: 'sum', multiplier: 1 },
    { judgeRoleId: 5, judgeRoleKey: 'head_judge', judgeRoleName: 'Head Judge (Penalties)', granularity: 'attempt', isDeduction: false, maxValue: null, judgeCount: 1, dropHigh: 0, dropLow: 0, combine: 'sum', multiplier: -1 },
  ];

  const LOCAL_SLOTS = FIG_SLOTS.filter(s => ['execution', 'difficulty', 'head_judge'].includes(s.judgeRoleKey));

  it('computes a full fig-shape attempt score, matching a hand-computed total', () => {
    const elementScoresByJudgeRoleId = new Map([
      [1, new Map([ // execution, 2 tricks, 6 judges each
        [1, [0.1, 0.2, 0.1, 0.3, 0.5, 0.0]], // sorted 0,.1,.1,.2,.3,.5 -> drop 2 lo/2 hi -> [.1,.2] sum=0.3
        [2, [0.2, 0.2, 0.1, 0.4, 0.6, 0.3]], // sorted .1,.2,.2,.3,.4,.6 -> drop 2 lo/2 hi -> [.2,.3] sum=0.5
      ])],
      [2, new Map([ // difficulty, 1 judge
        [1, [1.0]],
        [2, [1.5]],
      ])],
    ]);
    const scoresByJudgeRoleId = new Map([
      [3, [8.0]],  // time_of_flight
      [4, [9.4]],  // horizontal_displacement
      [5, [0.2]],  // head_judge penalty
    ]);

    const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 2);

    // execution: 10 - (0.3 + 0.5) = 9.2
    // difficulty: 2.5, time_of_flight: 8.0, horizontal_displacement: 9.4, head_judge: -0.2
    expect(result.total).toBeCloseTo(9.2 + 2.5 + 8.0 + 9.4 - 0.2);
    expect(result.isComplete).toBe(true);
    expect(result.breakdown).toHaveLength(5);
  });

  it('computes a full local-shape attempt score (execution + difficulty - head_judge penalty)', () => {
    const elementScoresByJudgeRoleId = new Map([
      [1, new Map([[1, [0, 0, 0, 0, 0, 0]]])], // execution: no deductions -> 10 - 0 = 10
      [2, new Map([[1, [2.0]]])], // difficulty
    ]);
    const scoresByJudgeRoleId = new Map([[5, [0.4]]]); // head_judge penalty

    const result = computeAttemptScore(LOCAL_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 1);
    expect(result.total).toBeCloseTo(10 + 2.0 - 0.4);
  });

  it('is not complete until every trick meets the required judge count for element roles', () => {
    const elementScoresByJudgeRoleId = new Map([
      [1, new Map([
        [1, [0, 0, 0, 0, 0, 0]], // trick 1 fully judged (6 of 6)
        [2, [0, 0]],             // trick 2 only 2 of 6
      ])],
      [2, new Map([[1, [1.0]], [2, [1.0]]])],
    ]);
    const scoresByJudgeRoleId = new Map([[3, [8]], [4, [9]], [5, [0]]]);

    const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 2);
    expect(result.isComplete).toBe(false);
    const executionBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'execution');
    expect(executionBreakdown.isComplete).toBe(false);
    expect(executionBreakdown.perTrick[0].isComplete).toBe(true);
    expect(executionBreakdown.perTrick[1].isComplete).toBe(false);
  });

  it('is not complete until every attempt-granularity role meets its required judge count', () => {
    const elementScoresByJudgeRoleId = new Map([
      [1, new Map([[1, [0, 0, 0, 0, 0, 0]]])],
      [2, new Map([[1, [1.0]]])],
    ]);
    const scoresByJudgeRoleId = new Map([[3, [8]], [4, [9]]]); // head_judge missing entirely

    const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 1);
    expect(result.isComplete).toBe(false);
    const headJudgeBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'head_judge');
    expect(headJudgeBreakdown.isComplete).toBe(false);
    expect(headJudgeBreakdown.count).toBe(0);
  });

  it('treats a role with zero submissions as contributing 0, not crashing, for live partial scoring', () => {
    const result = computeAttemptScore(FIG_SLOTS, new Map(), new Map(), 3);
    expect(result.total).toBe(0);
    expect(result.isComplete).toBe(false);
    expect(result.breakdown).toHaveLength(5);
    expect(result.breakdown.every(b => b.value === 0 || Number.isNaN(b.value) === false)).toBe(true);
  });
});
