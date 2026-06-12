import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, loginAdmin, seedCompetitionData, seedReferee, entryExists } from '../helpers/createApp.js';

const app = createApp();
let agent;
let data;

beforeAll(async () => {
  agent = await loginAdmin(app);
  data = seedCompetitionData();
  seedReferee();
});

describe('GET /admin/rounds/:id/entries', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get(`/admin/rounds/${data.roundId}/entries`);
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the entries management page', async () => {
        const res = await agent.get(`/admin/rounds/${data.roundId}/entries`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Entries');
    });

    it('shows existing entries on the page', async () => {
        const res = await agent.get(`/admin/rounds/${data.roundId}/entries`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Alice');
    });

    it('returns 404 for non-existent round', async () => {
        const res = await agent.get(`/admin/rounds/99999/entries`);
        expect(res.status).toBe(404);
    });
});

describe('POST /admin/rounds/:id/entries', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/rounds/${data.roundId}/entries`).type('form').send({ sportsman_id: data.sportsmanId });
        expect(res.status).toBe(403);
    });

    it('creates a new entry and redirects', async () => {
        const res = await agent.post(`/admin/rounds/${data.roundId}/entries`).type('form').send({ sportsman_id: data.sportsman2Id });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/rounds/${data.roundId}/entries`);
        const listRes = await agent.get(`/admin/rounds/${data.roundId}/entries`);
        expect(listRes.text).toContain('Bob');
    });
});

describe('POST /admin/entries/:id/delete', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/entries/${data.entryId}/delete`);
        expect(res.status).toBe(403);
    });

    it('deletes the entry and redirects', async () => {
        const res = await agent.post(`/admin/entries/${data.entryId}/delete`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/rounds/${data.roundId}/entries`);
        expect(entryExists(data.entryId)).toBe(false);
    });

    it('returns 404 for non-existent entry', async () => {
        const res = await agent.post(`/admin/entries/99999/delete`);
        expect(res.status).toBe(404);
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
