import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp, getUserIdByEmail, assignJudge, db } from './helpers/createApp.js';

const app = createApp();
let seq = 0;

function makeReferee() {
  seq += 1;
  const email = `sgref${seq}@test.com`;
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(`SG Referee ${seq}`, email, bcrypt.hashSync('secret123', 10), 'referee');
  return { id: getUserIdByEmail(email), email, password: 'secret123' };
}

async function loginAs(user) {
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email: user.email, password: user.password });
  return agent;
}

// two groups (A first, B second) with one round each and two athletes, in one starting group that is running on the first athlete of A
function seedRunningStartingGroup() {
  const localPanel = db.prepare("SELECT id FROM panel_templates WHERE key='local'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)')
    .run('SG Referee Cup', 'active', localPanel.id).lastInsertRowid;
  const sg = db.prepare('INSERT INTO starting_groups (competition_id, name) VALUES (?, ?)').run(comp, 'Block 7').lastInsertRowid;
  const groups = {};
  ['A', 'B'].forEach((tag, gi) => {
    const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation, starting_group_id, starting_group_position) VALUES (?, ?, ?, ?, ?)')
      .run(`Group ${tag}`, comp, tag, sg, gi + 1).lastInsertRowid;
    const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, 1)').run(group, `Round ${tag}`).lastInsertRowid;
    const attempts = [1, 2].map((k) => {
      const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run(`Athlete ${tag}${k}`, comp, group).lastInsertRowid;
      const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round, sp, k).lastInsertRowid;
      return db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, 1, 3)').run(entry).lastInsertRowid;
    });
    groups[tag] = { groupId: group, roundId: round, attempts };
  });
  const roleIds = Object.fromEntries(db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id]));
  const referee = makeReferee();
  assignJudge(comp, roleIds.execution, referee.id);
  return { comp, groups, referee };
}

const startAt = (d, attemptId) => db.prepare("UPDATE rounds SET status='in_progress', current_attempt_id=? WHERE id IN (?, ?)")
  .run(attemptId, d.groups.A.roundId, d.groups.B.roundId);
const refereeUrl = (d, tag) => `/referee/competitions/${d.comp}/groups/${d.groups[tag].groupId}/rounds/${d.groups[tag].roundId}`;

describe('referee on a starting group', () => {
  let d, agent;

  beforeEach(async () => {
    d = seedRunningStartingGroup();
    agent = await loginAs(d.referee);
  });

  it('shows the current athlete of the other group on either member url without a redirect', async () => {
    startAt(d, d.groups.B.attempts[0]);

    for (const tag of ['A', 'B']) {
      const res = await agent.get(refereeUrl(d, tag));
      expect(res.status).toBe(200);
      expect(res.text).toContain('Athlete B1');
      expect(res.text).not.toContain('Athlete A1');
    }
  });

  it('names the group of the current athlete in the header and the starting group', async () => {
    startAt(d, d.groups.B.attempts[0]);

    const res = await agent.get(refereeUrl(d, 'A'));

    expect(res.text).toContain('Group B');
    expect(res.text).toContain('Block 7');
  });

  it('keeps showing the right athlete after the head judge moves on', async () => {
    startAt(d, d.groups.A.attempts[1]);
    expect((await agent.get(refereeUrl(d, 'B'))).text).toContain('Athlete A2');

    startAt(d, d.groups.B.attempts[0]);
    expect((await agent.get(refereeUrl(d, 'B'))).text).toContain('Athlete B1');
  });

  it('shows one dashboard card for the starting group round', async () => {
    startAt(d, d.groups.A.attempts[0]);

    const res = await agent.get('/referee');

    const links = res.text.match(new RegExp(`/referee/competitions/${d.comp}/groups/\\d+/rounds/\\d+`, 'g')) || [];
    expect(links).toEqual([refereeUrl(d, 'A')]);
    expect(res.text).toContain('Block 7');
  });
});
