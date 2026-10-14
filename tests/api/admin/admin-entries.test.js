import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, loginAdmin, seedCompetitionData, seedReferee, entryExists, getEntryStartOrders, assignJudge, getUserIdByEmail, db } from '../helpers/createApp.js';
import bcrypt from 'bcryptjs';

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
        expect(res.text).toContain('Competition not found');

        const res2 = await agent.get(`/admin/competitions/${data.competitionId}/groups/99999/rounds/${data.roundId}/entries`);
        expect(res2.status).toBe(404);
        expect(res2.text).toContain('Group not found');

        const res3 = await agent.get(`/admin/competitions/${data.competitionId}/groups/${data.groupId}/rounds/99999/entries`);
        expect(res3.status).toBe(404);
        expect(res3.text).toContain('Round not found');
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

describe('POST attempts/bulk on a started round', () => {
    it('does not create attempts and flashes an error', async () => {
        const round = seedCompetitionData();
        const url = `/admin/competitions/${round.competitionId}/groups/${round.groupId}/rounds/${round.roundId}`;
        db.prepare("UPDATE rounds SET status='in_progress' WHERE id = ?").run(round.roundId);
        const countAttempts = () => db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE entry_id = ?').get(round.entryId).n;
        const before = countAttempts();

        const res = await agent.post(`${url}/attempts/bulk`).type('form').send({ attempt_count: 3 });

        expect(res.status).toBe(302);
        expect(countAttempts()).toBe(before);
        const page = await agent.get(`${url}/entries`);
        expect(page.text).toContain('can only be changed before the round starts');
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

describe('GET .../entries ranks athletes by their real panel-computed score from the previous round', () => {
    let compId, groupId, round2Id;

    beforeAll(() => {
        const panelTemplate = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
        const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)').run('Ranking Cup', 'active', panelTemplate.id);
        compId = comp.lastInsertRowid;
        const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('G', compId, 'RC');
        groupId = group.lastInsertRowid;
        const round1 = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(groupId, 'Qualifications', 1);
        const round2 = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(groupId, 'Finals', 2);
        round2Id = round2.lastInsertRowid;

        const eve = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Eve', compId, groupId);
        const frank = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Frank', compId, groupId);
        const entryEve = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, 1)').run(round1.lastInsertRowid, eve.lastInsertRowid);
        const entryFrank = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, 2)').run(round1.lastInsertRowid, frank.lastInsertRowid);
        const attemptEve = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, 1, 1)').run(entryEve.lastInsertRowid);
        const attemptFrank = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, 1, 1)').run(entryFrank.lastInsertRowid);

        const roleIds = Object.fromEntries(db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id]));
        const hash = bcrypt.hashSync('secret', 10);
        db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run('Ranking Judge', 'rankingjudge@test.com', hash, 'referee');
        const judgeId = getUserIdByEmail('rankingjudge@test.com');
        const assignmentId = assignJudge(compId, roleIds.time_of_flight, judgeId);

        db.prepare('INSERT INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?,?,?,?)')
            .run(attemptEve.lastInsertRowid, assignmentId, roleIds.time_of_flight, 9.0);
        db.prepare('INSERT INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?,?,?,?)')
            .run(attemptFrank.lastInsertRowid, assignmentId, roleIds.time_of_flight, 7.0);
    });

    it('ranks the higher real computed score #1 in the sportsman dropdown', async () => {
        const res = await agent.get(`/admin/competitions/${compId}/groups/${groupId}/rounds/${round2Id}/entries`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('ranked by Qualifications');
        expect(res.text).toMatch(/#1[^<]*·[^<]*Eve/);
        expect(res.text).toMatch(/#2[^<]*·[^<]*Frank/);
    });
});

describe('POST /admin/competitions/:cid/groups/:gid/rounds/:rid/attempts/names', () => {
    let round;
    let url;
    const storedNames = () => db.prepare('SELECT attempt_number, name FROM attempt_names WHERE round_id = ? ORDER BY attempt_number').all(round.roundId);

    beforeAll(() => {
        round = seedCompetitionData();
        db.prepare('INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)').run(round.entryId, 2);
        url = `/admin/competitions/${round.competitionId}/groups/${round.groupId}/rounds/${round.roundId}`;
    });

    it('returns 403 when unauthenticated', async () => {
        const res = await request(app).post(`${url}/attempts/names`).type('form').send({ name_1: 'Warm-up' });
        expect(res.status).toBe(403);
        expect(storedNames()).toEqual([]);
    });

    it('saves custom names, redirects and flashes success', async () => {
        const res = await agent.post(`${url}/attempts/names`).type('form').send({ name_1: ' Warm-up ', name_2: 'Final' });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`${url}/entries`);
        expect(storedNames()).toEqual([{ attempt_number: 1, name: 'Warm-up' }, { attempt_number: 2, name: 'Final' }]);
        const page = await agent.get(`${url}/entries`);
        expect(page.text).toContain('Attempt names saved.');
    });

    it('removes a stored name when the value is blank', async () => {
        const res = await agent.post(`${url}/attempts/names`).type('form').send({ name_1: '', name_2: 'Final' });
        expect(res.status).toBe(302);
        expect(storedNames()).toEqual([{ attempt_number: 2, name: 'Final' }]);
    });

    it('rejects a name longer than 40 characters and keeps the stored names', async () => {
        const res = await agent.post(`${url}/attempts/names`).type('form').send({ name_1: 'x'.repeat(41), name_2: 'Other' });
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`${url}/entries`);
        expect(storedNames()).toEqual([{ attempt_number: 2, name: 'Final' }]);
        const page = await agent.get(`${url}/entries`);
        expect(page.text).toContain('An attempt name can be at most 40 characters long.');
    });

    it('accepts a name of exactly 40 characters', async () => {
        const res = await agent.post(`${url}/attempts/names`).type('form').send({ name_1: 'x'.repeat(40), name_2: '' });
        expect(res.status).toBe(302);
        expect(storedNames()).toEqual([{ attempt_number: 1, name: 'x'.repeat(40) }]);
    });

    it('refuses to change names once the round has started', async () => {
        db.prepare("UPDATE rounds SET status='in_progress' WHERE id = ?").run(round.roundId);
        const before = storedNames();

        const res = await agent.post(`${url}/attempts/names`).type('form').send({ name_1: 'Changed', name_2: 'Changed' });

        db.prepare("UPDATE rounds SET status='not_started' WHERE id = ?").run(round.roundId);
        expect(res.status).toBe(302);
        expect(storedNames()).toEqual(before);
        const page = await agent.get(`${url}/entries`);
        expect(page.text).toContain('can only be changed before the round starts');
    });

    it('returns 404 for an unknown round', async () => {
        const res = await agent.post(`/admin/competitions/${round.competitionId}/groups/${round.groupId}/rounds/99999/attempts/names`).type('form').send({ name_1: 'A' });
        expect(res.status).toBe(404);
        expect(res.text).toContain('Round not found');
    });
});
