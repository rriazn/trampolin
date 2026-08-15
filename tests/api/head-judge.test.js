import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp, getUserIdByEmail, assignJudge, db } from './helpers/createApp.js';

const app = createApp();
let seq = 0;

function makeUser(role, password = 'secret123') {
  seq += 1;
  const email = `hj${seq}@test.com`;
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(`HJ User ${seq}`, email, bcrypt.hashSync(password, 10), role);
  return { id: getUserIdByEmail(email), email, password };
}

async function loginAs(user) {
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email: user.email, password: user.password });
  return agent;
}

// Local panel: 4 execution (per_judge aggregation), 1 difficulty, 1 head_judge — lighter to fully
// staff/score than fig's 9-judge panel. 2 athletes, 1 attempt each, 1 trick each (no landing/bonus
// complexity needed for these flow-control tests).
function seedLocalPanelRound() {
  const localPanel = db.prepare("SELECT id FROM panel_templates WHERE key='local'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)')
    .run('HJ API Cup', 'active', localPanel.id);
  const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('Group A', comp.lastInsertRowid, 'GA');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Finals', 1);
  const sp1 = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Leon', comp.lastInsertRowid, group.lastInsertRowid);
  const sp2 = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Noah', comp.lastInsertRowid, group.lastInsertRowid);
  const entry1 = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, 1)').run(round.lastInsertRowid, sp1.lastInsertRowid);
  const entry2 = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, 2)').run(round.lastInsertRowid, sp2.lastInsertRowid);
  const attempt1 = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, 1, 1)').run(entry1.lastInsertRowid);
  const attempt2 = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, 1, 1)').run(entry2.lastInsertRowid);
  const roleIds = Object.fromEntries(db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id]));
  return {
    competitionId: comp.lastInsertRowid, groupId: group.lastInsertRowid, roundId: round.lastInsertRowid,
    attempt1Id: attempt1.lastInsertRowid, attempt2Id: attempt2.lastInsertRowid, roleIds,
  };
}

// Fully staffs the local panel for a competition and returns the resulting assignment ids.
function staffLocalPanel(competitionId, roleIds) {
  const headJudge = makeUser('head_judge');
  const headJudgeAssignmentId = assignJudge(competitionId, roleIds.head_judge, headJudge.id);
  const execUsers = [1, 2, 3, 4].map(() => makeUser('referee'));
  const execAssignmentIds = execUsers.map(u => assignJudge(competitionId, roleIds.execution, u.id));
  const diffUser = makeUser('referee');
  const diffAssignmentId = assignJudge(competitionId, roleIds.difficulty, diffUser.id);
  return { headJudge, headJudgeAssignmentId, execUsers, execAssignmentIds, diffUser, diffAssignmentId };
}

// Inserts element_scores/scores directly so an attempt reads as fully judged, without
// re-exercising referee.js's own submission mechanics (covered separately in referee.test.js).
function fullyScoreAttempt(attemptId, roleIds, staff) {
  const insertElement = db.prepare('INSERT OR REPLACE INTO element_scores (attempt_id, panel_assignment_id, judge_role_id, element_number, value) VALUES (?,?,?,1,?)');
  for (const aid of staff.execAssignmentIds) insertElement.run(attemptId, aid, roleIds.execution, 0.1);
  insertElement.run(attemptId, staff.diffAssignmentId, roleIds.difficulty, 1.0);
  db.prepare('INSERT OR REPLACE INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?,?,?,0)')
    .run(attemptId, staff.headJudgeAssignmentId, roleIds.head_judge);
}

describe('GET /head-judge/ (dashboard)', () => {
  let data;

  beforeAll(() => {
    data = seedLocalPanelRound();
  });

  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).get('/head-judge/');
    expect(res.status).toBe(403);
  });

  it('returns 403 for a plain referee', async () => {
    const ref = makeUser('referee');
    const agent = await loginAs(ref);
    const res = await agent.get('/head-judge/');
    expect(res.status).toBe(403);
  });

  it('shows a "Not staffed" badge before the panel is fully assigned', async () => {
    const headJudge = makeUser('head_judge');
    assignJudge(data.competitionId, data.roleIds.head_judge, headJudge.id);
    const agent = await loginAs(headJudge);
    const res = await agent.get('/head-judge/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Finals');
    expect(res.text).toContain('Not staffed');
  });

  it('shows "Ready to start" once the panel is fully staffed', async () => {
    const staff = staffLocalPanel(data.competitionId, data.roleIds);
    const agent = await loginAs(staff.headJudge);
    const res = await agent.get('/head-judge/');
    expect(res.text).toContain('Ready to start');
  });

  it('an admin sees the round too, without holding a head_judge assignment', async () => {
    const admin = makeUser('admin');
    const agent = await loginAs(admin);
    const res = await agent.get('/head-judge/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Finals');
  });
});

describe('GET /head-judge/competitions/:cid/groups/:gid/rounds/:rid (control page)', () => {
  let data, agent;

  beforeAll(async () => {
    data = seedLocalPanelRound();
    const headJudge = makeUser('head_judge');
    assignJudge(data.competitionId, data.roleIds.head_judge, headJudge.id);
    agent = await loginAs(headJudge);
  });

  it('returns 403 when unauthenticated', async () => {
    const res = await request(app).get(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent competition, group or round', async () => {
    const res = await agent.get(`/head-judge/competitions/999/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(404);
    expect(res.text).toBe('Competition not found');

    const res2 = await agent.get(`/head-judge/competitions/${data.competitionId}/groups/999/rounds/${data.roundId}`);
    expect(res2.status).toBe(404);
    expect(res2.text).toBe('Group not found');

    const res3 = await agent.get(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/999`);
    expect(res3.status).toBe(404);
    expect(res3.text).toBe('Round not found');
  });

  it('shows the panel readiness banner before the round is started', async () => {
    const res = await agent.get(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Panel readiness');
    expect(res.text).toContain('0 of 4 assigned');
  });
});

describe('POST .../start', () => {
  let data, staff, agent;

  beforeAll(async () => {
    data = seedLocalPanelRound();
    staff = staffLocalPanel(data.competitionId, data.roleIds);
    agent = await loginAs(staff.headJudge);
  });

  it('returns 403 for a plain referee', async () => {
    const refAgent = await loginAs(staff.execUsers[0]);
    const res = await refAgent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/start`).type('form').send({});
    expect(res.status).toBe(403);
  });

  it('flashes an error and does not start when the panel is not fully staffed', async () => {
    const other = seedLocalPanelRound();
    const otherHeadJudge = makeUser('head_judge');
    assignJudge(other.competitionId, other.roleIds.head_judge, otherHeadJudge.id);
    const otherAgent = await loginAs(otherHeadJudge);

    const res = await otherAgent.post(`/head-judge/competitions/${other.competitionId}/groups/${other.groupId}/rounds/${other.roundId}/start`).type('form').send({});
    expect(res.status).toBe(302);
    const round = db.prepare('SELECT status FROM rounds WHERE id=?').get(other.roundId);
    expect(round.status).toBe('not_started');
    const follow = await otherAgent.get(res.headers.location);
    expect(follow.text).toContain('not fully staffed');
  });

  it('starts the round, setting current_attempt_id to the first attempt', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/start`).type('form').send({});
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);

    const round = db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(data.roundId);
    expect(round.status).toBe('in_progress');
    expect(round.current_attempt_id).toBe(data.attempt1Id);
  });

  it('flashes an error and does not restart an already-started round', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/start`).type('form').send({});
    expect(res.status).toBe(302);
    const follow = await agent.get(res.headers.location);
    expect(follow.text).toContain('already been started');
  });

  it('shows the current athlete and judging checklist once started', async () => {
    const res = await agent.get(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Leon');
    expect(res.text).toContain('Judging checklist');
  });
});

describe('POST .../next', () => {
  let data, staff, agent;

  beforeAll(async () => {
    data = seedLocalPanelRound();
    staff = staffLocalPanel(data.competitionId, data.roleIds);
    agent = await loginAs(staff.headJudge);
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/start`).type('form').send({});
  });

  it('returns 403 for a plain referee', async () => {
    const refAgent = await loginAs(staff.execUsers[0]);
    const res = await refAgent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/next`).type('form').send({});
    expect(res.status).toBe(403);
  });

  it('flashes an error and does not advance while the current attempt is incomplete', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/next`).type('form').send({});
    expect(res.status).toBe(302);
    const round = db.prepare('SELECT current_attempt_id FROM rounds WHERE id=?').get(data.roundId);
    expect(round.current_attempt_id).toBe(data.attempt1Id);
    const follow = await agent.get(res.headers.location);
    expect(follow.text).toContain('Not every judge has submitted');
  });

  it('advances to the next attempt once the current one is fully judged', async () => {
    fullyScoreAttempt(data.attempt1Id, data.roleIds, staff);

    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/next`).type('form').send({});
    expect(res.status).toBe(302);

    const round = db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(data.roundId);
    expect(round.status).toBe('in_progress');
    expect(round.current_attempt_id).toBe(data.attempt2Id);

    const attempt1 = db.prepare('SELECT status FROM attempts WHERE id=?').get(data.attempt1Id);
    expect(attempt1.status).toBe('scored');
  });

  it('completes the round once the last attempt is judged and none remain', async () => {
    fullyScoreAttempt(data.attempt2Id, data.roleIds, staff);

    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/next`).type('form').send({});
    expect(res.status).toBe(302);

    const round = db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(data.roundId);
    expect(round.status).toBe('completed');
    expect(round.current_attempt_id).toBeNull();
  });
});

describe('POST .../back', () => {
  let data, staff, agent;

  beforeAll(async () => {
    data = seedLocalPanelRound();
    staff = staffLocalPanel(data.competitionId, data.roleIds);
    agent = await loginAs(staff.headJudge);
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/start`).type('form').send({});
  });

  it('flashes an error and does not move while on the first attempt', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/back`).type('form').send({});
    expect(res.status).toBe(302);
    const follow = await agent.get(res.headers.location);
    expect(follow.text).toContain('Already at the first attempt');
  });

  it('moves back to the previous attempt without touching already-saved scores', async () => {
    fullyScoreAttempt(data.attempt1Id, data.roleIds, staff);
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/next`).type('form').send({});
    // now on attempt2; go back to attempt1 and confirm attempt1's scores are untouched
    const before = db.prepare('SELECT value FROM element_scores WHERE attempt_id=? AND panel_assignment_id=?').get(data.attempt1Id, staff.execAssignmentIds[0]);
    expect(before.value).toBe(0.1);

    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/back`).type('form').send({});
    expect(res.status).toBe(302);

    const round = db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(data.roundId);
    expect(round.status).toBe('in_progress');
    expect(round.current_attempt_id).toBe(data.attempt1Id);

    const after = db.prepare('SELECT value FROM element_scores WHERE attempt_id=? AND panel_assignment_id=?').get(data.attempt1Id, staff.execAssignmentIds[0]);
    expect(after.value).toBe(0.1);
  });
});

describe('POST .../back from a completed round', () => {
  let data, staff, agent;

  beforeAll(async () => {
    data = seedLocalPanelRound();
    staff = staffLocalPanel(data.competitionId, data.roleIds);
    agent = await loginAs(staff.headJudge);
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/start`).type('form').send({});
    fullyScoreAttempt(data.attempt1Id, data.roleIds, staff);
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/next`).type('form').send({});
    fullyScoreAttempt(data.attempt2Id, data.roleIds, staff);
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/next`).type('form').send({});
  });

  it('reopens the round onto its last attempt', async () => {
    const before = db.prepare('SELECT status FROM rounds WHERE id=?').get(data.roundId);
    expect(before.status).toBe('completed');

    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/back`).type('form').send({});
    expect(res.status).toBe(302);

    const round = db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(data.roundId);
    expect(round.status).toBe('in_progress');
    expect(round.current_attempt_id).toBe(data.attempt2Id);
  });
});

describe('POST .../skip', () => {
  let data, staff, agent;

  beforeAll(async () => {
    data = seedLocalPanelRound();
    staff = staffLocalPanel(data.competitionId, data.roleIds);
    agent = await loginAs(staff.headJudge);
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/start`).type('form').send({});
  });

  it('marks the current attempt skipped and advances, recording no score for it', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/skip`).type('form').send({});
    expect(res.status).toBe(302);

    const attempt1 = db.prepare('SELECT status FROM attempts WHERE id=?').get(data.attempt1Id);
    expect(attempt1.status).toBe('skipped');
    const scores = db.prepare('SELECT COUNT(*) AS n FROM element_scores WHERE attempt_id=?').get(data.attempt1Id);
    expect(scores.n).toBe(0);

    const round = db.prepare('SELECT current_attempt_id FROM rounds WHERE id=?').get(data.roundId);
    expect(round.current_attempt_id).toBe(data.attempt2Id);
  });

  it('completes the round when skipping the last remaining attempt', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/skip`).type('form').send({});
    expect(res.status).toBe(302);

    const attempt2 = db.prepare('SELECT status FROM attempts WHERE id=?').get(data.attempt2Id);
    expect(attempt2.status).toBe('skipped');
    const round = db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(data.roundId);
    expect(round.status).toBe('completed');
    expect(round.current_attempt_id).toBeNull();
  });
});

describe('POST .../score (inline head_judge penalty)', () => {
  let data, staff, agent;

  beforeAll(async () => {
    data = seedLocalPanelRound();
    staff = staffLocalPanel(data.competitionId, data.roleIds);
    agent = await loginAs(staff.headJudge);
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/start`).type('form').send({});
  });

  it('returns 403 for a plain referee', async () => {
    const refAgent = await loginAs(staff.execUsers[0]);
    const res = await refAgent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/score`)
      .type('form').send({ attemptId: data.attempt1Id, score: '0' });
    expect(res.status).toBe(403);
  });

  it('rejects a score for an attempt that is not the round\'s current attempt', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/score`)
      .type('form').send({ attemptId: data.attempt2Id, score: '0.2' });
    expect(res.status).toBe(302);
    const saved = db.prepare('SELECT score FROM scores WHERE attempt_id=? AND panel_assignment_id=?').get(data.attempt2Id, staff.headJudgeAssignmentId);
    expect(saved).toBeUndefined();
  });

  it('rejects an out-of-range score', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/score`)
      .type('form').send({ attemptId: data.attempt1Id, score: '-1' });
    expect(res.status).toBe(302);
    const follow = await agent.get(res.headers.location);
    expect(follow.text).toContain('Score must be');
  });

  it('saves a valid score and redirects back to the head-judge control page, not /referee', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/score`)
      .type('form').send({ attemptId: data.attempt1Id, score: '0.3' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}`);
    const saved = db.prepare('SELECT score FROM scores WHERE attempt_id=? AND panel_assignment_id=?').get(data.attempt1Id, staff.headJudgeAssignmentId);
    expect(saved.score).toBe(0.3);
  });

  it('resubmitting overwrites the previous score, not duplicating it', async () => {
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/score`)
      .type('form').send({ attemptId: data.attempt1Id, score: '0.5' });
    const rows = db.prepare('SELECT score FROM scores WHERE attempt_id=? AND panel_assignment_id=?').all(data.attempt1Id, staff.headJudgeAssignmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(0.5);
  });
});

describe('POST .../attempts/:aid/element-count', () => {
  let data, staff, agent;

  beforeAll(async () => {
    data = seedLocalPanelRound();
    staff = staffLocalPanel(data.competitionId, data.roleIds);
    agent = await loginAs(staff.headJudge);
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/start`).type('form').send({});
  });

  it('sets the trick count for the current attempt, allowing 0', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/attempts/${data.attempt1Id}/element-count`)
      .type('form').send({ element_count: '0' });
    expect(res.status).toBe(302);
    const attempt = db.prepare('SELECT element_count FROM attempts WHERE id=?').get(data.attempt1Id);
    expect(attempt.element_count).toBe(0);
  });

  it('rejects a count above 10, leaving the value unchanged', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/attempts/${data.attempt1Id}/element-count`)
      .type('form').send({ element_count: '11' });
    expect(res.status).toBe(302);
    const attempt = db.prepare('SELECT element_count FROM attempts WHERE id=?').get(data.attempt1Id);
    expect(attempt.element_count).toBe(0);
  });

  it('rejects setting the count on an attempt that is not the round\'s current attempt', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/attempts/${data.attempt2Id}/element-count`)
      .type('form').send({ element_count: '5' });
    expect(res.status).toBe(302);
    const attempt = db.prepare('SELECT element_count FROM attempts WHERE id=?').get(data.attempt2Id);
    expect(attempt.element_count).toBe(1);
  });
});

describe('POST .../complete (manual override)', () => {
  let data, staff, agent;

  beforeAll(async () => {
    data = seedLocalPanelRound();
    staff = staffLocalPanel(data.competitionId, data.roleIds);
    agent = await loginAs(staff.headJudge);
    await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/start`).type('form').send({});
  });

  it('returns 403 for a plain referee', async () => {
    const refAgent = await loginAs(staff.execUsers[0]);
    const res = await refAgent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/complete`).type('form').send({});
    expect(res.status).toBe(403);
  });

  it('force-completes the round even though no attempt has been judged', async () => {
    const res = await agent.post(`/head-judge/competitions/${data.competitionId}/groups/${data.groupId}/rounds/${data.roundId}/complete`).type('form').send({});
    expect(res.status).toBe(302);
    const round = db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(data.roundId);
    expect(round.status).toBe('completed');
    expect(round.current_attempt_id).toBeNull();

    const attempt1 = db.prepare('SELECT status FROM attempts WHERE id=?').get(data.attempt1Id);
    expect(attempt1.status).toBe('pending'); // left as-is, not force-marked scored
  });
});
