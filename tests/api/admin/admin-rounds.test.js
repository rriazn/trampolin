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

describe('GET /admin/competitions/:id/rounds', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get(`/admin/competitions/${data.competitionId}/rounds`);
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the rounds management page', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/rounds`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Rounds');
    });

    it('shows existing rounds on the page', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/rounds`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Round A');
    });

    it('returns 404 for non-existent round', async () => {
        const res = await agent.get(`/admin/competitions/99999/rounds`);
        expect(res.status).toBe(404);
    });
});

describe('POST /admin/competitions/:id/rounds', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/rounds`).type('form').send({ name: 'Round B' });
        expect(res.status).toBe(403);
    });

    it('creates a new round and redirects', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/rounds`).type('form').send({ name: 'Round B' });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/rounds`);
        const listRes = await agent.get(`/admin/competitions/${data.competitionId}/rounds`);
        expect(listRes.text).toContain('Round B');
    });

    it('returns 400 when name is empty', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/rounds`).type('form').send({ name: '' });
        expect(res.status).toBe(400);
        expect(res.text).toContain('Round name is required.');
    });

    it('returns 400 when round order is negative', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/rounds`).type('form').send({ name: 'Round C', round_order: -1 });
        expect(res.status).toBe(400);
        expect(res.text).toContain('Round order must be a non-negative number.');
    });
});

describe('POST /admin/rounds/:id/attempts/bulk', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/rounds/${data.roundId}/attempts/bulk`);
        expect(res.status).toBe(403);
    });

    it('creates attempts 1 and 2 for all entries in the round and redirects', async () => {
        const res = await agent.post(`/admin/rounds/${data.roundId}/attempts/bulk`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/rounds/${data.roundId}/entries`);
        const listRes = await agent.get(`/admin/rounds/${data.roundId}/entries`);
        expect(listRes.text).toContain('2 attempts');
    });
});

describe('POST /admin/rounds/:id/delete', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/rounds/${data.roundId}/delete`);
        expect(res.status).toBe(403);
    });

    it('deletes a round and redirects back to the competition', async () => {
        const res = await agent.post(`/admin/rounds/${data.roundId}/delete`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/rounds`);
    });

    it('returns 404 when round does not exist', async () => {
        const res = await agent.post(`/admin/rounds/99999/delete`);
        expect(res.status).toBe(404);
    });
});
