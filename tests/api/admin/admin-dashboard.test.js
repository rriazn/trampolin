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

describe('GET /admin/', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get('/admin/');
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the admin dashboard', async () => {
        const res = await agent.get('/admin/');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Admin Dashboard');
    });
    
    it('shows active competitions on the dashboard', async () => {
        const res = await agent.get('/admin/');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Active Competition');
    });
});

