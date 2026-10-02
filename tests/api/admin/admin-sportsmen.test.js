import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { createApp, loginAdmin, seedCompetitionData, seedReferee, entryExists, db } from '../helpers/createApp.js';

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
        expect(res.text).toContain('Competition not found');
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
        expect(res.text).toContain('Competition not found');
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
        expect(res.text).toContain('Competition not found');
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
        expect(res.text).toContain('Competition not found');
    });

    it('returns 404 for non-existent sportsman', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/sportsmen/99999/edit`);
        expect(res.status).toBe(404);
        expect(res.text).toContain('Sportsman not found');
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

    it('redirects when the file is not a valid XLSX', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen/upload`).attach('file', Buffer.from('Not an XLSX'), 'sportsmen.xlsx').redirects(1);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Invalid file type');
    });

    it('redirects back when no file is uploaded', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen/upload`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/sportsmen`);
    });
});

describe('synchro competitions', () => {
    let synchroId;
    const sportsmenUrl = () => `/admin/competitions/${synchroId}/sportsmen`;
    const pairByName = (name) => db.prepare('SELECT * FROM sportsmen WHERE competition_id=? AND name=?').get(synchroId, name);

    beforeAll(() => {
        synchroId = db.prepare("INSERT INTO competitions (name, type) VALUES ('Synchro Cup', 'synchro')").run().lastInsertRowid;
    });

    it('creates a pair and stores both athletes on one row', async () => {
        const res = await agent.post(sportsmenUrl()).type('form').send({
            name: 'Leon Weber', club: 'TSV', gender: 'm', birth_year: '2008',
            partner_name: 'Emma Fischer', partner_club: 'SV', partner_gender: 'f', partner_birth_year: '2009',
            routine: 'W11',
        });
        expect(res.status).toBe(302);
        expect(pairByName('Leon Weber')).toMatchObject({
            club: 'TSV', gender: 'm', birth_year: 2008, routine: 'W11',
            partner_name: 'Emma Fischer', partner_club: 'SV', partner_gender: 'f', partner_birth_year: 2009,
        });
    });

    it('rejects a pair without a second athlete', async () => {
        const res = await agent.post(sportsmenUrl()).type('form').send({ name: 'Lonely Jumper' });
        expect(res.status).toBe(400);
        expect(res.text).toContain('The name of the second athlete is required.');
        expect(pairByName('Lonely Jumper')).toBeUndefined();
    });

    it('updates both athletes of a pair', async () => {
        const id = pairByName('Leon Weber').id;
        const res = await agent.post(`${sportsmenUrl()}/${id}`).type('form').send({
            name: 'Leon Weber', partner_name: 'Emma Fischer-Meyer', partner_club: 'SV Nord', partner_gender: 'f',
        });
        expect(res.status).toBe(302);
        expect(pairByName('Leon Weber')).toMatchObject({ partner_name: 'Emma Fischer-Meyer', partner_club: 'SV Nord' });
    });

    it('rejects an update that removes the second athlete', async () => {
        const id = pairByName('Leon Weber').id;
        const res = await agent.post(`${sportsmenUrl()}/${id}`).type('form').send({ name: 'Leon Weber', partner_name: '' });
        expect(res.status).toBe(400);
        expect(pairByName('Leon Weber').partner_name).toBe('Emma Fischer-Meyer');
    });

    it('stores an unknown gender as null instead of failing', async () => {
        const res = await agent.post(sportsmenUrl()).type('form').send({
            name: 'Odd Gender', gender: 'x', partner_name: 'Partner', partner_gender: 'y',
        });
        expect(res.status).toBe(302);
        expect(pairByName('Odd Gender')).toMatchObject({ gender: null, partner_gender: null });
    });

    it('round-trips a pair list through upload and export', async () => {
        const headers = ['Name 1', 'Club 1', 'Gender 1', 'Birthyear 1', 'Name 2', 'Club 2', 'Gender 2', 'Birthyear 2', 'Routine', 'Group'];
        const ws = XLSX.utils.aoa_to_sheet([headers, ['Upload A', 'TSV', 'm', 2008, 'Upload B', 'SV', 'f', 2009, 'W11', '']]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sportsmen');
        const upload = await agent.post(`${sportsmenUrl()}/upload`).attach('file', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'pairs.xlsx');
        expect(upload.status).toBe(302);
        expect(pairByName('Upload A')).toMatchObject({ partner_name: 'Upload B', partner_club: 'SV', partner_gender: 'f', partner_birth_year: 2009 });

        const exported = await agent.get(`${sportsmenUrl()}/export`).parse((res, fn) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => fn(null, Buffer.concat(chunks)));
        });
        const sheet = XLSX.read(exported.body, { type: 'buffer' });
        const rows = XLSX.utils.sheet_to_json(sheet.Sheets[sheet.SheetNames[0]]);
        expect(rows.find(r => r['Name 1'] === 'Upload A')).toMatchObject({ 'Name 2': 'Upload B', 'Club 2': 'SV', 'Gender 2': 'f', 'Birthyear 2': 2009 });
    });

    it('ignores partner fields on an individual competition', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/sportsmen`).type('form')
            .send({ name: 'Solo Athlete', partner_name: 'Should Not Be Stored' });
        expect(res.status).toBe(302);
        const solo = db.prepare("SELECT partner_name FROM sportsmen WHERE name='Solo Athlete'").get();
        expect(solo.partner_name).toBeNull();
    });
});
