import { describe, it, expect } from 'vitest';
import {
  makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeAttempt,
  getJudgeRoleIds, makeUser, assignJudge, addScore, require,
} from './testHelpers.js';
const { buildLeaderboard } = require('../../../src/services/leaderboard.service.js');

function setupRoundWithHeadJudge(panelKey = 'test', scoringMode = 'best_attempt') {
  const comp = makeCompetition({ panelKey });
  const group = makeGroup(comp.id);
  const round = makeRound(group.id, { scoringMode });
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
    expect(unscored.total).toBeNull();
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
    expect(row.total).toBe(-1);
    expect(row.secondScore).toBe(-5);
  });

  it('returns an empty leaderboard for a round with no entries', () => {
    const { comp, round } = setupRoundWithHeadJudge();
    const { leaderboard, maxAttempts } = buildLeaderboard(comp, round);
    expect(leaderboard).toEqual([]);
    expect(maxAttempts).toBe(0);
  });

  describe('sum scoring mode', () => {
    it('ranks athletes by the sum of all their attempt scores, not just the best one', () => {
      const { comp, group, round, roleIds, hjAssignment } = setupRoundWithHeadJudge('test', 'sum');
      scoreAttempt(round, group, comp, roleIds, hjAssignment, 'Consistent', [2, 2]); // sum contribution -4
      scoreAttempt(round, group, comp, roleIds, hjAssignment, 'Spiky', [1, 5]); // best attempt is better (-1) but sum is worse (-6)

      const { leaderboard } = buildLeaderboard(comp, round);
      expect(leaderboard.map(r => r.name)).toEqual(['Consistent', 'Spiky']);
      expect(leaderboard[0].total).toBe(-4);
      expect(leaderboard[1].total).toBe(-6);
    });

    // Regression: Array.prototype.reduce(fn, 0) on an empty attempts array used to return 0
    // instead of null, so an unscored athlete in sum mode ranked as if they'd scored a perfect 0.
    it('does not give an unscored athlete a total of 0', () => {
      const { comp, group, round, roleIds, hjAssignment } = setupRoundWithHeadJudge('test', 'sum');
      scoreAttempt(round, group, comp, roleIds, hjAssignment, 'Scored', [2]);
      scoreAttempt(round, group, comp, roleIds, hjAssignment, 'Unscored', [null]);

      const { leaderboard } = buildLeaderboard(comp, round);
      const unscored = leaderboard.find(r => r.name === 'Unscored');
      expect(unscored.total).toBeNull();
      expect(unscored.rank).toBe('–');
      expect(leaderboard[leaderboard.length - 1].name).toBe('Unscored');
    });

    it('gives tied sums the same rank with no secondary tiebreak', () => {
      const { comp, group, round, roleIds, hjAssignment } = setupRoundWithHeadJudge('test', 'sum');
      scoreAttempt(round, group, comp, roleIds, hjAssignment, 'A', [1, 3]); // sum -4
      scoreAttempt(round, group, comp, roleIds, hjAssignment, 'B', [2, 2]); // sum -4, different attempt split

      const { leaderboard } = buildLeaderboard(comp, round);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[1].rank).toBe(1);
    });
  });
});
