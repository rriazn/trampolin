import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, loginAdmin, seedCompetitionData, seedReferee, entryExists, getEntryStartOrders } from '../helpers/createApp.js';

const app = createApp();
let agent;
let data;

beforeAll(async () => {
  agent = await loginAdmin(app);
  data = seedCompetitionData();
  seedReferee();
});

describe('GET /admin/competitions/:cid/groups/:gid/rounds/:rid/entries', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        expect(res.status).toBe(403);
    });

    it('returns 200 and renders the entries management page', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Entries');
    });

    it('shows existing entries on the page', async () => {
        const res = await agent.get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Alice');
    });

    it('returns 404 for non-existent competition, group or round', async () => {
        const res = await agent.get(`/admin/competitions/99999/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        expect(res.status).toBe(404);
        expect(res.text).toBe('Competition not found');

        const res2 = await agent.get(`/admin/competitions/${data.competitionId}/groups/99999/rounds/${data.roundId}/entries`);
        expect(res2.status).toBe(404);
        expect(res2.text).toBe('Group not found');

        const res3 = await agent.get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/99999/entries`);
        expect(res3.status).toBe(404);
        expect(res3.text).toBe('Round not found');
    });
});

describe('POST /admin/competitions/:cid/groups/:gid/rounds/:rid/entries', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`).type('form').send({ sportsman_id: data.sportsmanId });
        expect(res.status).toBe(403);
    });

    it('creates a new entry and redirects', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`).type('form').send({ sportsman_id: data.sportsman2Id });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        const listRes = await agent.get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        expect(listRes.text).toContain('Bob');
    });
});

describe('POST /admin/competitions/:cid/groups/:gid/rounds/:rid/entries/:eid/delete', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries/${data.entryId}/delete`);
        expect(res.status).toBe(403);
    });

    it('deletes the entry and redirects', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries/${data.entryId}/delete`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        expect(entryExists(data.entryId)).toBe(false);
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

describe('POST /admin/competitions/:cid/groups/:gid/rounds/:rid/entries/randomize', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries/randomize`);
        expect(res.status).toBe(403);
    });

    it('redirects back to the entries page', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries/randomize`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
    });

    it('reassigns start_order as a consecutive sequence starting at 1', async () => {
        // Alice's entry was deleted by the delete test; re-add her alongside Bob for 2 entries
        await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`).type('form').send({ sportsman_id: data.sportsmanId, start_order: 2 });
        await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries/randomize`);
        const orders = getEntryStartOrders(data.roundId);
        expect(orders).toHaveLength(2);
        expect(orders).toEqual([1, 2]);
    });
});

describe('POST /admin/competitions/:cid/groups/:gid/rounds/:rid/entries/add-all', () => {
    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries/add-all`);
        expect(res.status).toBe(403);
    });

    it('adds all competitors of the group and then redirects', async () => {
        const res = await agent.post(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries/add-all`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        const listRes = await agent.get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/entries`);
        expect(listRes.text).toContain('Alice');
    });
});
