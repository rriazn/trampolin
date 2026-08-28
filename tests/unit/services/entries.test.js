import { describe, it, expect } from 'vitest';
import {
  db, require, makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeAttempt,
  getJudgeRoleIds, makeUser, assignJudge, addScore,
} from './testHelpers.js';
const { orderAvailableByPreviousRound, randomizeEntryOrder } = require('../../../src/services/entries.js');

function scoreSportsmanInRound(comp, round, roleIds, hjAssignment, sportsman, score) {
  const entry = makeEntry(round.id, sportsman.id, 1);
  const attempt = makeAttempt(entry.id, 1, 1);
  addScore(attempt.id, hjAssignment, roleIds.head_judge, score);
  return { entry, attempt };
}

describe('orderAvailableByPreviousRound', () => {
  it('ranks available athletes by their best score in the previous round, best first', () => {
    const comp = makeCompetition({ panelKey: 'test' });
    const group = makeGroup(comp.id);
    const prevRound = makeRound(group.id, { order: 1 });
    const roleIds = getJudgeRoleIds();
    const hj = makeUser('head_judge');
    const hjAssignment = assignJudge(comp.id, roleIds.head_judge, hj.id);

    const leon = makeSportsman(comp.id, group.id, 'Leon');
    const emma = makeSportsman(comp.id, group.id, 'Emma');
    // head_judge is a penalty (multiplier -1): a raw score of 3 contributes -3 to the total, a
    // raw score of 1 contributes -1 — so Emma's smaller penalty gives her the higher total
    scoreSportsmanInRound(comp, prevRound, roleIds, hjAssignment, leon, 3);
    scoreSportsmanInRound(comp, prevRound, roleIds, hjAssignment, emma, 1);

    const available = [{ id: leon.id, name: 'Leon' }, { id: emma.id, name: 'Emma' }];
    const ranked = orderAvailableByPreviousRound(comp, prevRound, available);

    expect(ranked.map(s => s.name)).toEqual(['Emma', 'Leon']);
    expect(ranked[0].prevRank).toBe(1);
    expect(ranked[1].prevRank).toBe(2);
  });

  it('gives athletes with no score in the previous round a null rank and sorts them last, alphabetically', () => {
    const comp = makeCompetition({ panelKey: 'test' });
    const group = makeGroup(comp.id);
    const prevRound = makeRound(group.id, { order: 1 });
    const roleIds = getJudgeRoleIds();
    const hj = makeUser('head_judge');
    const hjAssignment = assignJudge(comp.id, roleIds.head_judge, hj.id);

    const scored = makeSportsman(comp.id, group.id, 'Scored');
    scoreSportsmanInRound(comp, prevRound, roleIds, hjAssignment, scored, 0);
    const unscoredB = makeSportsman(comp.id, group.id, 'Bob Unscored');
    const unscoredA = makeSportsman(comp.id, group.id, 'Ann Unscored');

    const available = [
      { id: unscoredB.id, name: 'Bob Unscored' },
      { id: scored.id, name: 'Scored' },
      { id: unscoredA.id, name: 'Ann Unscored' },
    ];
    const ranked = orderAvailableByPreviousRound(comp, prevRound, available);

    expect(ranked.map(s => s.name)).toEqual(['Scored', 'Ann Unscored', 'Bob Unscored']);
    expect(ranked[0].prevRank).toBe(1);
    expect(ranked[1].prevRank).toBeNull();
    expect(ranked[2].prevRank).toBeNull();
  });

  it('gives tied scores the same rank', () => {
    const comp = makeCompetition({ panelKey: 'test' });
    const group = makeGroup(comp.id);
    const prevRound = makeRound(group.id, { order: 1 });
    const roleIds = getJudgeRoleIds();
    const hj = makeUser('head_judge');
    const hjAssignment = assignJudge(comp.id, roleIds.head_judge, hj.id);

    const a = makeSportsman(comp.id, group.id, 'A');
    const b = makeSportsman(comp.id, group.id, 'B');
    scoreSportsmanInRound(comp, prevRound, roleIds, hjAssignment, a, -2);
    scoreSportsmanInRound(comp, prevRound, roleIds, hjAssignment, b, -2);

    const available = [{ id: a.id, name: 'A' }, { id: b.id, name: 'B' }];
    const ranked = orderAvailableByPreviousRound(comp, prevRound, available);
    expect(ranked[0].prevRank).toBe(1);
    expect(ranked[1].prevRank).toBe(1);
  });
});

describe('randomizeEntryOrder', () => {
  it('reassigns start_order to a 1..N permutation without changing which entries exist', () => {
    const comp = makeCompetition();
    const group = makeGroup(comp.id);
    const round = makeRound(group.id);
    const sportsmen = ['A', 'B', 'C', 'D', 'E'].map(name => makeSportsman(comp.id, group.id, name));
    const entries = sportsmen.map((sp, i) => makeEntry(round.id, sp.id, i + 1));

    randomizeEntryOrder(round.id);

    const after = db.prepare('SELECT id, start_order FROM entries WHERE round_id=?').all(round.id);
    expect(after.map(e => e.id).sort()).toEqual(entries.map(e => e.id).sort());
    expect(after.map(e => e.start_order).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
  });
});
