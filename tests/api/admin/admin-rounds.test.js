import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, loginAdmin, seedCompetitionData, seedReferee } from '../helpers/createApp.js';

const app = createApp();
let agent;
let data;

beforeAll(async () => {
  agent = await loginAdmin(app);
  data = seedCompetitionData();
  seedReferee();
});

describe('GET /admin/competitions/:cid/groups/:gid/rounds', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds`);
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the rounds management page', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Rounds');
    });

    it('shows existing rounds on the page', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Round A');
    });

    it('returns 404 for non-existent competition or group', async () => {
        const res = await agent.get(`/admin/competitions/99999/groups/${data.groupId}/rounds`);
        expect(res.status).toBe(404);
        expect(res.text).toBe('Competition not found');

        const res2 = await agent.get(`/admin/competitions/${data.competitionId}/groups/99999/rounds`);
        expect(res2.status).toBe(404);
        expect(res2.text).toBe('Group not found');
    });
});

describe('POST /admin/competitions/:cid/groups/:gid/rounds', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds`).type('form').send({ name: 'Round B' });
        expect(res.status).toBe(403);
    });

    it('creates a new round and redirects', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds`).type('form').send({ name: 'Round B' });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds`);
        const listRes = await agent.get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds`);
        expect(listRes.text).toContain('Round B');
    });

    it('returns 400 when name is empty', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds`).type('form').send({ name: '' });
        expect(res.status).toBe(400);
        expect(res.text).toContain('Round name is required.');
    });

    it('returns 400 when round order is negative', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds`).type('form').send({ name: 'Round C', round_order: -1 });
        expect(res.status).toBe(400);
        expect(res.text).toContain('Round order must be a non-negative number.');
    });
});

describe('POST /admin/competitions/:cid/groups/:gid/rounds/:rid/attempts/bulk', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/attempts/bulk`);
        expect(res.status).toBe(403);
    });

    it('creates attempts 1 and 2 for all entries in the round and redirects', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/attempts/bulk`).type('form').send({ attempt_count: 2 });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        const listRes = await agent.get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        expect(listRes.text).toContain('2 attempts');
    });
});

describe('POST /admin/competitions/:cid/groups/:gid/rounds/:rid/delete', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/delete`);
        expect(res.status).toBe(403);
    });

    it('deletes a round and redirects back to the rounds list', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/delete`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds`);
    });
});
