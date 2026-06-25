import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, seedLeaderboardData } from './helpers/createApp.js';

const app = createApp();
let competitionId;
let groupId;
let roundId;

beforeAll(() => {
  ({ competitionId, groupId, roundId } = seedLeaderboardData());
});

describe('GET /leaderboard/competitions/:competitionId/groups/:groupId/rounds/:roundId', () => {
  it('returns 200 and renders the round name', async () => {
    const res = await request(app).get(`/leaderboard/competitions/${competitionId}/groups/${groupId}/rounds/${roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Qualifications');
  });

  it('shows empty state when no athletes are scored', async () => {
    const res = await request(app).get(`/leaderboard/competitions/${competitionId}/groups/${groupId}/rounds/${roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('No athletes scored yet');
  });

  it('returns 404 for a non-existent round, group or competition', async () => {
    const res = await request(app).get(`/leaderboard/competitions/999/groups/${groupId}/rounds/${roundId}`);
    expect(res.status).toBe(404);
    expect(res.text).toBe('Competition not found');

    const res2 = await request(app).get(`/leaderboard/competitions/${competitionId}/groups/999/rounds/${roundId}`);
    expect(res2.status).toBe(404);
    expect(res2.text).toBe('Group not found');

    const res3 = await request(app).get(`/leaderboard/competitions/${competitionId}/groups/${groupId}/rounds/999`);
    expect(res3.status).toBe(404);
    expect(res3.text).toBe('Round not found');
  });
});