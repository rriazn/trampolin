import { describe, it, expect } from 'vitest';
import {
  makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeAttempt,
  getJudgeRoleIds, makeUser, assignJudge, addScore, require,
} from './testHelpers.js';
const { buildLeaderboard } = require('../../../src/services/leaderboard.services.js');

function setupRoundWithHeadJudge(panelKey = 'test') {
  const comp = makeCompetition({ panelKey });
  const group = makeGroup(comp.id);
  const round = makeRound(group.id);
  const roleIds = getJudgeRoleIds();
  const hj = makeUser('head_judge');
  const hjAssignment = assignJudge(comp.id, roleIds.head_judge, hj.id);
  return { comp, group, round, roleIds, hjAssignment };
}

function scoreAttempt(round, group, comp, roleIds, hjAssignment, sportsmanName, attemptScores) {
  const sportsman = makeSportsman(comp.id, group.id, sportsmanName);
  const entry = makeEntry(round.id, sportsman.id, 1);
  attemptScores.forEach((score, i) => {
    const attempt = makeAttempt(entry.id, i + 1, 1);
    if (score !== null) addScore(attempt.id, hjAssignment, roleIds.head_judge, score);
  });
  return sportsman;
}

describe('buildLeaderboard', () => {
  it('ranks athletes by best score descending', () => {
    const { comp, group, round, roleIds, hjAssignment } = setupRoundWithHeadJudge();
    scoreAttempt(round, group, comp, roleIds, hjAssignment, 'Leon', [3]); // contribution -3 (head_judge is a penalty)
    scoreAttempt(round, group, comp, roleIds, hjAssignment, 'Emma', [1]); // contribution -1, better

    const { leaderboard } = buildLeaderboard(comp, round);
    expect(leaderboard.map(r => r.name)).toEqual(['Emma', 'Leon']);
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[1].rank).toBe(2);
  });

  it('gives tied best scores the same rank', () => {
    const { comp, group, round, roleIds, hjAssignment } = setupRoundWithHeadJudge();
    scoreAttempt(round, group, comp, roleIds, hjAssignment, 'A', [2]);
    scoreAttempt(round, group, comp, roleIds, hjAssignment, 'B', [2]);

    const { leaderboard } = buildLeaderboard(comp, round);
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[1].rank).toBe(1);
  });

  it('shows a null best score and a "–" rank for an athlete with no scores yet, sorted after scored athletes', () => {
    const { comp, group, round, roleIds, hjAssignment } = setupRoundWithHeadJudge();
    scoreAttempt(round, group, comp, roleIds, hjAssignment, 'Scored', [1]);
    scoreAttempt(round, group, comp, roleIds, hjAssignment, 'Unscored', [null]);

    const { leaderboard } = buildLeaderboard(comp, round);
    const unscored = leaderboard.find(r => r.name === 'Unscored');
    expect(unscored.bestScore).toBeNull();
    expect(unscored.rank).toBe('–');
    expect(leaderboard[leaderboard.length - 1].name).toBe('Unscored');
  });

  it('reports maxAttempts as the highest attempt count among all athletes', () => {
    const { comp, group, round, roleIds, hjAssignment } = setupRoundWithHeadJudge();
    scoreAttempt(round, group, comp, roleIds, hjAssignment, 'TwoAttempts', [1, 2]);
    scoreAttempt(round, group, comp, roleIds, hjAssignment, 'OneAttempt', [1]);

    const { maxAttempts } = buildLeaderboard(comp, round);
    expect(maxAttempts).toBe(2);
  });

  it('picks the best of multiple attempts, and exposes the second-best for tie-breaking', () => {
    const { comp, group, round, roleIds, hjAssignment } = setupRoundWithHeadJudge();
    scoreAttempt(round, group, comp, roleIds, hjAssignment, 'Improving', [5, 1]); // contributions: -5, -1 → best -1

    const { leaderboard } = buildLeaderboard(comp, round);
    const row = leaderboard.find(r => r.name === 'Improving');
    expect(row.bestScore).toBe(-1);
    expect(row.secondScore).toBe(-5);
  });

  it('returns an empty leaderboard for a round with no entries', () => {
    const { comp, round } = setupRoundWithHeadJudge();
    const { leaderboard, maxAttempts } = buildLeaderboard(comp, round);
    expect(leaderboard).toEqual([]);
    expect(maxAttempts).toBe(0);
  });
});
