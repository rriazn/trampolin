import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp, getUserIdByEmail, assignJudge, db } from './helpers/createApp.js';

const app = createApp();
let seq = 0;

function makeUser(role) {
  seq += 1;
  const email = `sghj${seq}@test.com`;
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(`SG User ${seq}`, email, bcrypt.hashSync('secret123', 10), role);
  return { id: getUserIdByEmail(email), email, password: 'secret123' };
}

async function loginAs(user) {
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email: user.email, password: user.password });
  return agent;
}

// two groups with one round each (2 athletes, 1 attempt each) in one starting group, group A first
function seedStartingGroup() {
  const localPanel = db.prepare("SELECT id FROM panel_templates WHERE key='local'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)')
    .run('SG API Cup', 'active', localPanel.id).lastInsertRowid;
  const sg = db.prepare('INSERT INTO starting_groups (competition_id, name) VALUES (?, ?)').run(comp, 'Block 1').lastInsertRowid;
  const groups = {};
  ['A', 'B'].forEach((tag, gi) => {
    const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation, starting_group_id, starting_group_position) VALUES (?, ?, ?, ?, ?)')
      .run(`Group ${tag}`, comp, tag, sg, gi + 1).lastInsertRowid;
    const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, 1)').run(group, `Round ${tag}`).lastInsertRowid;
    const attempts = [1, 2].map((k) => {
      const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run(`${tag}${k}`, comp, group).lastInsertRowid;
      const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round, sp, k).lastInsertRowid;
      return db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, 1, 1)').run(entry).lastInsertRowid;
    });
    groups[tag] = { groupId: group, roundId: round, attempts };
  });
  const roleIds = Object.fromEntries(db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id]));
  return { comp, sg, groups, roleIds };
}

function staffLocalPanel(competitionId, roleIds) {
  const headJudge = makeUser('head_judge');
  const headJudgeAssignmentId = assignJudge(competitionId, roleIds.head_judge, headJudge.id);
  const execAssignmentIds = [1, 2, 3, 4].map(() => assignJudge(competitionId, roleIds.execution, makeUser('referee').id));
  const diffAssignmentId = assignJudge(competitionId, roleIds.difficulty, makeUser('referee').id);
  return { headJudge, headJudgeAssignmentId, execAssignmentIds, diffAssignmentId };
}

function fullyScoreAttempt(attemptId, roleIds, staff) {
  const insertElement = db.prepare('INSERT OR REPLACE INTO element_scores (attempt_id, panel_assignment_id, judge_role_id, element_number, value) VALUES (?,?,?,1,?)');
  for (const aid of staff.execAssignmentIds) insertElement.run(attemptId, aid, roleIds.execution, 0.1);
  insertElement.run(attemptId, staff.diffAssignmentId, roleIds.difficulty, 1.0);
  db.prepare('INSERT OR REPLACE INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?,?,?,0)')
    .run(attemptId, staff.headJudgeAssignmentId, roleIds.head_judge);
}

const roundUrl = (d, tag) => `/head-judge/competitions/${d.comp}/groups/${d.groups[tag].groupId}/rounds/${d.groups[tag].roundId}`;
const roundRow = (d, tag) => db.prepare('SELECT status, current_attempt_id FROM rounds WHERE id=?').get(d.groups[tag].roundId);
const post = (agent, url) => agent.post(url).type('form').send({});

describe('head judge actions on a starting group', () => {
  let d, staff, agent;
  // combined order: A1, A2, B1, B2
  const order = () => [...d.groups.A.attempts, ...d.groups.B.attempts];

  beforeEach(async () => {
    d = seedStartingGroup();
    staff = staffLocalPanel(d.comp, d.roleIds);
    agent = await loginAs(staff.headJudge);
  });

  it('starts every member round at the first attempt of the combined order, from any member url', async () => {
    const res = await post(agent, roundUrl(d, 'B') + '/start');

    expect(res.status).toBe(302);
    expect(roundRow(d, 'A')).toEqual({ status: 'in_progress', current_attempt_id: order()[0] });
    expect(roundRow(d, 'B')).toEqual({ status: 'in_progress', current_attempt_id: order()[0] });
    expect(res.headers.location).toBe(roundUrl(d, 'A'));
  });

  it('refuses to start when a member round is not in the not started state', async () => {
    db.prepare("UPDATE rounds SET status='completed' WHERE id=?").run(d.groups.B.roundId);

    const res = await post(agent, roundUrl(d, 'A') + '/start');

    expect(res.status).toBe(302);
    expect(roundRow(d, 'A').status).toBe('not_started');
    const follow = await agent.get(res.headers.location);
    expect(follow.text).toContain('already been started');
  });

  it('refuses to start when the panel is not staffed', async () => {
    const other = seedStartingGroup();
    const lonely = makeUser('head_judge');
    assignJudge(other.comp, other.roleIds.head_judge, lonely.id);
    const lonelyAgent = await loginAs(lonely);

    await post(lonelyAgent, roundUrl(other, 'A') + '/start');

    expect(roundRow(other, 'A').status).toBe('not_started');
    expect(roundRow(other, 'B').status).toBe('not_started');
  });

  it('moves both rounds to the next athlete and redirects to the round of the new athlete when the group changes', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');
    fullyScoreAttempt(order()[0], d.roleIds, staff);
    let res = await post(agent, roundUrl(d, 'A') + '/next');
    expect(res.headers.location).toBe(roundUrl(d, 'A'));
    expect(roundRow(d, 'B').current_attempt_id).toBe(order()[1]);

    fullyScoreAttempt(order()[1], d.roleIds, staff);
    res = await post(agent, roundUrl(d, 'A') + '/next');

    expect(roundRow(d, 'A')).toEqual({ status: 'in_progress', current_attempt_id: order()[2] });
    expect(roundRow(d, 'B')).toEqual({ status: 'in_progress', current_attempt_id: order()[2] });
    expect(res.headers.location).toBe(roundUrl(d, 'B'));
  });

  it('redirects a head judge on the other member url to the round of the current athlete', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');

    const res = await agent.get(roundUrl(d, 'B'));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(roundUrl(d, 'A'));
  });

  it('shows the current athlete on the round page of the athlete\'s group', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');
    const res = await agent.get(roundUrl(d, 'A'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('A1');
    expect(res.text).toContain('Group A');
  });

  it('does not advance while the current attempt is incomplete', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');

    await post(agent, roundUrl(d, 'B') + '/next');

    expect(roundRow(d, 'A').current_attempt_id).toBe(order()[0]);
    expect(roundRow(d, 'B').current_attempt_id).toBe(order()[0]);
  });

  it('completes every member round after the last attempt of the combined order', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');
    for (const id of order()) {
      fullyScoreAttempt(id, d.roleIds, staff);
      await post(agent, roundUrl(d, 'A') + '/next');
    }

    expect(roundRow(d, 'A')).toEqual({ status: 'completed', current_attempt_id: null });
    expect(roundRow(d, 'B')).toEqual({ status: 'completed', current_attempt_id: null });
  });

  it('skips across the group boundary', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');
    await post(agent, roundUrl(d, 'A') + '/skip');
    const res = await post(agent, roundUrl(d, 'A') + '/skip');

    expect(db.prepare('SELECT status FROM attempts WHERE id IN (?, ?)').all(...d.groups.A.attempts).map(r => r.status)).toEqual(['skipped', 'skipped']);
    expect(roundRow(d, 'B').current_attempt_id).toBe(order()[2]);
    expect(res.headers.location).toBe(roundUrl(d, 'B'));
  });

  it('skipping the last attempt completes every member round', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');
    for (let i = 0; i < 4; i++) await post(agent, roundUrl(d, 'B') + '/skip');

    expect(roundRow(d, 'A').status).toBe('completed');
    expect(roundRow(d, 'B').status).toBe('completed');
  });

  it('goes back across the group boundary and moves every member round', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');
    await post(agent, roundUrl(d, 'A') + '/skip');
    await post(agent, roundUrl(d, 'A') + '/skip');
    expect(roundRow(d, 'B').current_attempt_id).toBe(order()[2]);

    const res = await post(agent, roundUrl(d, 'B') + '/back');

    expect(roundRow(d, 'A').current_attempt_id).toBe(order()[1]);
    expect(roundRow(d, 'B').current_attempt_id).toBe(order()[1]);
    expect(res.headers.location).toBe(roundUrl(d, 'A'));
  });

  it('reopens every member round from a completed starting group onto the last attempt', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');
    for (let i = 0; i < 4; i++) await post(agent, roundUrl(d, 'A') + '/skip');

    const res = await post(agent, roundUrl(d, 'A') + '/back');

    expect(roundRow(d, 'A')).toEqual({ status: 'in_progress', current_attempt_id: order()[3] });
    expect(roundRow(d, 'B')).toEqual({ status: 'in_progress', current_attempt_id: order()[3] });
    expect(res.headers.location).toBe(roundUrl(d, 'B'));
  });

  it('complete finishes every member round', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');

    await post(agent, roundUrl(d, 'B') + '/complete');

    expect(roundRow(d, 'A').status).toBe('completed');
    expect(roundRow(d, 'B').status).toBe('completed');
  });

  it('accepts the penalty and trick count for the shared current attempt from the other member url', async () => {
    await post(agent, roundUrl(d, 'A') + '/start');
    const attemptId = order()[0];

    await agent.post(roundUrl(d, 'B') + '/score').type('form').send({ attemptId, score: '0.2' });
    await agent.post(`${roundUrl(d, 'B')}/attempts/${attemptId}/element-count`).type('form').send({ element_count: '5' });

    expect(db.prepare('SELECT score FROM scores WHERE attempt_id=? AND panel_assignment_id=?').get(attemptId, staff.headJudgeAssignmentId).score).toBe(0.2);
    expect(db.prepare('SELECT element_count FROM attempts WHERE id=?').get(attemptId).element_count).toBe(5);
  });
});

describe('head judge dashboard', () => {
  it('shows one card per starting group round that links to the first member round', async () => {
    const d = seedStartingGroup();
    const staff = staffLocalPanel(d.comp, d.roleIds);
    const agent = await loginAs(staff.headJudge);

    const res = await agent.get('/head-judge/');

    const links = res.text.match(new RegExp(`/head-judge/competitions/${d.comp}/groups/\\d+/rounds/\\d+`, 'g')) || [];
    expect(links).toEqual([roundUrl(d, 'A')]);
    expect(res.text).toContain('Block 1');
    expect(res.text).toContain('Group A');
    expect(res.text).toContain('Group B');
  });
});
