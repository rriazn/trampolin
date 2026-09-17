import { describe, it, expect, vi } from 'vitest';
import {
  makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeAttempt,
  getJudgeRoleIds, makeUser, assignJudge, addScore, addElementScore, db,
} from './testHelpers.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { loadRound, getRoundSelectionOverview, getRoundOverview, getRefereeRoundInfo } = require('../../../src/services/rounds.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.render = vi.fn().mockReturnValue(res);
  return res;
}

const t = (key) => key;

describe('loadRound', () => {
  it('returns a 404 error handler when the competition does not exist', () => {
    const { error } = loadRound(999999, 1, 1, t);
    const res = mockRes();
    error(res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.render).toHaveBeenCalledWith('errors/404', { message: 'errors:notFound.competition' });
  });

  it('returns a 404 error handler when the group does not exist for that competition', () => {
    const comp = makeCompetition();
    const { error } = loadRound(comp.id, 999999, 1, t);
    const res = mockRes();
    error(res);
    expect(res.render).toHaveBeenCalledWith('errors/404', { message: 'errors:notFound.group' });
  });

  it('returns a 404 error handler when the round does not exist for that group', () => {
    const comp = makeCompetition();
    const group = makeGroup(comp.id);
    const { error } = loadRound(comp.id, group.id, 999999, t);
    const res = mockRes();
    error(res);
    expect(res.render).toHaveBeenCalledWith('errors/404', { message: 'errors:notFound.round' });
  });

  it('returns the round with its group/competition info and panel_template_id when everything exists', () => {
    const comp = makeCompetition({ panelKey: 'local' });
    const group = makeGroup(comp.id, 'Group A');
    const round = makeRound(group.id, { name: 'Finals' });

    const { round: loaded, error } = loadRound(comp.id, group.id, round.id, t);
    expect(error).toBeUndefined();
    expect(loaded.name).toBe('Finals');
    expect(loaded.group_name).toBe('Group A');
    expect(loaded.competition_id).toBe(comp.id);
    expect(loaded.panel_template_id).toBe(comp.panelTemplateId);
  });
});

describe('getRoundSelectionOverview', () => {
  it('shows every active-competition round to an admin, regardless of assignment', () => {
    const comp = makeCompetition({ status: 'active' });
    const group = makeGroup(comp.id);
    makeRound(group.id, { name: 'Unassigned Round' });

    const rounds = getRoundSelectionOverview('admin', 999999);
    expect(rounds.some(r => r.name === 'Unassigned Round')).toBe(true);
  });

  it('only shows a plain user rounds where they hold the head_judge role', () => {
    const comp = makeCompetition({ status: 'active' });
    const group = makeGroup(comp.id);
    makeRound(group.id, { name: 'Not My Round' });
    const roleIds = getJudgeRoleIds();
    const hj = makeUser('head_judge');
    assignJudge(comp.id, roleIds.head_judge, hj.id);

    const roundsForStranger = getRoundSelectionOverview('head_judge', 999999);
    expect(roundsForStranger.some(r => r.name === 'Not My Round')).toBe(false);

    const roundsForAssignedJudge = getRoundSelectionOverview('head_judge', hj.id);
    expect(roundsForAssignedJudge.some(r => r.name === 'Not My Round')).toBe(true);
  });
});

function setupInProgressAttempt(panelKey = 'test', elementCount = 1) {
  const comp = makeCompetition({ panelKey });
  const group = makeGroup(comp.id);
  const sportsman = makeSportsman(comp.id, group.id, 'Athlete One');
  const roundRow = makeRound(group.id, { status: 'in_progress' });
  const entry = makeEntry(roundRow.id, sportsman.id, 1);
  const attempt = makeAttempt(entry.id, 1, elementCount);
  db.prepare('UPDATE rounds SET current_attempt_id=? WHERE id=?').run(attempt.id, roundRow.id);
  const round = db.prepare(`
    SELECT r.*, c.panel_template_id FROM rounds r JOIN groups g ON g.id=r.group_id JOIN competitions c ON c.id=g.competition_id
    WHERE r.id=?
  `).get(roundRow.id);
  round.competition_id = comp.id;
  const roleIds = getJudgeRoleIds();
  return { comp, round, attempt, roleIds };
}

describe('getRoundOverview', () => {
  it('assembles the current attempt, checklist, and the head judge\'s own pending score', () => {
    const { comp, round, attempt, roleIds } = setupInProgressAttempt();
    const hj = makeUser('head_judge');
    const hjAssignment = assignJudge(comp.id, roleIds.head_judge, hj.id);

    const overview = getRoundOverview(round, hj.id, { isReady: true, groups: [] });
    expect(overview.attempt.sportsman_name).toBe('Athlete One');
    expect(overview.headJudgeAssignment.assignment_id).toBe(hjAssignment);
    expect(overview.headJudgeScore).toBeNull();
    expect(overview.attemptIsComplete).toBe(false);
    expect(overview.checklist.length).toBeGreaterThan(0);

    addScore(attempt.id, hjAssignment, roleIds.head_judge, 1.5);
    const overviewAfter = getRoundOverview(round, hj.id, { isReady: true, groups: [] });
    expect(overviewAfter.headJudgeScore).toBe(1.5);
  });

  it('leaves headJudgeAssignment unset for a user with no head judge role here', () => {
    const { round } = setupInProgressAttempt();
    const overview = getRoundOverview(round, 999999, { isReady: true, groups: [] });
    expect(overview.headJudgeAssignment).toBeUndefined();
    expect(overview.headJudgeScore).toBeNull();
  });
});

describe('getRefereeRoundInfo', () => {
  it('builds one input per assignment the user holds, with per-trick elements for element-granularity roles', () => {
    const { comp, round, attempt, roleIds } = setupInProgressAttempt('test', 1);
    const execJudge = makeUser('referee');
    const execAssignment = assignJudge(comp.id, roleIds.execution, execJudge.id);
    addElementScore(attempt.id, execAssignment, roleIds.execution, 1, 0.2);

    const { attempt: returnedAttempt, inputs } = getRefereeRoundInfo(round, execJudge.id);
    expect(returnedAttempt.attempt_id).toBe(attempt.id);
    const execInput = inputs.find(i => i.key === 'execution');
    expect(execInput.elements).toEqual([{ number: 1, value: 0.2, kind: 'trick' }]);
  });

  it('marks an attempt-granularity role as not applicable when no skills were performed', () => {
    // notApplicable only ever applies to attempt-granularity roles (e.g. time_of_flight) — an
    // element-granularity role like execution always builds a (possibly empty) per-trick list instead
    const { comp, round, roleIds } = setupInProgressAttempt('fig', 0);
    const tofJudge = makeUser('referee');
    assignJudge(comp.id, roleIds.time_of_flight, tofJudge.id);

    const { inputs } = getRefereeRoundInfo(round, tofJudge.id);
    const tofInput = inputs.find(i => i.key === 'time_of_flight');
    expect(tofInput.notApplicable).toBe(true);
  });

  it('gives an element-granularity role an empty (not "not applicable") element list at elementCount 0', () => {
    const { comp, round, roleIds } = setupInProgressAttempt('test', 0);
    const execJudge = makeUser('referee');
    assignJudge(comp.id, roleIds.execution, execJudge.id);

    const { inputs } = getRefereeRoundInfo(round, execJudge.id);
    const execInput = inputs.find(i => i.key === 'execution');
    expect(execInput.notApplicable).toBeUndefined();
    expect(execInput.elements).toEqual([]);
  });

  it('returns an empty inputs list for a user with no assignment on this competition', () => {
    const { round } = setupInProgressAttempt();
    const { inputs } = getRefereeRoundInfo(round, 999999);
    expect(inputs).toEqual([]);
  });
});
