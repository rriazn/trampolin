import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, seedLeaderboardData, loginViewer, loginReferee, loginAdmin } from './helpers/createApp.js';

const app = createApp();
let competitionId, groupId, roundId;

beforeAll(() => {
  ({ competitionId, groupId, roundId } = seedLeaderboardData());
});

describe('GET /viewer', () => {
  it('returns 403 when not logged in', async () => {
    const res = await request(app).get('/viewer');
    expect(res.status).toBe(403);
  });

  it('returns 200 for a viewer and lists the active round', async () => {
    const agent = await loginViewer(app);
    const res = await agent.get('/viewer');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Test Competition');
    expect(res.text).toContain('Qualifications');
  });

  it('also allows referees and admins (not viewer-exclusive)', async () => {
    const refAgent = await loginReferee(app);
    const refRes = await refAgent.get('/viewer');
    expect(refRes.status).toBe(200);

    const adminAgent = await loginAdmin(app);
    const adminRes = await adminAgent.get('/viewer');
    expect(adminRes.status).toBe(200);
  });

  it('the round links to its leaderboard page', async () => {
    const agent = await loginViewer(app);
    const res = await agent.get('/viewer');
    expect(res.text).toContain(`/leaderboard/competitions/${competitionId}/groups/${groupId}/rounds/${roundId}`);
  });
});

describe('POST /login as a viewer', () => {
  it('redirects to /viewer on success', async () => {
    const agent = request.agent(app);
    await loginViewer(app); // ensures the user exists
    const res = await agent.post('/login').type('form').send({ email: 'view@test.com', password: 'view-secret' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/viewer');
  });
});

describe('a viewer is restricted to /viewer and /leaderboard', () => {
  it('cannot access /admin', async () => {
    const agent = await loginViewer(app);
    const res = await agent.get('/admin');
    expect(res.status).toBe(403);
  });

  it('cannot access /referee', async () => {
    const agent = await loginViewer(app);
    const res = await agent.get('/referee');
    expect(res.status).toBe(403);
  });

  it('cannot access /head-judge', async () => {
    const agent = await loginViewer(app);
    const res = await agent.get('/head-judge');
    expect(res.status).toBe(403);
  });

  it('can access a leaderboard directly', async () => {
    const agent = await loginViewer(app);
    const res = await agent.get(`/leaderboard/competitions/${competitionId}/groups/${groupId}/rounds/${roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Qualifications');
  });
});
