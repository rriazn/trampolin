import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, seedLeaderboardData } from './helpers/createApp.js';

const app = createApp();
let roundId;

beforeAll(() => {
  ({ roundId } = seedLeaderboardData());
});

describe('GET /leaderboard/:roundId', () => {
  it('returns 200 and renders the round name', async () => {
    const res = await request(app).get(`/leaderboard/${roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Qualifications');
  });

  it('shows empty state when no athletes are scored', async () => {
    const res = await request(app).get(`/leaderboard/${roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('No athletes scored yet');
  });

  it('returns 404 for a non-existent round', async () => {
    const res = await request(app).get('/leaderboard/999999');
    expect(res.status).toBe(404);
    expect(res.text).toBe('Round not found');
  });
});