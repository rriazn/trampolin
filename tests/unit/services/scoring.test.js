import { describe, it, expect } from 'vitest';
import { combineScores, computeAttemptScore, keptIndices, parseAndValidate11thScore } from '../../../src/services/scoring.service.js';

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
    // normal state during partial live judging, e.g. only 2 of 6 execution judges submitted yet
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

describe('keptIndices', () => {
  it('keeps every index when nothing is dropped', () => {
    expect([...keptIndices([3, 1, 2])].sort()).toEqual([0, 1, 2]);
  });

  it('returns the original positions of the values that survive dropping', () => {
    // values 6,2,4,1,5,3 -> drop the lowest (1 at index 3) and the highest (6 at index 0)
    expect([...keptIndices([6, 2, 4, 1, 5, 3], 1, 1)].sort()).toEqual([1, 2, 4, 5]);
  });

  it('keeps everything when there are not enough scores to drop from', () => {
    expect([...keptIndices([5, 7], 1, 1)].sort()).toEqual([0, 1]);
  });

  it('drops only one of two equal values', () => {
    expect(keptIndices([2, 2, 2], 1, 0).size).toBe(2);
  });
});

describe('computeAttemptScore', () => {
  // mirrors the seeded 'fig' panel_template_slots (see src/db/seedDefaults.js)
  const FIG_SLOTS = [
    { judgeRoleId: 1, judgeRoleKey: 'execution', judgeRoleName: 'Execution', granularity: 'element', isDeduction: true, hasLanding: true, maxValue: 10, judgeCount: 6, dropHigh: 2, dropLow: 2, combine: 'sum', multiplier: 1 },
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

    // execution: 2 counted judges x elementCount(2) - (0.3 + 0.5) = 3.2 (FIG 17.2.3.2)
    // difficulty: 2.5, time_of_flight: 8.0, horizontal_displacement: 9.4, head_judge: -0.2
    expect(result.total).toBeCloseTo(3.2 + 2.5 + 8.0 + 9.4 - 0.2);
    expect(result.isComplete).toBe(true);
    expect(result.breakdown).toHaveLength(5);
  });

  it('computes a full local-shape attempt score (execution + difficulty - head_judge penalty)', () => {
    const elementScoresByJudgeRoleId = new Map([
      [1, new Map([[1, [0, 0, 0, 0, 0, 0]]])], // execution: no deductions -> 2 counted judges x elementCount(1) - 0 = 2
      [2, new Map([[1, [2.0]]])], // difficulty
    ]);
    const scoresByJudgeRoleId = new Map([[5, [0.4]]]); // head_judge penalty

    const result = computeAttemptScore(LOCAL_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 1);
    expect(result.total).toBeCloseTo(2 + 2.0 - 0.4);
  });

  it('scales a deduction role\'s max to the number of skills actually performed, not a fixed constant', () => {
    // a routine shortened to 6 tricks: execution's max is 2 counted judges x 6, not the role's max_value (10)
    const elementScoresByJudgeRoleId = new Map([
      [1, new Map([
        // trick 1: all 6 judges give 0.1 -> drop 2 hi/2 lo -> keep two 0.1s -> sum 0.2; tricks 2-6: 0
        [1, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]], [2, [0, 0, 0, 0, 0, 0]], [3, [0, 0, 0, 0, 0, 0]],
        [4, [0, 0, 0, 0, 0, 0]], [5, [0, 0, 0, 0, 0, 0]], [6, [0, 0, 0, 0, 0, 0]],
      ])], // total deduction = 0.2
      [2, new Map([[1, [1]], [2, [1]], [3, [1]], [4, [1]], [5, [1]], [6, [1]]])], // difficulty, 6 tricks
    ]);
    const scoresByJudgeRoleId = new Map([[3, [8]], [4, [8]], [5, [0]]]);

    const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 6);
    const executionBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'execution');
    expect(executionBreakdown.value).toBeCloseTo(12 - 0.2); // not 20 - 0.2
  });

  describe('execution max (FIG 17.2.3.2)', () => {
    const fullRoutine = (judgeValues) => {
      const tricks = new Map();
      for (let n = 1; n <= 10; n++) tricks.set(n, judgeValues);
      tricks.set(11, judgeValues);
      return tricks;
    };
    const executionSlot = (overrides) => ({ ...FIG_SLOTS[0], ...overrides });

    it('gives a max of 20 for a clean full routine on the fig panel (sum of the two median judges)', () => {
      const result = computeAttemptScore([FIG_SLOTS[0]], new Map(), new Map([[1, fullRoutine([0, 0, 0, 0, 0, 0])]]), 10);
      expect(result.breakdown[0].value).toBeCloseTo(20);
    });

    it('keeps a max of 10 when only one judge is counted after drops', () => {
      const slot = executionSlot({ judgeCount: 1, dropHigh: 1, dropLow: 1 });
      const result = computeAttemptScore([slot], new Map(), new Map([[1, fullRoutine([0.1])]]), 10);
      expect(result.breakdown[0].value).toBeCloseTo(10 - 1.1);
    });

    it('keeps a max of 10 for median and mean combines', () => {
      for (const combine of ['median', 'mean']) {
        const slot = executionSlot({ judgeCount: 3, dropHigh: 0, dropLow: 0, combine });
        const result = computeAttemptScore([slot], new Map(), new Map([[1, fullRoutine([0.1, 0.1, 0.1])]]), 10);
        expect(result.breakdown[0].value).toBeCloseTo(10 - 1.1);
      }
    });
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

  describe('landing (is_deduction element roles, full 10-skill routines)', () => {
    it('judges landing as an 11th element via the same drop/combine rule, required for completeness, only when elementCount is 10', () => {
      const tricks = new Map();
      for (let n = 1; n <= 10; n++) tricks.set(n, [0, 0, 0, 0, 0, 0]); // no trick deductions
      tricks.set(11, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]); // landing: all 6 judges give 0.1 -> drop 2/2 -> keep two 0.1 -> sum 0.2
      const difficultyTricks = new Map();
      for (let n = 1; n <= 10; n++) difficultyTricks.set(n, [1.0]);
      const elementScoresByJudgeRoleId = new Map([[1, tricks], [2, difficultyTricks]]);
      const scoresByJudgeRoleId = new Map([[3, [8]], [4, [8]], [5, [0]]]);

      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 10);
      const executionBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'execution');
      expect(executionBreakdown.value).toBeCloseTo(20 - 0.2); // 2 counted judges x 10 tricks, minus landing's 0.2
      expect(executionBreakdown.perTrick).toHaveLength(11);
      expect(executionBreakdown.perTrick[10].isLanding).toBe(true);
      expect(result.isComplete).toBe(true);
    });

    it('adds no landing line to a deduction role without hasLanding, even for a full 10-skill routine', () => {
      const noLandingSlot = { ...FIG_SLOTS[0], hasLanding: false };
      const tricks = new Map();
      for (let n = 1; n <= 10; n++) tricks.set(n, [0, 0, 0, 0, 0, 0]);
      tricks.set(11, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]); // must be ignored, this role has no landing
      const elementScoresByJudgeRoleId = new Map([[1, tricks]]);

      const result = computeAttemptScore([noLandingSlot], new Map(), elementScoresByJudgeRoleId, 10);

      expect(result.breakdown[0].perTrick).toHaveLength(10);
      expect(result.breakdown[0].value).toBeCloseTo(20);
      expect(result.isComplete).toBe(true);
    });

    it('blocks completeness if landing has not been judged by every required judge, for a full routine', () => {
      const tricks = new Map();
      for (let n = 1; n <= 10; n++) tricks.set(n, [0, 0, 0, 0, 0, 0]);
      tricks.set(11, [0, 0]); // only 2 of 6 judges have entered landing
      const elementScoresByJudgeRoleId = new Map([[1, tricks], [2, new Map([[1, [1.0]]])]]);
      const scoresByJudgeRoleId = new Map([[3, [8]], [4, [8]], [5, [0]]]);

      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 10);
      expect(result.isComplete).toBe(false);
      const executionBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'execution');
      expect(executionBreakdown.isComplete).toBe(false);
    });

    it('does not apply landing at all for a shortened routine, even if element 11 data exists (stale from before it was shortened)', () => {
      const tricks = new Map();
      for (let n = 1; n <= 6; n++) tricks.set(n, [0, 0, 0, 0, 0, 0]);
      tricks.set(11, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]); // stale leftover landing data, must be ignored
      const difficultyTricks = new Map();
      for (let n = 1; n <= 6; n++) difficultyTricks.set(n, [1.0]);
      const elementScoresByJudgeRoleId = new Map([[1, tricks], [2, difficultyTricks]]);
      const scoresByJudgeRoleId = new Map([[3, [8]], [4, [8]], [5, [0]]]);

      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 6);
      const executionBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'execution');
      expect(executionBreakdown.value).toBeCloseTo(12); // no deductions, landing ignored
      expect(executionBreakdown.perTrick).toHaveLength(6);
      expect(result.isComplete).toBe(true);
    });
  });

  describe('bonus (non-deduction element roles, e.g. difficulty)', () => {
    it('adds an optional bonus on top of the per-trick sum when present, without affecting completeness', () => {
      const elementScoresByJudgeRoleId = new Map([
        [1, new Map([[1, [0, 0, 0, 0, 0, 0]]])],
        [2, new Map([[1, [2.0]], [11, [0.3]]])], // difficulty: 1 trick worth 2.0, plus a 0.3 bonus
      ]);
      const scoresByJudgeRoleId = new Map([[3, [8]], [4, [8]], [5, [0]]]);

      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 1);
      const difficultyBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'difficulty');
      expect(difficultyBreakdown.value).toBeCloseTo(2.3);
      expect(difficultyBreakdown.isComplete).toBe(true);
    });

    it('defaults to 0 (no effect) when no bonus was entered', () => {
      const elementScoresByJudgeRoleId = new Map([
        [1, new Map([[1, [0, 0, 0, 0, 0, 0]]])],
        [2, new Map([[1, [2.0]]])],
      ]);
      const scoresByJudgeRoleId = new Map([[3, [8]], [4, [8]], [5, [0]]]);

      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 1);
      const difficultyBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'difficulty');
      expect(difficultyBreakdown.value).toBeCloseTo(2.0);
    });
  });

  describe('missing compulsory skill deduction (difficulty judges, element 12)', () => {
    it('subtracts the 2.0-point penalty from the difficulty total when present', () => {
      const elementScoresByJudgeRoleId = new Map([
        [1, new Map([[1, [0, 0, 0, 0, 0, 0]]])],
        [2, new Map([[1, [2.0]], [12, [2.0]]])], // difficulty: 1 trick worth 2.0, penalty applied
      ]);
      const scoresByJudgeRoleId = new Map([[3, [8]], [4, [8]], [5, [0]]]);

      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 1);
      const difficultyBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'difficulty');
      expect(difficultyBreakdown.value).toBeCloseTo(0);
    });

    it('can drive the difficulty value (and the attempt total) negative when the penalty exceeds tricks scored', () => {
      const elementScoresByJudgeRoleId = new Map([
        [1, new Map([[1, [0, 0, 0, 0, 0, 0]]])], // execution: no deductions -> 2 counted judges x 1 - 0 = 2
        [2, new Map([[1, [1.0]], [12, [2.0]]])], // difficulty: 1.0 minus 2.0 penalty -> -1.0
      ]);
      const scoresByJudgeRoleId = new Map([[3, [0]], [4, [0]], [5, [0]]]);

      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 1);
      const difficultyBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'difficulty');
      expect(difficultyBreakdown.value).toBeCloseTo(-1.0);
      expect(result.total).toBeCloseTo(2 - 1.0);
    });

    it('defaults to 0 (no penalty) when the deduction was not entered', () => {
      const elementScoresByJudgeRoleId = new Map([
        [1, new Map([[1, [0, 0, 0, 0, 0, 0]]])],
        [2, new Map([[1, [2.0]]])],
      ]);
      const scoresByJudgeRoleId = new Map([[3, [8]], [4, [8]], [5, [0]]]);

      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 1);
      const difficultyBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'difficulty');
      expect(difficultyBreakdown.value).toBeCloseTo(2.0);
    });
  });

  describe('elementCount 0 (no skills performed at all)', () => {
    it('only requires and counts head_judge; every other role auto-completes with 0 contribution', () => {
      const result = computeAttemptScore(FIG_SLOTS, new Map([[5, [0.4]]]), new Map(), 0);
      expect(result.isComplete).toBe(true);
      expect(result.total).toBeCloseTo(-0.4); // only the head judge's penalty counts
      const executionBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'execution');
      expect(executionBreakdown.value).toBe(0);
      expect(executionBreakdown.perTrick).toHaveLength(0);
      const difficultyBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'difficulty');
      expect(difficultyBreakdown.value).toBe(0);
      const tofBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'time_of_flight');
      expect(tofBreakdown.isComplete).toBe(true);
      expect(tofBreakdown.value).toBe(0);
      const hdBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'horizontal_displacement');
      expect(hdBreakdown.isComplete).toBe(true);
      const headJudgeBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'head_judge');
      expect(headJudgeBreakdown.value).toBeCloseTo(-0.4);
    });

    it('still blocks completeness until head_judge has submitted', () => {
      const result = computeAttemptScore(FIG_SLOTS, new Map(), new Map(), 0);
      expect(result.isComplete).toBe(false);
      const headJudgeBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'head_judge');
      expect(headJudgeBreakdown.isComplete).toBe(false);
    });

    it('ignores stale time_of_flight/horizontal_displacement/difficulty data left over from before the count was set to 0', () => {
      const elementScoresByJudgeRoleId = new Map([
        [2, new Map([[1, [5.0]]])], // stale difficulty trick value
      ]);
      const scoresByJudgeRoleId = new Map([
        [3, [8.5]], // stale time_of_flight
        [4, [9.0]], // stale horizontal_displacement
        [5, [0.2]], // head_judge, the only role that should count
      ]);
      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 0);
      expect(result.total).toBeCloseTo(-0.2);
    });

    it('does not apply bonus at elementCount 0 even if difficulty bonus data exists', () => {
      const elementScoresByJudgeRoleId = new Map([[2, new Map([[11, [0.3]]])]]);
      const result = computeAttemptScore(FIG_SLOTS, new Map([[5, [0]]]), elementScoresByJudgeRoleId, 0);
      const difficultyBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'difficulty');
      expect(difficultyBreakdown.value).toBe(0);
    });
  });

  describe('perJudge (each assignment\'s personal, uncombined value)', () => {
    it('computes each judge\'s personal value for a per_trick (default aggregation) element role', () => {
      const elementScoresByAssignment = new Map([
        [2, new Map([
          [201, new Map([[1, 1.0], [2, 1.5]])], // difficulty judge: 1.0 + 1.5 = 2.5
        ])],
      ]);
      const elementScoresByJudgeRoleId = new Map([[2, new Map([[1, [1.0]], [2, [1.5]]])]]);
      const scoresByJudgeRoleId = new Map([[3, [8]], [4, [8]], [5, [0]]]);

      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 2, elementScoresByAssignment);
      const difficultyBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'difficulty');
      expect(difficultyBreakdown.perJudge).toEqual([{ assignmentId: 201, value: 2.5, submittedCount: 2, isComplete: true }]);
    });

    it('subtracts the missing-skill deduction (element 12) from a judge\'s personal value', () => {
      const elementScoresByAssignment = new Map([
        [2, new Map([[201, new Map([[1, 1.0], [12, 2.0]])]])],
      ]);
      const elementScoresByJudgeRoleId = new Map([[2, new Map([[1, [1.0]]])]]);
      const scoresByJudgeRoleId = new Map([[3, [0]], [4, [0]], [5, [0]]]);

      const result = computeAttemptScore(FIG_SLOTS, scoresByJudgeRoleId, elementScoresByJudgeRoleId, 1, elementScoresByAssignment);
      const difficultyBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'difficulty');
      expect(difficultyBreakdown.perJudge).toEqual([{ assignmentId: 201, value: -1.0, submittedCount: 2, isComplete: true }]);
    });

    it('lists a null value and isComplete false for a judge who has not submitted anything', () => {
      const elementScoresByAssignment = new Map([[2, new Map([[201, new Map()]])]]);
      const result = computeAttemptScore(FIG_SLOTS, new Map(), new Map(), 2, elementScoresByAssignment);
      const difficultyBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'difficulty');
      expect(difficultyBreakdown.perJudge).toEqual([{ assignmentId: 201, value: null, submittedCount: 0, isComplete: false }]);
    });
  });

  describe('per_judge aggregation (local panel execution)', () => {
    const PER_JUDGE_SLOT = {
      judgeRoleId: 1, judgeRoleKey: 'execution', judgeRoleName: 'Execution', granularity: 'element',
      isDeduction: true, hasLanding: true, maxValue: 10, judgeCount: 4, dropHigh: 1, dropLow: 1, combine: 'sum', multiplier: 1,
      aggregation: 'per_judge',
    };

    function judgeElements(trick1Deduction) {
      const m = new Map([[1, trick1Deduction]]);
      for (let n = 2; n <= 10; n++) m.set(n, 0);
      m.set(11, 0);
      return m;
    }

    it('matches the worked example: judges 6.9/6.7/6.8/6.5 -> drop 6.9 and 6.5 -> 13.5', () => {
      const elementScoresByAssignment = new Map([
        [1, new Map([
          [101, judgeElements(3.1)], // 10 - 3.1 = 6.9
          [102, judgeElements(3.3)], // 6.7
          [103, judgeElements(3.2)], // 6.8
          [104, judgeElements(3.5)], // 6.5
        ])],
      ]);
      const result = computeAttemptScore([PER_JUDGE_SLOT], new Map(), new Map(), 10, elementScoresByAssignment);
      const executionBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'execution');
      expect(executionBreakdown.value).toBeCloseTo(13.5);
      expect(executionBreakdown.isComplete).toBe(true);
      expect(executionBreakdown.perJudge.map(pj => pj.value)).toEqual([6.9, 6.7, 6.8, 6.5]);
      expect(executionBreakdown.perJudge.every(pj => pj.isComplete)).toBe(true);
    });

    it('is not complete until judgeCount judges have each submitted every element', () => {
      const elementScoresByAssignment = new Map([
        [1, new Map([
          [101, judgeElements(3.1)],
          [102, new Map([[1, 3.3]])],
        ])],
      ]);
      const result = computeAttemptScore([PER_JUDGE_SLOT], new Map(), new Map(), 10, elementScoresByAssignment);
      const executionBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'execution');
      expect(executionBreakdown.isComplete).toBe(false);
    });

    it('falls back to combining whatever is present when fewer judges than the drop count have submitted', () => {
      const elementScoresByAssignment = new Map([
        [1, new Map([[101, judgeElements(2.0)], [102, judgeElements(3.0)]])],
      ]);
      const result = computeAttemptScore([PER_JUDGE_SLOT], new Map(), new Map(), 10, elementScoresByAssignment);
      const executionBreakdown = result.breakdown.find(b => b.judgeRoleKey === 'execution');
      expect(executionBreakdown.value).toBeCloseTo(8.0 + 7.0);
    });
  });
});

describe('parseAndValidate11thScore', () => {
  const t = (key) => key;
  const landingRole = { isDeduction: 1, hasLanding: 1 };
  const noLandingRole = { isDeduction: 1, hasLanding: 0 };

  it('reads the landing deduction for a role with hasLanding on a full routine', () => {
    expect(parseAndValidate11thScore(landingRole, 10, '0.3', t)).toEqual([11, 0.3]);
  });

  it('requires the landing deduction for a role with hasLanding on a full routine', () => {
    expect(() => parseAndValidate11thScore(landingRole, 10, undefined, t)).toThrow(RangeError);
  });

  it('ignores the 11th value for a deduction role without hasLanding', () => {
    expect(parseAndValidate11thScore(noLandingRole, 10, undefined, t)).toBeNull();
    expect(parseAndValidate11thScore(noLandingRole, 10, '0.3', t)).toBeNull();
  });

  it('ignores the landing for a shortened routine', () => {
    expect(parseAndValidate11thScore(landingRole, 6, '0.3', t)).toBeNull();
  });
});
