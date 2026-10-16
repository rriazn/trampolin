import { describe, it, expect } from 'vitest';
import {
  db, require, makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeAttempt,
  getJudgeRoleIds, makeUser, assignJudge, addScore, addElementScore, makeT,
} from './testHelpers.js';
const {
  loadAttemptScoreMaps, loadJudgeSubmissionStatus, recomputeAttemptCompletion,
  createAttempts, getPreviousAttemptIndex, defaultAttemptNameKey, getAttemptNames, getAttemptLabel,
  saveAttemptNames, MAX_ATTEMPT_NAME_LENGTH,
} = require('../../../src/services/attempts.service.js');
const { loadPanelSlots } = require('../../../src/services/panels.service.js');
const { computeAttemptScore } = require('../../../src/services/scoring.service.js');

function setupAttempt(panelKey = 'test', elementCount = 1) {
  const comp = makeCompetition({ panelKey });
  const group = makeGroup(comp.id);
  const round = makeRound(group.id);
  const sportsman = makeSportsman(comp.id, group.id);
  const entry = makeEntry(round.id, sportsman.id, 1);
  const attempt = makeAttempt(entry.id, 1, elementCount);
  const roleIds = getJudgeRoleIds();
  return { comp, round, attempt, roleIds };
}

// loadJudgeSubmissionStatus takes an already-computed breakdown rather than re-querying element_scores itself
function buildBreakdown(comp, attemptId, elementCount) {
  const panelSlots = loadPanelSlots(comp.panelTemplateId);
  const { scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementScoresByAssignment } = loadAttemptScoreMaps(attemptId);
  return computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementCount, elementScoresByAssignment).breakdown;
}

describe('loadAttemptScoreMaps', () => {
  it('separates attempt-granularity scores from element-granularity ones', () => {
    const { comp, attempt, roleIds } = setupAttempt();
    const hj = makeUser('head_judge');
    const hjAssignment = assignJudge(comp.id, roleIds.head_judge, hj.id);
    addScore(attempt.id, hjAssignment, roleIds.head_judge, 2);

    const exec = makeUser('referee');
    const execAssignment = assignJudge(comp.id, roleIds.execution, exec.id);
    addElementScore(attempt.id, execAssignment, roleIds.execution, 1, 0.3);

    const { scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementScoresByAssignment } = loadAttemptScoreMaps(attempt.id);

    expect(scoresByJudgeRoleId.get(roleIds.head_judge)).toEqual([2]);
    expect(scoresByJudgeRoleId.has(roleIds.execution)).toBe(false);
    expect(elementScoresByJudgeRoleId.get(roleIds.execution).get(1)).toEqual([0.3]);
    expect(elementScoresByAssignment.get(roleIds.execution).get(execAssignment).get(1)).toBe(0.3);
  });

  it('returns empty maps for an attempt nobody has scored yet', () => {
    const { attempt } = setupAttempt();
    const { scoresByJudgeRoleId, elementScoresByJudgeRoleId } = loadAttemptScoreMaps(attempt.id);
    expect(scoresByJudgeRoleId.size).toBe(0);
    expect(elementScoresByJudgeRoleId.size).toBe(0);
  });
});

describe('loadJudgeSubmissionStatus', () => {
  it('returns an empty list when there is no panel template', () => {
    expect(loadJudgeSubmissionStatus(null, 1, 1, 1)).toEqual([]);
  });

  it('reports each judge\'s submission progress, grouped by role', () => {
    const { comp, attempt, roleIds } = setupAttempt('test', 1);
    const execJudge = makeUser('referee', 'Exec Judge');
    const execAssignment = assignJudge(comp.id, roleIds.execution, execJudge.id);
    const diffJudge = makeUser('referee', 'Diff Judge');
    assignJudge(comp.id, roleIds.difficulty, diffJudge.id);
    const hjJudge = makeUser('head_judge', 'HJ');
    const hjAssignment = assignJudge(comp.id, roleIds.head_judge, hjJudge.id);

    addElementScore(attempt.id, execAssignment, roleIds.execution, 1, 0.2);
    addScore(attempt.id, hjAssignment, roleIds.head_judge, 0);
    // difficulty judge hasn't submitted anything

    const breakdown = buildBreakdown(comp, attempt.id, 1);
    const status = loadJudgeSubmissionStatus(comp.panelTemplateId, comp.id, attempt.id, breakdown);
    const execStatus = status.find(s => s.name === 'Execution');
    expect(execStatus.judges[0]).toMatchObject({ name: 'Exec Judge', isDone: true, submittedCount: 1 });

    const diffStatus = status.find(s => s.name === 'Difficulty');
    expect(diffStatus.judges[0]).toMatchObject({ name: 'Diff Judge', isDone: false, submittedCount: 0, value: null });

    const hjStatus = status.find(s => s.name.includes('Head Judge'));
    expect(hjStatus.judges[0]).toMatchObject({ name: 'HJ', isDone: true, submittedCount: 1, value: 0 });
  });

  it('includes the missing-skill deduction (element 12) in a difficulty judge\'s displayed value', () => {
    const { comp, attempt, roleIds } = setupAttempt('test', 1);
    const diffAssignment = assignJudge(comp.id, roleIds.difficulty, makeUser('referee', 'Diff Judge').id);
    addElementScore(attempt.id, diffAssignment, roleIds.difficulty, 1, 0); // trick 1: worth 0
    addElementScore(attempt.id, diffAssignment, roleIds.difficulty, 12, 2); // missing-skill penalty

    const breakdown = buildBreakdown(comp, attempt.id, 1);
    const status = loadJudgeSubmissionStatus(comp.panelTemplateId, comp.id, attempt.id, breakdown);
    const diffStatus = status.find(s => s.name === 'Difficulty');
    expect(diffStatus.judges[0].value).toBe(-2);
  });
});

describe('recomputeAttemptCompletion', () => {
  it('marks the attempt scored once every role is complete, and pending otherwise', () => {
    const { comp, attempt, roleIds } = setupAttempt('test', 1);
    const exec = assignJudge(comp.id, roleIds.execution, makeUser('referee').id);
    const diff = assignJudge(comp.id, roleIds.difficulty, makeUser('referee').id);
    const hj = assignJudge(comp.id, roleIds.head_judge, makeUser('head_judge').id);

    let result = recomputeAttemptCompletion(attempt.id, comp.panelTemplateId);
    expect(result.isComplete).toBe(false);
    expect(db.prepare('SELECT status FROM attempts WHERE id=?').get(attempt.id).status).toBe('pending');

    addElementScore(attempt.id, exec, roleIds.execution, 1, 0);
    addElementScore(attempt.id, diff, roleIds.difficulty, 1, 1);
    addScore(attempt.id, hj, roleIds.head_judge, 0);

    result = recomputeAttemptCompletion(attempt.id, comp.panelTemplateId);
    expect(result.isComplete).toBe(true);
    expect(db.prepare('SELECT status FROM attempts WHERE id=?').get(attempt.id).status).toBe('scored');
  });
});

describe('createAttempts', () => {
  it('creates the requested number of attempts for every entry in the round', () => {
    const comp = makeCompetition();
    const group = makeGroup(comp.id);
    const round = makeRound(group.id);
    const sp1 = makeSportsman(comp.id, group.id);
    const sp2 = makeSportsman(comp.id, group.id);
    makeEntry(round.id, sp1.id, 1);
    makeEntry(round.id, sp2.id, 2);

    const count = createAttempts(round.id, '3');
    expect(count).toBe(3);

    const attempts = db.prepare(`
      SELECT a.* FROM attempts a JOIN entries e ON e.id = a.entry_id WHERE e.round_id = ?
    `).all(round.id);
    expect(attempts).toHaveLength(6); // 2 entries × 3 attempts
  });

  it('clamps the count to between 1 and 20', () => {
    const comp = makeCompetition();
    const group = makeGroup(comp.id);
    const round = makeRound(group.id);
    const sp = makeSportsman(comp.id, group.id);
    makeEntry(round.id, sp.id, 1);

    expect(createAttempts(round.id, '999')).toBe(20);
    // '0' parses to the falsy number 0, which trips the `|| 2` default before the 1-20 clamp ever sees it
    expect(createAttempts(round.id, '0')).toBe(2);
    expect(createAttempts(round.id, 'not-a-number')).toBe(2);
  });
});

describe('getPreviousAttemptIndex', () => {
  it('steps back one position from the current attempt', () => {
    const comp = makeCompetition();
    const group = makeGroup(comp.id);
    const round = makeRound(group.id);
    const sp = makeSportsman(comp.id, group.id);
    const entry = makeEntry(round.id, sp.id, 1);
    const a1 = makeAttempt(entry.id, 1);
    const a2 = makeAttempt(entry.id, 2);

    const { order, previousIndex } = getPreviousAttemptIndex([round.id], a2.id);
    expect(order).toEqual([a1.id, a2.id]);
    expect(previousIndex).toBe(0);
  });

  it('is -1 (nothing before it) when already on the first attempt', () => {
    const comp = makeCompetition();
    const group = makeGroup(comp.id);
    const round = makeRound(group.id);
    const sp = makeSportsman(comp.id, group.id);
    const entry = makeEntry(round.id, sp.id, 1);
    const a1 = makeAttempt(entry.id, 1);

    const { previousIndex } = getPreviousAttemptIndex([round.id], a1.id);
    expect(previousIndex).toBe(-1);
  });

  it('points at the last attempt when there is no current attempt (e.g. a completed round)', () => {
    const comp = makeCompetition();
    const group = makeGroup(comp.id);
    const round = makeRound(group.id);
    const sp = makeSportsman(comp.id, group.id);
    const entry = makeEntry(round.id, sp.id, 1);
    makeAttempt(entry.id, 1);
    const a2 = makeAttempt(entry.id, 2);

    const { order, previousIndex } = getPreviousAttemptIndex([round.id], null);
    expect(order[previousIndex]).toBe(a2.id);
  });
});

// stub translator that renders the key and the interpolated values, enough to see what the service asks for
const stubT = (key, opts) => {
  if (key === 'common:attemptName.label') return `${opts.number} | ${opts.name}`;
  return key;
};

function setupRound(scoringMode, counts) {
  const comp = makeCompetition();
  const group = makeGroup(comp.id);
  const round = makeRound(group.id, { scoringMode });
  counts.forEach((count, i) => {
    const entry = makeEntry(round.id, makeSportsman(comp.id, group.id).id, i + 1);
    for (let n = 1; n <= count; n++) makeAttempt(entry.id, n);
  });
  return round;
}

function storedNames(roundId) {
  return db.prepare('SELECT attempt_number, name FROM attempt_names WHERE round_id=? ORDER BY attempt_number').all(roundId);
}

describe('defaultAttemptNameKey', () => {
  it.each([
    ['sum', 1, [1], ['voluntary']],
    ['sum', 2, [1, 2], ['compulsory', 'voluntary']],
    ['sum', 3, [1, 2, 3], ['compulsory', 'voluntary', 'voluntary']],
    ['best_attempt', 2, [1, 2], ['voluntary', 'voluntary']],
    ['best_attempt', 1, [1], ['voluntary']],
  ])('%s with %i attempts', (mode, count, numbers, expected) => {
    expect(numbers.map(n => defaultAttemptNameKey(mode, count, n))).toEqual(expected);
  });
});

describe('getAttemptNames', () => {
  it('returns the translated defaults', () => {
    const round = setupRound('sum', [2]);

    expect(getAttemptNames(round, stubT)).toEqual([
      { number: 1, name: 'common:attemptName.compulsory', label: '1 | common:attemptName.compulsory', isCustom: false, defaultName: 'common:attemptName.compulsory' },
      { number: 2, name: 'common:attemptName.voluntary', label: '2 | common:attemptName.voluntary', isCustom: false, defaultName: 'common:attemptName.voluntary' },
    ]);
  });

  it('uses a stored name instead of the default and still reports the default', () => {
    const round = setupRound('sum', [2]);
    db.prepare("INSERT INTO attempt_names (round_id, attempt_number, name) VALUES (?, 1, 'Warm-up')").run(round.id);

    const [first, second] = getAttemptNames(round, stubT);

    expect(first).toMatchObject({ name: 'Warm-up', label: '1 | Warm-up', isCustom: true, defaultName: 'common:attemptName.compulsory' });
    expect(second.isCustom).toBe(false);
  });

  it('uses the highest attempt number when entries have different counts', () => {
    const round = setupRound('sum', [1, 3]);

    expect(getAttemptNames(round, stubT).map(n => n.number)).toEqual([1, 2, 3]);
  });

  it('returns an empty list when the round has no attempts', () => {
    const round = setupRound('sum', []);

    expect(getAttemptNames(round, stubT)).toEqual([]);
  });

  it('works with the real locale texts', () => {
    const round = setupRound('sum', [2]);

    expect(getAttemptNames(round, makeT('en')).map(n => n.name)).toEqual(['Compulsory routine', 'Voluntary routine']);
  });
});

describe('getAttemptLabel', () => {
  it('returns the label of one attempt', () => {
    const round = setupRound('best_attempt', [2]);
    db.prepare("INSERT INTO attempt_names (round_id, attempt_number, name) VALUES (?, 2, 'Final')").run(round.id);

    expect(getAttemptLabel(round, 2, stubT)).toBe('2 | Final');
    expect(getAttemptLabel(round, 1, stubT)).toBe('1 | common:attemptName.voluntary');
  });

  it('falls back to the voluntary name beyond the known attempts', () => {
    const round = setupRound('sum', [2]);

    expect(getAttemptLabel(round, 5, stubT)).toBe('5 | common:attemptName.voluntary');
  });
});

describe('saveAttemptNames', () => {
  it('stores trimmed names and reports the attempts processed', () => {
    const round = setupRound('sum', [2]);

    const result = saveAttemptNames(round, { name_1: '  Pflicht A  ', name_2: 'Kür B' });

    expect(result).toEqual({ saved: 2 });
    expect(storedNames(round.id)).toEqual([{ attempt_number: 1, name: 'Pflicht A' }, { attempt_number: 2, name: 'Kür B' }]);
  });

  it('removes a stored name when the field is blank or missing', () => {
    const round = setupRound('sum', [2]);
    saveAttemptNames(round, { name_1: 'One', name_2: 'Two' });

    saveAttemptNames(round, { name_1: '   ' });

    expect(storedNames(round.id)).toEqual([]);
  });

  it('updates an existing name', () => {
    const round = setupRound('sum', [1]);
    saveAttemptNames(round, { name_1: 'Old' });

    saveAttemptNames(round, { name_1: 'New' });

    expect(storedNames(round.id)).toEqual([{ attempt_number: 1, name: 'New' }]);
  });

  it('rejects a too long name and stores nothing', () => {
    const round = setupRound('sum', [2]);

    const result = saveAttemptNames(round, { name_1: 'Fine', name_2: 'x'.repeat(MAX_ATTEMPT_NAME_LENGTH + 1) });

    expect(result).toEqual({ error: 'tooLong' });
    expect(storedNames(round.id)).toEqual([]);
  });

  it('accepts a name of exactly the maximum length', () => {
    const round = setupRound('sum', [1]);

    expect(saveAttemptNames(round, { name_1: 'x'.repeat(MAX_ATTEMPT_NAME_LENGTH) })).toEqual({ saved: 1 });
  });

  it('ignores fields beyond the attempt count', () => {
    const round = setupRound('sum', [1]);

    saveAttemptNames(round, { name_1: 'One', name_2: 'Ghost' });

    expect(storedNames(round.id)).toEqual([{ attempt_number: 1, name: 'One' }]);
  });

  it('drops stored names beyond the current attempt count', () => {
    const round = setupRound('sum', [3]);
    saveAttemptNames(round, { name_1: 'One', name_3: 'Three' });
    db.prepare('DELETE FROM attempts WHERE attempt_number = 3').run();

    saveAttemptNames(round, { name_1: 'One' });

    expect(storedNames(round.id)).toEqual([{ attempt_number: 1, name: 'One' }]);
  });

  it('returns an error and stores nothing when the round has no attempts', () => {
    const round = setupRound('sum', []);

    expect(saveAttemptNames(round, { name_1: 'One' })).toEqual({ error: 'noAttempts' });
    expect(storedNames(round.id)).toEqual([]);
  });

  it('turns line breaks and control characters into single spaces', () => {
    const round = setupRound('sum', [1]);

    saveAttemptNames(round, { name_1: 'Warm\n\r\tup\u2028 round' });

    expect(storedNames(round.id)).toEqual([{ attempt_number: 1, name: 'Warm up round' }]);
  });

  it('counts characters instead of UTF-16 units for the length', () => {
    const round = setupRound('sum', [1]);

    expect(saveAttemptNames(round, { name_1: '😀'.repeat(MAX_ATTEMPT_NAME_LENGTH) })).toEqual({ saved: 1 });
    expect(saveAttemptNames(round, { name_1: '😀'.repeat(MAX_ATTEMPT_NAME_LENGTH + 1) })).toEqual({ error: 'tooLong' });
  });
});
