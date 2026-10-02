import { describe, it, expect, vi } from 'vitest';
import {
  makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeAttempt,
  getJudgeRoleIds, makeUser, assignJudge, addScore, addElementScore, db,
} from './testHelpers.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { loadRound, getRoundSelectionOverview, getRoundOverview, getRefereeRoundInfo } = require('../../../src/services/rounds.service.js');

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
    // notApplicable only applies to attempt-granularity roles, execution instead builds a possibly-empty per-trick list
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

  it('adds the landing line for a role with hasLanding on a full routine', () => {
    const { comp, round, roleIds } = setupInProgressAttempt('test', 10);
    const execJudge = makeUser('referee');
    assignJudge(comp.id, roleIds.execution, execJudge.id);

    const { inputs } = getRefereeRoundInfo(round, execJudge.id);
    const kinds = inputs.find(i => i.key === 'execution').elements.map(e => e.kind);
    expect(kinds).toEqual([...Array(10).fill('trick'), 'landing']);
  });

  it('gives a synchro execution judge the landing line but a per-skill synchronisation judge only the tricks', () => {
    const { comp, round, roleIds } = setupInProgressAttempt('local_synchro', 10);
    const execJudge = makeUser('referee');
    const syncJudge = makeUser('referee');
    assignJudge(comp.id, roleIds.execution_t1, execJudge.id);
    assignJudge(comp.id, roleIds.synchronisation_skill, syncJudge.id);

    const execKinds = getRefereeRoundInfo(round, execJudge.id).inputs[0].elements.map(e => e.kind);
    const syncKinds = getRefereeRoundInfo(round, syncJudge.id).inputs[0].elements.map(e => e.kind);
    expect(execKinds).toHaveLength(11);
    expect(execKinds[10]).toBe('landing');
    expect(syncKinds).toEqual(Array(10).fill('trick'));
  });

  it('gives the synchronisation device mark a hundredth step and other attempt roles a tenth', () => {
    const { comp, round, roleIds } = setupInProgressAttempt('fig_synchro', 10);
    const deviceJudge = makeUser('referee');
    const headJudge = makeUser('head_judge');
    assignJudge(comp.id, roleIds.synchronisation, deviceJudge.id);
    assignJudge(comp.id, roleIds.head_judge, headJudge.id);

    expect(getRefereeRoundInfo(round, deviceJudge.id).inputs[0].step).toBe(0.01);
    expect(getRefereeRoundInfo(round, headJudge.id).inputs[0].step).toBe(0.1);
  });

  it('limits the synchronisation device mark to the number of valid elements', () => {
    const shortened = setupInProgressAttempt('fig_synchro', 6);
    const full = setupInProgressAttempt('fig_synchro', 10);
    const shortJudge = makeUser('referee');
    const fullJudge = makeUser('referee');
    assignJudge(shortened.comp.id, shortened.roleIds.synchronisation, shortJudge.id);
    assignJudge(full.comp.id, full.roleIds.synchronisation, fullJudge.id);

    expect(getRefereeRoundInfo(shortened.round, shortJudge.id).inputs[0].score_max).toBe(6);
    expect(getRefereeRoundInfo(full.round, fullJudge.id).inputs[0].score_max).toBe(10);
  });

  it('limits the horizontal displacement mark to the number of valid elements on an individual panel too', () => {
    const shortened = setupInProgressAttempt('fig', 6);
    const full = setupInProgressAttempt('fig', 10);
    const shortJudge = makeUser('referee');
    const fullJudge = makeUser('referee');
    assignJudge(shortened.comp.id, shortened.roleIds.horizontal_displacement, shortJudge.id);
    assignJudge(full.comp.id, full.roleIds.horizontal_displacement, fullJudge.id);

    expect(getRefereeRoundInfo(shortened.round, shortJudge.id).inputs[0].score_max).toBe(6);
    expect(getRefereeRoundInfo(full.round, fullJudge.id).inputs[0].score_max).toBe(10);
  });

  it('keeps the time of flight maximum when the routine is shortened', () => {
    const { comp, round, roleIds } = setupInProgressAttempt('fig', 6);
    const tofJudge = makeUser('referee');
    assignJudge(comp.id, roleIds.time_of_flight, tofJudge.id);

    expect(getRefereeRoundInfo(round, tofJudge.id).inputs[0].score_max).toBe(10);
  });

  it('keeps the head judge maximum when the routine is shortened', () => {
    const { comp, round, roleIds } = setupInProgressAttempt('fig_synchro', 6);
    const headJudge = makeUser('head_judge');
    assignJudge(comp.id, roleIds.head_judge, headJudge.id);

    expect(getRefereeRoundInfo(round, headJudge.id).inputs[0].score_max).toBe(10);
  });

  describe("a judge's own value", () => {
    // deductions per trick plus a landing line, entered by one judge
    function enterDeductions(attemptId, assignmentId, roleId, perTrick, landing) {
      for (let n = 1; n <= 10; n++) addElementScore(attemptId, assignmentId, roleId, n, perTrick);
      if (landing !== undefined) addElementScore(attemptId, assignmentId, roleId, 11, landing);
    }

    it('is the judge\'s own execution score, not the trampoline share after the 0.5 multiplier', () => {
      const { comp, round, attempt, roleIds } = setupInProgressAttempt('fig_synchro', 10);
      const judge = makeUser('referee');
      const assignment = assignJudge(comp.id, roleIds.execution_t1, judge.id);
      enterDeductions(attempt.id, assignment, roleIds.execution_t1, 0.1, 0.2);

      const input = getRefereeRoundInfo(round, judge.id).inputs[0];

      expect(input.ownValue.value).toBeCloseTo(10 - 1.2);
    });

    it('ignores what the other judges on the trampoline entered', () => {
      const { comp, round, attempt, roleIds } = setupInProgressAttempt('fig_synchro', 10);
      const judge = makeUser('referee');
      const colleague = makeUser('referee');
      const mine = assignJudge(comp.id, roleIds.execution_t1, judge.id);
      const theirs = assignJudge(comp.id, roleIds.execution_t1, colleague.id);
      enterDeductions(attempt.id, mine, roleIds.execution_t1, 0.1, 0.2);
      enterDeductions(attempt.id, theirs, roleIds.execution_t1, 0.5, 0.5);

      expect(getRefereeRoundInfo(round, judge.id).inputs[0].ownValue.value).toBeCloseTo(10 - 1.2);
      expect(getRefereeRoundInfo(round, colleague.id).inputs[0].ownValue.value).toBeCloseTo(10 - 5.5);
    });

    it('is the single judge\'s score on an individual panel, not the sum over the counted judges', () => {
      const { comp, round, attempt, roleIds } = setupInProgressAttempt('fig', 10);
      const judge = makeUser('referee');
      const assignment = assignJudge(comp.id, roleIds.execution, judge.id);
      enterDeductions(attempt.id, assignment, roleIds.execution, 0.1, 0.2);

      expect(getRefereeRoundInfo(round, judge.id).inputs[0].ownValue.value).toBeCloseTo(10 - 1.2);
    });

    it('is the judge\'s own difficulty total', () => {
      const { comp, round, attempt, roleIds } = setupInProgressAttempt('fig_synchro', 10);
      const judge = makeUser('referee');
      const assignment = assignJudge(comp.id, roleIds.difficulty, judge.id);
      for (let n = 1; n <= 10; n++) addElementScore(attempt.id, assignment, roleIds.difficulty, n, 0.5);

      expect(getRefereeRoundInfo(round, judge.id).inputs[0].ownValue.value).toBeCloseTo(5);
    });

    it('is complete once every line is submitted and partial before that', () => {
      const { comp, round, attempt, roleIds } = setupInProgressAttempt('fig_synchro', 10);
      const judge = makeUser('referee');
      const assignment = assignJudge(comp.id, roleIds.execution_t1, judge.id);
      for (let n = 1; n <= 4; n++) addElementScore(attempt.id, assignment, roleIds.execution_t1, n, 0);

      expect(getRefereeRoundInfo(round, judge.id).inputs[0].ownValue.isComplete).toBe(false);

      for (let n = 5; n <= 11; n++) addElementScore(attempt.id, assignment, roleIds.execution_t1, n, 0);
      expect(getRefereeRoundInfo(round, judge.id).inputs[0].ownValue.isComplete).toBe(true);
    });

    it('is absent until the judge has submitted something', () => {
      const { comp, round, roleIds } = setupInProgressAttempt('fig_synchro', 10);
      const judge = makeUser('referee');
      assignJudge(comp.id, roleIds.execution_t1, judge.id);

      expect(getRefereeRoundInfo(round, judge.id).inputs[0].ownValue).toBeNull();
    });
  });

  it('returns an empty inputs list for a user with no assignment on this competition', () => {
    const { round } = setupInProgressAttempt();
    const { inputs } = getRefereeRoundInfo(round, 999999);
    expect(inputs).toEqual([]);
  });
});
