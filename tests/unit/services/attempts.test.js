import { describe, it, expect } from 'vitest';
import {
  db, require, makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeAttempt,
  getJudgeRoleIds, makeUser, assignJudge, addScore, addElementScore,
} from './testHelpers.js';
const {
  loadAttemptScoreMaps, loadJudgeSubmissionStatus, recomputeAttemptCompletion,
  createAttempts, getPreviousAttemptIndex,
} = require('../../../src/services/attempts.js');

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

    const status = loadJudgeSubmissionStatus(comp.panelTemplateId, comp.id, attempt.id, 1);
    const execStatus = status.find(s => s.name === 'Execution');
    expect(execStatus.judges[0]).toMatchObject({ name: 'Exec Judge', isDone: true, submittedCount: 1 });

    const diffStatus = status.find(s => s.name === 'Difficulty');
    expect(diffStatus.judges[0]).toMatchObject({ name: 'Diff Judge', isDone: false, submittedCount: 0, value: null });

    const hjStatus = status.find(s => s.name.includes('Head Judge'));
    expect(hjStatus.judges[0]).toMatchObject({ name: 'HJ', isDone: true, submittedCount: 1, value: 0 });
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
    // '0' parses to the falsy number 0, which trips the `|| 2` default before the 1-20 clamp
    // ever sees it — so "0" and an invalid string both fall back to the default of 2, not 1
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

    const { order, previousIndex } = getPreviousAttemptIndex(round.id, a2.id);
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

    const { previousIndex } = getPreviousAttemptIndex(round.id, a1.id);
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

    const { order, previousIndex } = getPreviousAttemptIndex(round.id, null);
    expect(order[previousIndex]).toBe(a2.id);
  });
});
