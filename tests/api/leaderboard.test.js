import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, seedLeaderboardData, assignJudge, getUserIdByEmail, db } from './helpers/createApp.js';
import bcrypt from 'bcryptjs';

const app = createApp();
let competitionId;
let groupId;
let roundId;

beforeAll(() => {
  ({ competitionId, groupId, roundId } = seedLeaderboardData());
});

describe('GET /leaderboard/competitions/:competitionId/groups/:groupId/rounds/:roundId', () => {
  it('returns 200 and renders the round name', async () => {
    const res = await request(app).get(`/leaderboard/competitions/${competitionId}/groups/${groupId}/rounds/${roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Qualifications');
  });

  it('shows empty state when no athletes are scored', async () => {
    const res = await request(app).get(`/leaderboard/competitions/${competitionId}/groups/${groupId}/rounds/${roundId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('No athletes scored yet');
  });

  it('returns 404 for a non-existent round, group or competition', async () => {
    const res = await request(app).get(`/leaderboard/competitions/999/groups/${groupId}/rounds/${roundId}`);
    expect(res.status).toBe(404);
    expect(res.text).toContain('Competition not found');

    const res2 = await request(app).get(`/leaderboard/competitions/${competitionId}/groups/999/rounds/${roundId}`);
    expect(res2.status).toBe(404);
    expect(res2.text).toContain('Group not found');

    const res3 = await request(app).get(`/leaderboard/competitions/${competitionId}/groups/${groupId}/rounds/999`);
    expect(res3.status).toBe(404);
    expect(res3.text).toContain('Round not found');
  });

  it('shows a "panel not configured" message for a competition with no panel template', async () => {
    const comp = db.prepare('INSERT INTO competitions (name, status) VALUES (?, ?)').run('No Panel Competition', 'active');
    const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('G', comp.lastInsertRowid, 'NP');
    const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Round', 1);

    const res = await request(app).get(`/leaderboard/competitions/${comp.lastInsertRowid}/groups/${group.lastInsertRowid}/rounds/${round.lastInsertRowid}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Panel not configured');
  });
});

describe('GET /leaderboard with real panel scores', () => {
  let compId, grpId, rndId, attemptId;

  beforeAll(() => {
    const panelTemplate = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
    const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)')
      .run('Scored Cup', 'active', panelTemplate.id);
    compId = comp.lastInsertRowid;
    const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('G', compId, 'SC');
    grpId = group.lastInsertRowid;
    const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(grpId, 'Finals', 1);
    rndId = round.lastInsertRowid;
    const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Charlie', compId, grpId);
    const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(rndId, sp.lastInsertRowid, 1);
    const attempt = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, ?, ?)').run(entry.lastInsertRowid, 1, 1);
    attemptId = attempt.lastInsertRowid;

    const roleIds = Object.fromEntries(db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id]));
    const hash = bcrypt.hashSync('secret', 10);
    db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run('Diff Judge', 'lbdiff@test.com', hash, 'referee');
    db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run('Tof Judge', 'lbtof@test.com', hash, 'referee');
    const diffUserId = getUserIdByEmail('lbdiff@test.com');
    const tofUserId = getUserIdByEmail('lbtof@test.com');
    const diffAssignmentId = assignJudge(compId, roleIds.difficulty, diffUserId);
    const tofAssignmentId = assignJudge(compId, roleIds.time_of_flight, tofUserId);

    db.prepare('INSERT INTO element_scores (attempt_id, panel_assignment_id, judge_role_id, element_number, value) VALUES (?,?,?,?,?)')
      .run(attemptId, diffAssignmentId, roleIds.difficulty, 1, 2.5);
    db.prepare('INSERT INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?,?,?,?)')
      .run(attemptId, tofAssignmentId, roleIds.time_of_flight, 8.0);
  });

  it('shows the athlete with a total combining every submitted role', async () => {
    const res = await request(app).get(`/leaderboard/competitions/${compId}/groups/${grpId}/rounds/${rndId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Charlie');
    // difficulty (2.5) + time_of_flight (8.0), execution/HD/head_judge unsubmitted -> contribute 0
    expect(res.text).toContain('10.500');
  });

  it('includes a per-role breakdown title on the score', async () => {
    const res = await request(app).get(`/leaderboard/competitions/${compId}/groups/${grpId}/rounds/${rndId}`);
    expect(res.text).toContain('Difficulty: 2.50');
    expect(res.text).toContain('Time of Flight: 8.00');
  });

  it('marks the attempt as partial since not every required role has submitted', async () => {
    const res = await request(app).get(`/leaderboard/competitions/${compId}/groups/${grpId}/rounds/${rndId}`);
    expect(res.text).toContain('<sup');
  });
});

describe('GET /leaderboard with per_judge execution aggregation (local panel)', () => {
  let compId, grpId, rndId;

  beforeAll(() => {
    const localPanel = db.prepare("SELECT id FROM panel_templates WHERE key='local'").get();
    const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)')
      .run('Local Scored Cup', 'active', localPanel.id);
    compId = comp.lastInsertRowid;
    const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('G', compId, 'LS');
    grpId = group.lastInsertRowid;
    const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(grpId, 'Finals', 1);
    rndId = round.lastInsertRowid;
    const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Dana', compId, grpId);
    const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(rndId, sp.lastInsertRowid, 1);
    // element_count 10 so each judge's own final score is elementCount(10) - deduction, matching
    // the worked example (6.9/6.7/6.8/6.5); the deduction is stashed on trick 1 only, which is
    // fine since computeAttemptScore treats unset tricks as 0 either way
    const attempt = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, ?, ?)').run(entry.lastInsertRowid, 1, 10);
    const attemptId = attempt.lastInsertRowid;

    const roleIds = Object.fromEntries(db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id]));
    const hash = bcrypt.hashSync('secret', 10);
    // 4 execution judges each give their own single-trick deduction; personal final scores work
    // out to 6.9, 6.7, 6.8, 6.5 — drop the high (6.9) and low (6.5), sum the rest -> 13.5
    const deductions = [3.1, 3.3, 3.2, 3.5];
    deductions.forEach((ded, i) => {
      db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run(`Local Exec ${i}`, `localexec${i}@test.com`, hash, 'referee');
      const userId = getUserIdByEmail(`localexec${i}@test.com`);
      const assignmentId = assignJudge(compId, roleIds.execution, userId);
      db.prepare('INSERT INTO element_scores (attempt_id, panel_assignment_id, judge_role_id, element_number, value) VALUES (?,?,?,1,?)')
        .run(attemptId, assignmentId, roleIds.execution, ded);
    });
  });

  it('combines each judge\'s own final score (drop high/low, sum) rather than per-trick medians', async () => {
    const res = await request(app).get(`/leaderboard/competitions/${compId}/groups/${grpId}/rounds/${rndId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Dana');
    expect(res.text).toContain('13.500');
  });
});
