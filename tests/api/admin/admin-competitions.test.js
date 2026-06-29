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

describe('GET /admin/competitions', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get('/admin/competitions');
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the competitions management page', async () => {
        const res = await agent.get('/admin/competitions');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Competitions');
    });

    it('shows existing competitions on the page', async () => {
        const res = await agent.get('/admin/competitions');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Active Competition');
    });
}); 

describe('GET /admin/competitions/new', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get('/admin/competitions/new');
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the new competition form', async () => {
        const res = await agent.get('/admin/competitions/new');
        expect(res.status).toBe(200);
        expect(res.text).toContain('New Competition');
    });
});

describe('POST /admin/competitions', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post('/admin/competitions').type('form').send({ name: 'Test Comp' });
        expect(res.status).toBe(403);
    });

    it('creates a new competition and redirects', async () => {
        const res = await agent.post('/admin/competitions').type('form').send({ name: 'Test Comp 2' });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/competitions');
        const listRes = await agent.get('/admin/competitions');
        expect(listRes.text).toContain('Test Comp 2');
    });

    it('returns 400 when name is empty', async () => {
        const res = await agent.post('/admin/competitions').type('form').send({ name: '' });
        expect(res.status).toBe(400);
        expect(res.text).toContain('Competition name is required.');
    });
});

describe('GET /admin/competitions/:id/edit', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get(`/admin/competitions/${data.competitionId}/edit`);
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the edit form', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/edit`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Edit Competition');
    });

    it('returns 404 when competition does not exist', async () => {
        const res = await agent.get(`/admin/competitions/999/edit`);
        expect(res.status).toBe(404);
    });
});

describe('POST /admin/competitions/:id', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}`).type('form').send({ name: 'Updated Name' });
        expect(res.status).toBe(403);
    });

    it('updates the competition and redirects', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}`).type('form').send({ name: 'Updated Name' });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/competitions');
        const listRes = await agent.get('/admin/competitions');
        expect(listRes.text).toContain('Updated Name');
    });

    it('returns 400 when name is empty', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}`).type('form').send({ name: '' });
        expect(res.status).toBe(400);
        expect(res.text).toContain('Competition name is required.');
    });
});

describe('POST /admin/competitions/:id/status', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/status`).type('form').send({ status: 'closed' });
        expect(res.status).toBe(403);
    });

    it('updates the competition status and redirects', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/status`).type('form').send({ status: 'closed' });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/competitions');
    });

    it('returns 400 when status is invalid', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/status`).type('form').send({ status: 'invalid' });
        expect(res.status).toBe(400);
    });
});

describe('POST /admin/competitions/:id/delete', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/delete`);
        expect(res.status).toBe(403);
    });

    it('deletes the competition and redirects', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/delete`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/competitions');
        const listRes = await agent.get('/admin/competitions');
        expect(listRes.text).not.toContain('Updated Name');
    });
});
