import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, loginReferee, seedCompetitionData } from './helpers/createApp.js';

const app = createApp();
let agent;
let data;

beforeAll(async () => {
  agent = await loginReferee(app);
  data = seedCompetitionData();
});

describe('GET /referee/', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).get('/referee/');
    expect(res.status).toBe(403);
  });

  it('returns 200 and renders the scoring dashboard', async () => {
    const res = await agent.get('/referee/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Scoring Dashboard');
  });

  it('shows active rounds on the dashboard', async () => {
    const res = await agent.get('/referee/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Round A');
  });
});

describe('GET /referee/competitions/:competitionId/groups/:groupId/rounds/:roundId', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).get(`/referee/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent round, group or competition', async () => {
    const res = await agent.get(`/referee/competitions/999/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(404);
    expect(res.text).toBe('Competition not found');

    const res2 = await agent.get(`/referee/competitions/${data.competitionId}/groups/999/rounds/${data.roundId}`);
    expect(res2.status).toBe(404);
    expect(res2.text).toBe('Group not found');

    const res3 = await agent.get(`/referee/competitions/${data.competitionId}/groups/${data.groupId}/rounds/999`);
    expect(res3.status).toBe(404);
    expect(res3.text).toBe('Round not found');
  });

  it('returns 200 and renders the scoring view for a valid round', async () => {
    const res = await agent.get(`/referee/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Round A');
    expect(res.text).toContain('Alice');
  });
});

describe('POST /referee/score', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).post('/referee/score').type('form')
      .send({ attemptId: 1, score: '8' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for a score above 10', async () => {
    const res = await agent.post('/referee/score').type('form')
      .send({ attemptId: data.attemptId, score: '11' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a score below 0', async () => {
    const res = await agent.post('/referee/score').type('form')
      .send({ attemptId: data.attemptId, score: '-1' });
    expect(res.status).toBe(400);
  });

  it('saves a valid score and redirects to the round view', async () => {
    const res = await agent.post('/referee/score').type('form')
      .send({ attemptId: data.attemptId, score: '8.5' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/referee/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);
  });
});
