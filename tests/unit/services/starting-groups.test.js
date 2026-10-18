import { describe, it, expect } from 'vitest';
import {
  makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeAttempt, makeStartingGroup, db,
} from './testHelpers.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sgCrud = require('../../../src/services/db/starting-groups.crud.js');
const { getOrderedAttemptIdsForRounds, getNextPendingAttemptIdForRounds } = require('../../../src/services/db/entries.crud.js');
const { updateRoundsStartedDB, updateRoundsCurrentAttemptDB, updateRoundsCompletedDB } = require('../../../src/services/db/rounds.crud.js');
const { getRunRounds, getCurrentRound, getStartingGroupInfo, collapseByStartingGroup, checkCanJoin, isMembershipLocked, isGroupStructureLocked } = require('../../../src/services/starting-groups.service.js');

// a group with one round per attempt count given, two athletes each, returns the rounds and attempt ids per round
function makeGroupWithRounds(comp, attemptCounts, { name } = {}) {
  const group = makeGroup(comp.id, name);
  const athletes = [makeSportsman(comp.id, group.id), makeSportsman(comp.id, group.id)];
  const rounds = attemptCounts.map((count, i) => {
    const round = makeRound(group.id, { order: i + 1, name: `R${i + 1}` });
    const attempts = [];
    athletes.forEach((sp, k) => {
      const entry = makeEntry(round.id, sp.id, k + 1);
      for (let n = 1; n <= count; n++) attempts.push({ number: n, order: k + 1, id: makeAttempt(entry.id, n).id });
    });
    return { ...round, attempts };
  });
  return { group, rounds };
}

const groupRow = (id) => db.prepare('SELECT * FROM groups WHERE id=?').get(id);

describe('starting-groups.crud', () => {
  it('lists starting groups of a competition with their groups ordered by position', () => {
    const comp = makeCompetition();
    const a = makeGroup(comp.id, 'A');
    const b = makeGroup(comp.id, 'B');
    const sg = makeStartingGroup(comp.id, [b.id, a.id], 'Block 1');

    const list = sgCrud.getStartingGroupsByCompetition(comp.id);

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(sg.id);
    expect(list[0].name).toBe('Block 1');
    expect(list[0].groups.map((g) => g.name)).toEqual(['B', 'A']);
  });

  it('adds a starting group and rejects a duplicate name in the same competition', () => {
    const comp = makeCompetition();
    sgCrud.addStartingGroupDB(comp.id, ' Block 1 ');
    expect(sgCrud.getStartingGroupsByCompetition(comp.id)[0].name).toBe('Block 1');
    expect(() => sgCrud.addStartingGroupDB(comp.id, 'Block 1')).toThrow();
  });

  it('appends a group at the next position', () => {
    const comp = makeCompetition();
    const a = makeGroup(comp.id);
    const b = makeGroup(comp.id);
    const { lastInsertRowid: sgid } = sgCrud.addStartingGroupDB(comp.id, 'S');

    sgCrud.addGroupToStartingGroupDB(a.id, sgid);
    sgCrud.addGroupToStartingGroupDB(b.id, sgid);

    expect(groupRow(a.id)).toMatchObject({ starting_group_id: sgid, starting_group_position: 1 });
    expect(groupRow(b.id)).toMatchObject({ starting_group_id: sgid, starting_group_position: 2 });
  });

  it('removes a group and closes the gap in the positions', () => {
    const comp = makeCompetition();
    const [a, b, c] = [makeGroup(comp.id), makeGroup(comp.id), makeGroup(comp.id)];
    const sg = makeStartingGroup(comp.id, [a.id, b.id, c.id]);

    sgCrud.removeGroupFromStartingGroupDB(a.id);

    expect(groupRow(a.id)).toMatchObject({ starting_group_id: null, starting_group_position: null });
    expect(groupRow(b.id).starting_group_position).toBe(1);
    expect(groupRow(c.id).starting_group_position).toBe(2);
    expect(groupRow(b.id).starting_group_id).toBe(sg.id);
  });

  it('swaps a group with its neighbour', () => {
    const comp = makeCompetition();
    const [a, b, c] = [makeGroup(comp.id), makeGroup(comp.id), makeGroup(comp.id)];
    makeStartingGroup(comp.id, [a.id, b.id, c.id]);

    expect(sgCrud.moveGroupInStartingGroupDB(c.id, 'up')).toBe(true);
    expect([a, b, c].map((g) => groupRow(g.id).starting_group_position)).toEqual([1, 3, 2]);
  });

  it('does not move the first group up or the last group down', () => {
    const comp = makeCompetition();
    const [a, b] = [makeGroup(comp.id), makeGroup(comp.id)];
    makeStartingGroup(comp.id, [a.id, b.id]);

    expect(sgCrud.moveGroupInStartingGroupDB(a.id, 'up')).toBe(false);
    expect(sgCrud.moveGroupInStartingGroupDB(b.id, 'down')).toBe(false);
    expect([a, b].map((g) => groupRow(g.id).starting_group_position)).toEqual([1, 2]);
  });

  it('deletes a starting group and frees its groups', () => {
    const comp = makeCompetition();
    const [a, b] = [makeGroup(comp.id), makeGroup(comp.id)];
    const sg = makeStartingGroup(comp.id, [a.id, b.id]);

    sgCrud.deleteStartingGroupDB(sg.id, comp.id);

    expect(sgCrud.getStartingGroupById(sg.id)).toBeUndefined();
    expect(groupRow(a.id)).toMatchObject({ starting_group_id: null, starting_group_position: null });
    expect(groupRow(b.id)).toMatchObject({ starting_group_id: null, starting_group_position: null });
  });

  it('deleting a group leaves the others in order', () => {
    const comp = makeCompetition();
    const [a, b] = [makeGroup(comp.id), makeGroup(comp.id)];
    makeStartingGroup(comp.id, [a.id, b.id]);
    db.prepare('DELETE FROM groups WHERE id=?').run(a.id);
    expect(sgCrud.getStartingGroupsByCompetition(comp.id)[0].groups.map((g) => g.id)).toEqual([b.id]);
  });
});

describe('combined attempt order', () => {
  it('runs attempt-major across groups in starting group order, then by start order', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [2]);
    const b = makeGroupWithRounds(comp, [2]);
    // B first in the starting group
    makeStartingGroup(comp.id, [b.group.id, a.group.id]);

    const order = getOrderedAttemptIdsForRounds([a.rounds[0].id, b.rounds[0].id]);

    const label = new Map();
    for (const [tag, g] of [['A', a], ['B', b]]) g.rounds[0].attempts.forEach((x) => label.set(x.id, `${tag}${x.order}-${x.number}`));
    expect(order.map((id) => label.get(id))).toEqual(['B1-1', 'B2-1', 'A1-1', 'A2-1', 'B1-2', 'B2-2', 'A1-2', 'A2-2']);
  });

  it('a single round is ordered by attempt number then start order', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [2]);
    const order = getOrderedAttemptIdsForRounds([a.rounds[0].id]);
    expect(order.map((id) => a.rounds[0].attempts.find((x) => x.id === id)).map((x) => [x.number, x.order]))
      .toEqual([[1, 1], [1, 2], [2, 1], [2, 2]]);
  });

  it('returns the first pending attempt across the rounds and skips scored ones', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1]);
    const b = makeGroupWithRounds(comp, [1]);
    makeStartingGroup(comp.id, [a.group.id, b.group.id]);
    const ids = [a.rounds[0].id, b.rounds[0].id];
    expect(getNextPendingAttemptIdForRounds(ids)).toBe(a.rounds[0].attempts[0].id);

    db.prepare("UPDATE attempts SET status='scored' WHERE id IN (?, ?)").run(a.rounds[0].attempts[0].id, a.rounds[0].attempts[1].id);
    expect(getNextPendingAttemptIdForRounds(ids)).toBe(b.rounds[0].attempts[0].id);
  });

  it('returns null when nothing is pending', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1]);
    db.prepare("UPDATE attempts SET status='skipped'").run();
    expect(getNextPendingAttemptIdForRounds([a.rounds[0].id])).toBeNull();
  });
});

describe('updating several rounds', () => {
  it('starts, advances and completes all rounds together', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1]);
    const b = makeGroupWithRounds(comp, [1]);
    const ids = [a.rounds[0].id, b.rounds[0].id];
    const rows = () => ids.map((id) => db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(id));

    updateRoundsStartedDB(ids, 11);
    expect(rows()).toEqual([{ status: 'in_progress', current_attempt_id: 11 }, { status: 'in_progress', current_attempt_id: 11 }]);

    updateRoundsCurrentAttemptDB(ids, 12);
    expect(rows().map((r) => r.current_attempt_id)).toEqual([12, 12]);

    updateRoundsCompletedDB(ids);
    expect(rows()).toEqual([{ status: 'completed', current_attempt_id: null }, { status: 'completed', current_attempt_id: null }]);
  });
});

describe('getRunRounds', () => {
  it('returns just the round for a group without a starting group', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1]);
    expect(getRunRounds(a.rounds[0]).map((r) => r.id)).toEqual([a.rounds[0].id]);
  });

  it('pairs rounds by position across the groups in starting group order', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1, 2]);
    const b = makeGroupWithRounds(comp, [1, 2]);
    makeStartingGroup(comp.id, [b.group.id, a.group.id]);

    expect(getRunRounds(a.rounds[0]).map((r) => r.id)).toEqual([b.rounds[0].id, a.rounds[0].id]);
    expect(getRunRounds(b.rounds[1]).map((r) => r.id)).toEqual([b.rounds[1].id, a.rounds[1].id]);
  });
});

describe('checkCanJoin', () => {
  const KEY = 'admin:startingGroups.errors.';

  function setup(memberCounts = [[1]], candidateCounts = [1]) {
    const comp = makeCompetition();
    const members = memberCounts.map((c) => makeGroupWithRounds(comp, c));
    const sg = makeStartingGroup(comp.id, members.map((m) => m.group.id));
    const candidate = makeGroupWithRounds(comp, candidateCounts);
    return { comp, members, sg: sgCrud.getStartingGroupById(sg.id), candidate };
  }

  it('allows a matching group', () => {
    const { sg, candidate } = setup();
    expect(checkCanJoin(groupRow(candidate.group.id), sg)).toBeNull();
  });

  it('allows the first group into an empty starting group', () => {
    const comp = makeCompetition();
    const sg = sgCrud.addStartingGroupDB(comp.id, 'Empty');
    const candidate = makeGroupWithRounds(comp, [3]);
    expect(checkCanJoin(groupRow(candidate.group.id), sgCrud.getStartingGroupById(sg.lastInsertRowid))).toBeNull();
  });

  it('refuses a group without rounds', () => {
    const { sg, comp } = setup();
    const empty = makeGroup(comp.id);
    expect(checkCanJoin(groupRow(empty.id), sg)).toBe(KEY + 'noRounds');
  });

  it('refuses a group with a round that has no attempts', () => {
    const { sg, comp } = setup();
    const group = makeGroup(comp.id);
    makeRound(group.id);
    expect(checkCanJoin(groupRow(group.id), sg)).toBe(KEY + 'noAttempts');
  });

  it('refuses a different number of rounds', () => {
    const { sg, candidate } = setup([[1, 1]], [1]);
    expect(checkCanJoin(groupRow(candidate.group.id), sg)).toBe(KEY + 'notMatching');
  });

  it('refuses a different attempt count at the same position', () => {
    const { sg, candidate } = setup([[1, 2]], [1, 1]);
    expect(checkCanJoin(groupRow(candidate.group.id), sg)).toBe(KEY + 'notMatching');
  });

  it('refuses rounds with other names at the same position', () => {
    const { sg, candidate } = setup();
    db.prepare("UPDATE rounds SET name='Final' WHERE id=?").run(candidate.rounds[0].id);
    expect(checkCanJoin(groupRow(candidate.group.id), sg)).toBe(KEY + 'roundNames');
  });

  it('refuses a group where an athlete has fewer attempts than the round', () => {
    const { sg, comp } = setup();
    const candidate = makeGroupWithRounds(comp, [2]);
    const late = makeSportsman(comp.id, candidate.group.id);
    const entry = makeEntry(candidate.rounds[0].id, late.id, 3);
    makeAttempt(entry.id, 1);
    expect(checkCanJoin(groupRow(candidate.group.id), sg)).toBe(KEY + 'incompleteAttempts');
  });

  it('refuses paired rounds with a different status', () => {
    const { sg, candidate } = setup();
    db.prepare("UPDATE rounds SET status='completed' WHERE id=?").run(candidate.rounds[0].id);
    expect(checkCanJoin(groupRow(candidate.group.id), sg)).toBe(KEY + 'statusMismatch');
  });

  it('refuses while a round of the starting group is in progress', () => {
    const { sg, members, candidate } = setup();
    db.prepare("UPDATE rounds SET status='in_progress' WHERE id=?").run(members[0].rounds[0].id);
    expect(checkCanJoin(groupRow(candidate.group.id), sg)).toBe(KEY + 'inProgress');
  });

  it('refuses a group with a round in progress', () => {
    const { sg, candidate } = setup();
    db.prepare("UPDATE rounds SET status='in_progress' WHERE id=?").run(candidate.rounds[0].id);
    expect(checkCanJoin(groupRow(candidate.group.id), sg)).toBe(KEY + 'inProgress');
  });

  it('refuses a group that is already in a starting group', () => {
    const { sg, members } = setup();
    expect(checkCanJoin(groupRow(members[0].group.id), sg)).toBe(KEY + 'alreadyGrouped');
  });

  it('refuses a group of another competition', () => {
    const { sg } = setup();
    const other = makeGroupWithRounds(makeCompetition(), [1]);
    expect(checkCanJoin(groupRow(other.group.id), sg)).toBe(KEY + 'otherCompetition');
  });
});

describe('locks', () => {
  it('locks the membership while a member round is in progress', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1]);
    const sg = makeStartingGroup(comp.id, [a.group.id]);
    expect(isMembershipLocked(sg)).toBe(false);
    db.prepare("UPDATE rounds SET status='in_progress' WHERE id=?").run(a.rounds[0].id);
    expect(isMembershipLocked(sg)).toBe(true);
  });

  it('locks the structure of a grouped group only', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1]);
    const b = makeGroupWithRounds(comp, [1]);
    makeStartingGroup(comp.id, [a.group.id]);
    expect(isGroupStructureLocked(a.group.id)).toBe(true);
    expect(isGroupStructureLocked(b.group.id)).toBe(false);
  });
});

describe('getCurrentRound', () => {
  it('returns the round itself for a round that runs alone', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1]);
    expect(getCurrentRound(a.rounds[0]).id).toBe(a.rounds[0].id);
  });

  it('returns the round that owns the current attempt, with its group info', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1], { name: 'Alpha' });
    const b = makeGroupWithRounds(comp, [1], { name: 'Beta' });
    makeStartingGroup(comp.id, [a.group.id, b.group.id]);
    updateRoundsStartedDB([a.rounds[0].id, b.rounds[0].id], b.rounds[0].attempts[0].id);

    const current = getCurrentRound(a.rounds[0]);

    expect(current).toMatchObject({ id: b.rounds[0].id, group_id: b.group.id, group_name: 'Beta', competition_id: comp.id });
  });

  it('reads the current state again instead of trusting the passed round', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1]);
    const b = makeGroupWithRounds(comp, [1]);
    makeStartingGroup(comp.id, [a.group.id, b.group.id]);
    const stale = a.rounds[0];
    updateRoundsStartedDB([a.rounds[0].id, b.rounds[0].id], b.rounds[0].attempts[0].id);

    expect(getCurrentRound(stale).id).toBe(b.rounds[0].id);
  });
});

describe('getStartingGroupInfo', () => {
  it('is null for a round that runs alone', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1]);
    expect(getStartingGroupInfo(a.rounds[0])).toBeNull();
  });

  it('names the starting group and its groups in order', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1], { name: 'Alpha' });
    const b = makeGroupWithRounds(comp, [1], { name: 'Beta' });
    makeStartingGroup(comp.id, [b.group.id, a.group.id], 'Block 9');

    const info = getStartingGroupInfo(a.rounds[0]);

    expect(info.name).toBe('Block 9');
    expect(info.groups.map((g) => g.name)).toEqual(['Beta', 'Alpha']);
  });
});

describe('collapseByStartingGroup', () => {
  const row = (g, r) => ({ id: r.id, name: r.name, group_id: g.group.id, group_name: `G${g.group.id}`, status: r.status });

  it('keeps rounds of ungrouped groups and merges the paired rounds of a starting group', () => {
    const comp = makeCompetition();
    const alone = makeGroupWithRounds(comp, [1]);
    const a = makeGroupWithRounds(comp, [1, 1], { name: 'Alpha' });
    const b = makeGroupWithRounds(comp, [1, 1], { name: 'Beta' });
    makeStartingGroup(comp.id, [a.group.id, b.group.id], 'Block 3');
    const rows = [row(alone, alone.rounds[0]), row(a, a.rounds[0]), row(a, a.rounds[1]), row(b, b.rounds[0]), row(b, b.rounds[1])];

    const collapsed = collapseByStartingGroup(rows);

    expect(collapsed.map((r) => r.id)).toEqual([alone.rounds[0].id, a.rounds[0].id, a.rounds[1].id]);
    expect(collapsed[0].startingGroupName).toBeUndefined();
    expect(collapsed[1]).toMatchObject({ startingGroupName: 'Block 3', memberGroupNames: ['Alpha', 'Beta'] });
    expect(collapsed[2].memberGroupNames).toEqual(['Alpha', 'Beta']);
  });

  it('links to the member that comes first in the starting group even when it is listed later', () => {
    const comp = makeCompetition();
    const a = makeGroupWithRounds(comp, [1], { name: 'Alpha' });
    const b = makeGroupWithRounds(comp, [1], { name: 'Beta' });
    makeStartingGroup(comp.id, [b.group.id, a.group.id]);

    const [only] = collapseByStartingGroup([row(a, a.rounds[0]), row(b, b.rounds[0])]);

    expect(only).toMatchObject({ id: b.rounds[0].id, group_id: b.group.id });
    expect(only.memberGroupNames).toEqual(['Beta', 'Alpha']);
  });
});
