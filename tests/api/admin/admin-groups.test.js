import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, loginAdmin, seedCompetitionData } from '../helpers/createApp.js';

const app = createApp();
let agent;
let data;

beforeAll(async () => {
  agent = await loginAdmin(app);
  data = seedCompetitionData();
});

describe('GET /admin/competitions/:id/groups', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).get(`/admin/competitions/${data.competitionId}/groups`);
    expect(res.status).toBe(403);
  });

  it('returns 200 and renders the groups management page', async () => {
    const res = await agent.get(`/admin/competitions/${data.competitionId}/groups`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Groups');
  });

  it('shows existing groups on the page', async () => {
    const res = await agent.get(`/admin/competitions/${data.competitionId}/groups`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Test Group A');
  });

  it('returns 404 for non-existent competition', async () => {
    const res = await agent.get(`/admin/competitions/99999/groups`);
    expect(res.status).toBe(404);
    expect(res.text).toBe('Competition not found');
  });
});

describe('POST /admin/competitions/:id/groups', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).post(`/admin/competitions/${data.competitionId}/groups`).type('form').send({ name: 'Group B' });
    expect(res.status).toBe(403);
  });

  it('creates a new group and redirects', async () => {
    const res = await agent.post(`/admin/competitions/${data.competitionId}/groups`).type('form').send({ name: 'Group B' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/groups`);

    const listRes = await agent.get(`/admin/competitions/${data.competitionId}/groups`);
    expect(listRes.text).toContain('Group B');
  });

  it('returns 400 when name is empty', async () => {
    const res = await agent.post(`/admin/competitions/${data.competitionId}/groups`).type('form').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Group name is required.');
  });

  it('returns 404 for non-existent competition', async () => {
    const res = await agent.post(`/admin/competitions/99999/groups`).type('form').send({ name: 'Group X' });
    expect(res.status).toBe(404);
    expect(res.text).toBe('Competition not found');
  });
});

describe('POST /admin/competitions/:id/groups/:gid/delete', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/delete`);
    expect(res.status).toBe(403);
  });

  it('deletes a group and redirects', async () => {
    const res = await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/groups`);

    const listRes = await agent.get(`/admin/competitions/${data.competitionId}/groups`);
    expect(listRes.text).not.toContain('Test Group A');
  });
});
