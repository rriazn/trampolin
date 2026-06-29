import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { createApp, loginAdmin, seedCompetitionData, seedReferee, entryExists } from '../helpers/createApp.js';

const app = createApp();
let agent;
let data;

beforeAll(async () => {
  agent = await loginAdmin(app);
  data = seedCompetitionData();
  seedReferee();
});

describe('GET /admin/competitions/:id/sportsmen', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get(`/admin/competitions/${data.competitionId}/sportsmen`);
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the sportsmen management page', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Athletes');
    });

    it('shows existing sportsmen on the page', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Alice');
    });

    it('returns 404 for non-existent competition', async () => {
        const res = await agent.get(`/admin/competitions/99999/sportsmen`);
        expect(res.status).toBe(404);
        expect(res.text).toBe('Competition not found');
    });
});

describe('GET /admin/competitions/:id/sportsmen/export', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get(`/admin/competitions/${data.competitionId}/sportsmen/export`);
        expect(res.status).toBe(403);
    });

    it('returns 200 and a XLSX file', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen/export`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(res.headers['content-disposition']).toMatch(/attachment; filename="sportsmen-.+\.xlsx"/);
    });

    it('returns a file containing the sportsmen', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen/export`)
            .parse((res, fn) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => fn(null, Buffer.concat(chunks)));
            });
        const wb = XLSX.read(res.body, { type: 'buffer' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        expect(rows.some(row => row.Name === 'Alice')).toBe(true);
    });

    it('returns 404 for non-existent competition', async () => {
        const res = await agent.get(`/admin/competitions/99999/sportsmen/export`);
        expect(res.status).toBe(404);
        expect(res.text).toBe('Competition not found');
    });
});

describe('GET /admin/competitions/:id/sportsmen/new', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get(`/admin/competitions/${data.competitionId}/sportsmen/new`);
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the new sportsman form', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen/new`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('New Athlete');
    });

    it('returns 404 for non-existent competition', async () => {
        const res = await agent.get(`/admin/competitions/99999/sportsmen/new`);
        expect(res.status).toBe(404);
        expect(res.text).toBe('Competition not found');
    });
});

describe('POST /admin/competitions/:id/sportsmen', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/sportsmen`).type('form').send({ name: 'Bob' });
        expect(res.status).toBe(403);
    });

    it('creates a new sportsman and redirects to the list', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen`).type('form').send({ name: 'Bob' });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/sportsmen`);

        const listRes = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen`);
        expect(listRes.text).toContain('Bob');
    });

    it('does not create a sportsman with an empty name', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen`).type('form').send({ name: '' });
        expect(res.status).toBe(400);
    });
});

describe('GET /admin/competitions/:id/sportsmen/:sid/edit', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get(`/admin/competitions/${data.competitionId}/sportsmen/${data.sportsmanId}/edit`);
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the edit form', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen/${data.sportsmanId}/edit`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Edit Athlete');
    });

    it('returns 404 for non-existent competition', async () => {
        const res = await agent.get(`/admin/competitions/99999/sportsmen/${data.sportsmanId}/edit`);
        expect(res.status).toBe(404);
        expect(res.text).toBe('Competition not found');
    });

    it('returns 404 for non-existent sportsman', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen/99999/edit`);
        expect(res.status).toBe(404);
        expect(res.text).toBe('Sportsman not found');
    });
});

describe('POST /admin/competitions/:id/sportsmen/:sid', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/sportsmen/${data.sportsmanId}`).type('form').send({ name: 'Alice Updated' });
        expect(res.status).toBe(403);
    });

    it('updates the sportsman and redirects to the list', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen/${data.sportsmanId}`).type('form').send({ name: 'Alice Updated' });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/sportsmen`);

        const listRes = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen`);
        expect(listRes.text).toContain('Alice Updated');
    });

    it('does not update a sportsman with an empty name', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen/${data.sportsmanId}`).type('form').send({ name: '' });
        expect(res.status).toBe(400);
    });
});

describe('POST /admin/competitions/:id/sportsmen/:sid/delete', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/sportsmen/${data.sportsmanId}/delete`);
        expect(res.status).toBe(403);
    });

    it('deletes the sportsman and their entries (cascade)', async () => {
        expect(entryExists(data.entryId)).toBe(true);

        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen/${data.sportsmanId}/delete`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/sportsmen`);

        expect(entryExists(data.entryId)).toBe(false);
    });

    it('is no longer shown in the list after deletion', async () => {
        const listRes = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen`);
        expect(listRes.text).not.toContain('Alice Updated');
    });
});

describe('POST /admin/competitions/:id/sportsmen/upload', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/sportsmen/upload`).attach('file', Buffer.from(''), 'sportsmen.xlsx');
        expect(res.status).toBe(403);
    });

    it('uploads a XLSX file and creates sportsmen', async () => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([['Name'], ['Charlie'], ['Dave']]);
        XLSX.utils.book_append_sheet(wb, ws, 'Sportsmen');
        const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen/upload`).attach('file', xlsxBuffer, 'sportsmen.xlsx');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/sportsmen`);

        const listRes = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen`);
        expect(listRes.text).toContain('Charlie');
        expect(listRes.text).toContain('Dave');
    });

    it('redirects when the file is not a valid XLSX, treating all rows as skipped', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen/upload`).attach('file', Buffer.from('Not an XLSX'), 'sportsmen.xlsx');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/sportsmen`);
    });

    it('redirects back when no file is uploaded', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen/upload`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/sportsmen`);
    });
});