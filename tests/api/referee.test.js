import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import {
  createApp, loginReferee, seedRefereeScoringData, assignJudge, startRound, getUserIdByEmail, db,
} from './helpers/createApp.js';

const app = createApp();
let agent;
let refereeId;
let data;

beforeAll(async () => {
  agent = await loginReferee(app);
  refereeId = getUserIdByEmail('ref@test.com');
  data = seedRefereeScoringData();
});

describe('GET /referee/', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).get('/referee/');
    expect(res.status).toBe(403);
  });

  it('returns 200 and renders the scoring dashboard', async () => {
    const res = await agent.get('/referee/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Scoring Dashboard');
  });

  it('does not show a round that is not in_progress, even if assigned', async () => {
    assignJudge(data.competitionId, data.roleIds.difficulty, refereeId);
    const res = await agent.get('/referee/');
    expect(res.text).not.toContain('Round A');
  });

  it('shows a round once it is in_progress and the referee is assigned', async () => {
    startRound(data.roundId, data.attemptId);
    const res = await agent.get('/referee/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Round A');
  });

  it('stops showing the round if its competition is closed, even while in_progress', async () => {
    db.prepare("UPDATE competitions SET status='closed' WHERE id=?").run(data.competitionId);
    const res = await agent.get('/referee/');
    expect(res.text).not.toContain('Round A');
    db.prepare("UPDATE competitions SET status='active' WHERE id=?").run(data.competitionId);
  });

  it('does not show an in_progress round the referee has no assignment for', async () => {
    const otherPanel = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get().id;
    const otherComp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)').run('Unassigned Cup', 'active', otherPanel);
    const otherGroup = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('G', otherComp.lastInsertRowid, 'UG');
    const otherRound = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(otherGroup.lastInsertRowid, 'Unassigned Round', 1);
    db.prepare("UPDATE rounds SET status='in_progress' WHERE id=?").run(otherRound.lastInsertRowid);

    const res = await agent.get('/referee/');
    expect(res.text).not.toContain('Unassigned Round');
  });
});

describe('GET /referee/competitions/:cid/groups/:gid/rounds/:rid', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).get(`/referee/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent round, group or competition', async () => {
    const res = await agent.get(`/referee/competitions/999/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(404);
    expect(res.text).toBe('Competition not found');

    const res2 = await agent.get(`/referee/competitions/${data.competitionId}/groups/999/rounds/${data.roundId}`);
    expect(res2.status).toBe(404);
    expect(res2.text).toBe('Group not found');

    const res3 = await agent.get(`/referee/competitions/${data.competitionId}/groups/${data.groupId}/rounds/999`);
    expect(res3.status).toBe(404);
    expect(res3.text).toBe('Round not found');
  });

  it('shows the current attempt and the assigned role\'s input (round already started and assigned in prior tests)', async () => {
    const res = await agent.get(`/referee/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Alice');
    expect(res.text).toContain('Difficulty');
  });

  it('shows a "not started" state for a round that has not begun', async () => {
    const comp2 = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get().id;
    const compRow = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)').run('Not Started Cup', 'active', comp2);
    const groupRow = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('G', compRow.lastInsertRowid, 'NS');
    const roundRow = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(groupRow.lastInsertRowid, 'Fresh Round', 1);

    const res = await agent.get(`/referee/competitions/${compRow.lastInsertRowid}/groups/${groupRow.lastInsertRowid}/rounds/${roundRow.lastInsertRowid}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Round not started yet');
  });

  it('shows a "no judge role assigned" state for an in_progress round with no assignment', async () => {
    const panelId = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get().id;
    const compRow = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)').run('No Assignment Cup', 'active', panelId);
    const groupRow = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('G', compRow.lastInsertRowid, 'NA');
    const roundRow = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(groupRow.lastInsertRowid, 'No Assignment Round', 1);
    const sp = db.prepare('INSERT INTO sportsmen (name, competition_id) VALUES (?, ?)').run('Bob', compRow.lastInsertRowid);
    const entryRow = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(roundRow.lastInsertRowid, sp.lastInsertRowid, 1);
    const attemptRow = db.prepare('INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)').run(entryRow.lastInsertRowid, 1);
    startRound(roundRow.lastInsertRowid, attemptRow.lastInsertRowid);

    const res = await agent.get(`/referee/competitions/${compRow.lastInsertRowid}/groups/${groupRow.lastInsertRowid}/rounds/${roundRow.lastInsertRowid}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('No judge role assigned');
  });
});

describe('POST /referee/score (attempt-granularity roles)', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).post('/referee/score').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.time_of_flight, score: '8' });
    expect(res.status).toBe(403);
  });

  it('returns 403 when the referee has no assignment for that role', async () => {
    const res = await agent.post('/referee/score').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.head_judge, score: '0.2' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when posting to an element-granularity role', async () => {
    const res = await agent.post('/referee/score').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.difficulty, score: '2.5' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a score above the role max', async () => {
    assignJudge(data.competitionId, data.roleIds.time_of_flight, refereeId);
    const res = await agent.post('/referee/score').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.time_of_flight, score: '11' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a score below the role min', async () => {
    const res = await agent.post('/referee/score').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.time_of_flight, score: '-1' });
    expect(res.status).toBe(400);
  });

  it('saves a valid score and redirects to the round view', async () => {
    const res = await agent.post('/referee/score').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.time_of_flight, score: '8.5' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/referee/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);

    const saved = db.prepare('SELECT score FROM scores WHERE attempt_id=? AND judge_role_id=?').get(data.attemptId, data.roleIds.time_of_flight);
    expect(saved.score).toBe(8.5);
  });

  it('resubmitting overwrites the previous score, not duplicating it', async () => {
    await agent.post('/referee/score').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.time_of_flight, score: '7.0' });
    const rows = db.prepare('SELECT score FROM scores WHERE attempt_id=? AND judge_role_id=?').all(data.attemptId, data.roleIds.time_of_flight);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(7.0);
  });

  it('does not mark the attempt scored while other required roles are still missing', async () => {
    const attempt = db.prepare('SELECT status FROM attempts WHERE id=?').get(data.attemptId);
    expect(attempt.status).toBe('pending');
  });
});

describe('POST /referee/score/elements (element-granularity roles)', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).post('/referee/score/elements').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.difficulty, element_1: '1', element_2: '1', element_3: '1' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when posting to an attempt-granularity role', async () => {
    const res = await agent.post('/referee/score/elements').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.time_of_flight, element_1: '1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a trick value is out of range', async () => {
    const res = await agent.post('/referee/score/elements').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.difficulty, element_1: '1', element_2: '-1', element_3: '1' });
    expect(res.status).toBe(400);
  });

  it('saves all trick values and redirects to the round view', async () => {
    // Difficulty is entered x10 for easier typing (e.g. "10" -> true tariff 1.0) and divided back
    // down server-side.
    const res = await agent.post('/referee/score/elements').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.difficulty, element_1: '10', element_2: '10', element_3: '15' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/referee/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);

    const rows = db.prepare('SELECT element_number, value FROM element_scores WHERE attempt_id=? AND judge_role_id=? ORDER BY element_number')
      .all(data.attemptId, data.roleIds.difficulty);
    expect(rows).toEqual([
      { element_number: 1, value: 1.0 },
      { element_number: 2, value: 1.0 },
      { element_number: 3, value: 1.5 },
    ]);
  });

  it('the round page pre-fills previously saved trick values (x10 display)', async () => {
    const res = await agent.get(`/referee/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('value="10"');
    expect(res.text).toContain('value="15"');
  });

  it('resubmitting overwrites previous trick values, not duplicating rows', async () => {
    await agent.post('/referee/score/elements').type('form')
      .send({ attemptId: data.attemptId, judgeRoleId: data.roleIds.difficulty, element_1: '20', element_2: '20', element_3: '20' });
    const rows = db.prepare('SELECT element_number, value FROM element_scores WHERE attempt_id=? AND judge_role_id=?')
      .all(data.attemptId, data.roleIds.difficulty);
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.value === 2.0)).toBe(true);
  });
});
