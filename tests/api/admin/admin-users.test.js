import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { createApp, loginAdmin, seedCompetitionData, seedReferee } from '../helpers/createApp.js';

const app = createApp();
let agent;

beforeAll(async () => {
  agent = await loginAdmin(app);
  seedCompetitionData();
  seedReferee();
});

describe('GET /admin/users', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get('/admin/users');
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the user management page', async () => {
        const res = await agent.get('/admin/users');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Manage user accounts and access');
    });
    
    it('shows existing users on the page', async () => {
        const res = await agent.get('/admin/users');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Test Referee 2');
    });
});

describe('GET admin/users/export', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get('/admin/users/export');
        expect(res.status).toBe(403);
    });

    it('returns 200 and a XLSX file', async () => {
        const res = await agent.get('/admin/users/export');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(res.headers['content-disposition']).toContain('attachment; filename="referees.xlsx"');
    });
    
    it('returns a file containing the users', async () => {
        const res = await agent.get('/admin/users/export')
            .parse((res, fn) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => fn(null, Buffer.concat(chunks)));
            });
        const wb = XLSX.read(res.body, { type: 'buffer' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        expect(rows.some(row => row.Name === 'Test Referee 2')).toBe(true);
    });
});

describe('GET /admin/users/new', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get('/admin/users/new');
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the new user form', async () => {
        const res = await agent.get('/admin/users/new');
        expect(res.status).toBe(200);
        expect(res.text).toContain('New User');
    });
});

describe('POST /admin/users/', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post('/admin/users/').type('form').send({
            name: 'New User',
            email: 'newuser@example.com',
            password: 'password123',
            role: 'referee'
        });
        expect(res.status).toBe(403);
    });

    it('creates a new user and redirects to the user list', async () => {
        const res = await agent.post('/admin/users/').type('form').send({
            name: 'New User',
            email: 'newuser@example.com',
            password: 'password123',
            role: 'referee'
        });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/users');
    });

    it('returns 400 when required fields are missing', async () => {
        const res = await agent.post('/admin/users/').type('form').send({
            name: '',
            email: '',
            password: '',
            role: ''
        });
        expect(res.status).toBe(400);
        expect(res.text).toContain('are required');
    });

    it('returns 422 when email is already in use', async () => {
        const res = await agent.post('/admin/users/').type('form').send({
            name: 'Duplicate User',
            email: 'ref@test.com',
            password: 'password123',
            role: 'referee'
        });
        expect(res.status).toBe(422);
        expect(res.text).toContain('Email already in use');
    });
});

describe('GET /admin/users/:id/edit', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get('/admin/users/1/edit');
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the edit user form', async () => {
        const res = await agent.get('/admin/users/1/edit');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Edit User');
    });

    it('returns 404 when user does not exist', async () => {
        const res = await agent.get('/admin/users/999/edit');
        expect(res.status).toBe(404);
    });
});

describe('POST /admin/users/:id', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post('/admin/users/1').type('form').send({
            name: 'Updated Name',
            email: 'updated@example.com',
            password: 'updatedpassword123',
            role: 'referee'
        });
        expect(res.status).toBe(403);
    });

    it('updates the user and redirects to the user list', async () => {
        const res = await agent.post('/admin/users/1').type('form').send({
            name: 'Updated Name',
            email: 'updated@example.com',
            password: 'updatedpassword123',
            role: 'referee'
        });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/users');
    });

    it('returns 404 when user does not exist', async () => {
        const res = await agent.post('/admin/users/999').type('form').send({
            name: 'Nonexistent User',
            email: 'nonexistent@example.com',
            password: 'password123',
            role: 'referee'
        });
        expect(res.status).toBe(404);
    });

    it('returns 400 when required fields are missing', async () => {
        const res = await agent.post('/admin/users/1').type('form').send({
            name: '',
            email: '',
            password: '',
            role: ''
        });
        expect(res.status).toBe(400);
        expect(res.text).toContain('are required');
    });

    it('returns 422 when email is already in use by another user', async () => {
        // First, create another user to have a duplicate email
        await agent.post('/admin/users/').type('form').send({
            name: 'Another User',
            email: 'another@example.com',
            password: 'password123',
            role: 'referee'
        });
        const res = await agent.post('/admin/users/1').type('form').send({
            name: 'Updated Name',
            email: 'another@example.com',
            password: 'updatedpassword123',
            role: 'referee'
        });
        expect(res.status).toBe(422);
        expect(res.text).toContain('Email already in use');
    });
});

describe('POST /admin/users/:id/delete', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post('/admin/users/1/delete');
        expect(res.status).toBe(403);
    });

    it('deletes the user and redirects to the user list', async () => {
        // First, create a user to delete
        await agent.post('/admin/users/').type('form').send({
            name: 'User To Delete',
            email: 'delete@example.com',
            password: 'password123',
            role: 'referee'
        });
        const res = await agent.post('/admin/users/1/delete');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/users');
    });
});

describe('POST /admin/users/upload', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post('/admin/users/upload');
        expect(res.status).toBe(403);
    });

    it('uploads a XLSX file and creates users', async () => {
        const workbook = XLSX.utils.book_new();
        const worksheetData = [
            ['Name', 'Email', 'Password', 'Role'],
            ['Uploaded User', 'uploaded@example.com', 'password123', 'referee']
        ];
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const res = await agent.post('/admin/users/upload').attach('file', buffer, 'users.xlsx');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/users');
    });

    it('redirects back when no file is uploaded', async () => {
        const res = await agent.post('/admin/users/upload');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/users');
    });

    it('skips rows with missing required fields', async () => {
        const workbook = XLSX.utils.book_new();
        const worksheetData = [
            ['Name', 'Email', 'Password', 'Role'],
            ['Incomplete User', '', 'password123', 'referee']
        ];
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const res = await agent.post('/admin/users/upload').attach('file', buffer, 'users.xlsx').redirects(1);
        expect(res.status).toBe(200);
        expect(res.text).toContain('1 skipped');
    });
});
