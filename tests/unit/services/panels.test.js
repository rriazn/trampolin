import { describe, it, expect } from 'vitest';
import { makeCompetition, makeUser, getJudgeRoleIds, assignJudge, require } from './testHelpers.js';
const {
  loadPanelSlots, groupPanelSlots, rosterReadiness, resolveAssignmentGroup,
  getJudgesForCompetition, removeJudgeFromRole,
} = require('../../../src/services/panels.service.js');

describe('loadPanelSlots', () => {
  it('returns an empty array when there is no panel template', () => {
    expect(loadPanelSlots(null)).toEqual([]);
    expect(loadPanelSlots(undefined)).toEqual([]);
  });

  it('returns one slot per role, ordered, with scoring config for a real panel', () => {
    const { panelTemplateId } = makeCompetition({ panelKey: 'test' });
    const slots = loadPanelSlots(panelTemplateId);
    expect(slots.map(s => s.judgeRoleKey)).toEqual(['execution', 'difficulty', 'head_judge']);
    expect(slots[0].judgeCount).toBe(1);
    expect(slots[0].isDeduction).toBe(1);
  });
});

describe('groupPanelSlots', () => {
  it('keeps unrelated roles in their own solo group', () => {
    const { panelTemplateId } = makeCompetition({ panelKey: 'test' });
    const groups = groupPanelSlots(panelTemplateId);
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.groupKey)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^solo_/), expect.stringMatching(/^solo_/), expect.stringMatching(/^solo_/)])
    );
  });

  it('groups roles that share a shared_assignment_group into one entry', () => {
    const { panelTemplateId } = makeCompetition({ panelKey: 'fig' });
    const groups = groupPanelSlots(panelTemplateId);
    // fig: execution, difficulty, tof+hd (shared), head_judge → 4 groups, not 5 slots
    expect(groups).toHaveLength(4);
    const shared = groups.find(g => g.groupKey === 'tof_hd');
    expect(shared.judgeRoleIds).toHaveLength(2);
    expect(shared.names).toEqual(['Time of Flight', 'Horizontal Displacement']);
  });

  it('carries the role key through for the head_judge group specifically', () => {
    const { panelTemplateId } = makeCompetition({ panelKey: 'test' });
    const groups = groupPanelSlots(panelTemplateId);
    const headJudgeGroup = groups.find(g => g.roleKey === 'head_judge');
    expect(headJudgeGroup).toBeDefined();
    expect(headJudgeGroup.required).toBe(1);
  });
});

describe('resolveAssignmentGroup', () => {
  it('finds the group a given judge role belongs to', () => {
    const { panelTemplateId } = makeCompetition({ panelKey: 'fig' });
    const roleIds = getJudgeRoleIds();
    const group = resolveAssignmentGroup(panelTemplateId, roleIds.horizontal_displacement);
    expect(group.groupKey).toBe('tof_hd');
    expect(group.judgeRoleIds).toContain(roleIds.time_of_flight);
  });

  it('returns undefined for a role not on this panel', () => {
    const { panelTemplateId } = makeCompetition({ panelKey: 'local' }); // no time_of_flight
    const roleIds = getJudgeRoleIds();
    expect(resolveAssignmentGroup(panelTemplateId, roleIds.time_of_flight)).toBeUndefined();
  });
});

describe('rosterReadiness', () => {
  it('is never ready when the competition has no panel template', () => {
    expect(rosterReadiness(1, null)).toEqual({ isReady: false, groups: [] });
  });

  it('is not ready until every role meets its required judge count', () => {
    const comp = makeCompetition({ panelKey: 'local' }); // execution:4, difficulty:1, head_judge:1
    const readiness = rosterReadiness(comp.id, comp.panelTemplateId);
    expect(readiness.isReady).toBe(false);
    const execGroup = readiness.groups.find(g => g.name === 'Execution');
    expect(execGroup).toEqual({ name: 'Execution', roleKeys: ['execution'], required: 4, assignedCount: 0, isReady: false });
  });

  it('becomes ready once every role is fully staffed', () => {
    const comp = makeCompetition({ panelKey: 'test' }); // execution:1, difficulty:1, head_judge:1
    const roleIds = getJudgeRoleIds();
    assignJudge(comp.id, roleIds.execution, makeUser('referee').id);
    assignJudge(comp.id, roleIds.difficulty, makeUser('referee').id);
    assignJudge(comp.id, roleIds.head_judge, makeUser('head_judge').id);

    const readiness = rosterReadiness(comp.id, comp.panelTemplateId);
    expect(readiness.isReady).toBe(true);
    expect(readiness.groups.every(g => g.isReady)).toBe(true);
  });

  it('only counts a user as covering a shared group once they hold every role in it', () => {
    const comp = makeCompetition({ panelKey: 'fig' });
    const roleIds = getJudgeRoleIds();
    const judge = makeUser('referee');
    assignJudge(comp.id, roleIds.time_of_flight, judge.id);
    // not yet assigned horizontal_displacement — the shared group isn't satisfied

    const readiness = rosterReadiness(comp.id, comp.panelTemplateId);
    const sharedGroup = readiness.groups.find(g => g.name.includes('Time of Flight'));
    expect(sharedGroup.assignedCount).toBe(0);

    assignJudge(comp.id, roleIds.horizontal_displacement, judge.id);
    const readinessAfter = rosterReadiness(comp.id, comp.panelTemplateId);
    const sharedGroupAfter = readinessAfter.groups.find(g => g.name.includes('Time of Flight'));
    expect(sharedGroupAfter.assignedCount).toBe(1);
  });
});

describe('getJudgesForCompetition', () => {
  it('lists assigned judges per role and eligible candidates for the rest', () => {
    const comp = makeCompetition({ panelKey: 'test' });
    const roleIds = getJudgeRoleIds();
    const execJudge = makeUser('referee', 'Exec Judge');
    makeUser('referee', 'Spare Referee'); // left unassigned so it shows up as an available candidate below
    assignJudge(comp.id, roleIds.execution, execJudge.id);

    const { panelTemplate, groups } = getJudgesForCompetition(comp);
    expect(panelTemplate.key).toBe('test');

    const execGroup = groups.find(g => g.name === 'Execution');
    expect(execGroup.assigned).toHaveLength(1);
    expect(execGroup.assigned[0].name).toBe('Exec Judge');

    const diffGroup = groups.find(g => g.name === 'Difficulty');
    const candidateNames = diffGroup.candidates.map(c => c.name);
    expect(candidateNames).toContain('Spare Referee');
    expect(candidateNames).not.toContain('Exec Judge'); // already holds another role in this competition
  });

  it('only offers head_judge-role users as candidates for the head judge slot', () => {
    const comp = makeCompetition({ panelKey: 'test' });
    makeUser('referee', 'Plain Referee');
    makeUser('head_judge', 'Real Head Judge');

    const { groups } = getJudgesForCompetition(comp);
    const headJudgeGroup = groups.find(g => g.name.includes('Head Judge'));
    const candidateNames = headJudgeGroup.candidates.map(c => c.name);
    expect(candidateNames).toContain('Real Head Judge');
    expect(candidateNames).not.toContain('Plain Referee');
  });
});

describe('removeJudgeFromRole', () => {
  it('removes only the single assignment for a solo role', () => {
    const comp = makeCompetition({ panelKey: 'test' });
    const roleIds = getJudgeRoleIds();
    const judge = makeUser('referee');
    const assignmentId = assignJudge(comp.id, roleIds.execution, judge.id);

    removeJudgeFromRole(undefined, assignmentId, comp.id, judge.id);

    const { groups } = getJudgesForCompetition(comp);
    expect(groups.find(g => g.name === 'Execution').assigned).toHaveLength(0);
  });

  it('removes every assignment in a shared group at once', () => {
    const comp = makeCompetition({ panelKey: 'fig' });
    const roleIds = getJudgeRoleIds();
    const judge = makeUser('referee');
    assignJudge(comp.id, roleIds.time_of_flight, judge.id);
    assignJudge(comp.id, roleIds.horizontal_displacement, judge.id);
    const group = resolveAssignmentGroup(comp.panelTemplateId, roleIds.time_of_flight);

    removeJudgeFromRole(group, null, comp.id, judge.id);

    const readiness = rosterReadiness(comp.id, comp.panelTemplateId);
    const sharedGroup = readiness.groups.find(g => g.name.includes('Time of Flight'));
    expect(sharedGroup.assignedCount).toBe(0);
  });
});
