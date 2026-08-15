import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, loginAdmin, seedJudgesData, db } from '../helpers/createApp.js';

const app = createApp();
let agent;
let data;

beforeAll(async () => {
  agent = await loginAdmin(app);
  data = seedJudgesData();
});

describe('GET /admin/competitions/:id/judges', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).get(`/admin/competitions/${data.competitionId}/judges`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent competition', async () => {
    const res = await agent.get('/admin/competitions/999999/judges');
    expect(res.status).toBe(404);
  });

  it('returns 200 for a competition with a panel template', async () => {
    const res = await agent.get(`/admin/competitions/${data.competitionId}/judges`);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a competition with no panel template selected', async () => {
    const comp = db.prepare('INSERT INTO competitions (name, status) VALUES (?, ?)').run('No Panel Cup', 'planned');
    const res = await agent.get(`/admin/competitions/${comp.lastInsertRowid}/judges`);
    expect(res.status).toBe(200);
  });
});

describe('POST /admin/competitions/:id/judges (assign)', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).post(`/admin/competitions/${data.competitionId}/judges`).type('form')
      .send({ judge_role_id: data.roleIds.difficulty, user_id: data.referee1Id });
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent competition', async () => {
    const res = await agent.post('/admin/competitions/999999/judges').type('form')
      .send({ judge_role_id: data.roleIds.difficulty, user_id: data.referee1Id });
    expect(res.status).toBe(404);
  });

  it('assigns a referee to a solo role and redirects with the role anchor', async () => {
    const res = await agent.post(`/admin/competitions/${data.competitionId}/judges`).type('form')
      .send({ judge_role_id: data.roleIds.difficulty, user_id: data.referee1Id });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(`/admin/competitions/${data.competitionId}/judges#role-`);

    const assignment = db.prepare('SELECT * FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.difficulty, data.referee1Id);
    expect(assignment).toBeTruthy();
  });

  it('rejects a duplicate assignment of the same user to the same role', async () => {
    const res = await agent.post(`/admin/competitions/${data.competitionId}/judges`).type('form')
      .send({ judge_role_id: data.roleIds.difficulty, user_id: data.referee1Id });
    expect(res.status).toBe(302);
    const count = db.prepare('SELECT COUNT(*) AS n FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.difficulty, data.referee1Id).n;
    expect(count).toBe(1);
  });

  it('rejects assigning a second person once a role is fully staffed', async () => {
    // difficulty requires only 1 judge and is already filled by referee1
    const res = await agent.post(`/admin/competitions/${data.competitionId}/judges`).type('form')
      .send({ judge_role_id: data.roleIds.difficulty, user_id: data.referee2Id });
    expect(res.status).toBe(302);
    const assignment = db.prepare('SELECT * FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.difficulty, data.referee2Id);
    expect(assignment).toBeUndefined();
  });

  it('rejects assigning a user already holding a different role in the same competition', async () => {
    // referee1 already holds difficulty; attempt to also assign them to time_of_flight fails
    const res = await agent.post(`/admin/competitions/${data.competitionId}/judges`).type('form')
      .send({ judge_role_id: data.roleIds.time_of_flight, user_id: data.referee1Id });
    expect(res.status).toBe(302);
    const assignment = db.prepare('SELECT * FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.time_of_flight, data.referee1Id);
    expect(assignment).toBeUndefined();
  });

  it('assigning to time_of_flight also creates the paired horizontal_displacement assignment', async () => {
    const res = await agent.post(`/admin/competitions/${data.competitionId}/judges`).type('form')
      .send({ judge_role_id: data.roleIds.time_of_flight, user_id: data.referee2Id });
    expect(res.status).toBe(302);

    const tof = db.prepare('SELECT * FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.time_of_flight, data.referee2Id);
    const hd = db.prepare('SELECT * FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.horizontal_displacement, data.referee2Id);
    expect(tof).toBeTruthy();
    expect(hd).toBeTruthy();
  });

  it('assigns the head_judge role', async () => {
    const res = await agent.post(`/admin/competitions/${data.competitionId}/judges`).type('form')
      .send({ judge_role_id: data.roleIds.head_judge, user_id: data.headJudgeId });
    expect(res.status).toBe(302);
    const assignment = db.prepare('SELECT * FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.head_judge, data.headJudgeId);
    expect(assignment).toBeTruthy();
  });
});

describe('POST /admin/competitions/:id/judges/:assignmentId/delete (unassign)', () => {
  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).post(`/admin/competitions/${data.competitionId}/judges/999999/delete`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent competition', async () => {
    const res = await agent.post(`/admin/competitions/999999/judges/999999/delete`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent assignment', async () => {
    const res = await agent.post(`/admin/competitions/${data.competitionId}/judges/999999/delete`);
    expect(res.status).toBe(404);
  });

  it('removes a solo-role assignment and redirects with the role anchor', async () => {
    const assignment = db.prepare('SELECT * FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.difficulty, data.referee1Id);

    const res = await agent.post(`/admin/competitions/${data.competitionId}/judges/${assignment.id}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(`/admin/competitions/${data.competitionId}/judges#role-`);

    const gone = db.prepare('SELECT * FROM panel_assignments WHERE id=?').get(assignment.id);
    expect(gone).toBeUndefined();
  });

  it('removes both paired assignments when unassigning a shared-group role', async () => {
    const tof = db.prepare('SELECT * FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.time_of_flight, data.referee2Id);

    const res = await agent.post(`/admin/competitions/${data.competitionId}/judges/${tof.id}/delete`);
    expect(res.status).toBe(302);

    const tofGone = db.prepare('SELECT * FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.time_of_flight, data.referee2Id);
    const hdGone = db.prepare('SELECT * FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
      .get(data.competitionId, data.roleIds.horizontal_displacement, data.referee2Id);
    expect(tofGone).toBeUndefined();
    expect(hdGone).toBeUndefined();
  });
});
