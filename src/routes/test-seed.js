'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');

router.post('/test/seed', (req, res) => {
  db.prepare('DELETE FROM element_scores').run();
  db.prepare('DELETE FROM scores').run();
  db.prepare('DELETE FROM attempts').run();
  db.prepare('DELETE FROM entries').run();
  db.prepare('DELETE FROM sportsmen').run();
  db.prepare('DELETE FROM panel_assignments').run();
  db.prepare('DELETE FROM rounds').run();
  db.prepare('DELETE FROM groups').run();
  db.prepare('DELETE FROM competitions').run();
  db.prepare('DELETE FROM users').run();

  const adminHash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Admin', 'admin@example.com', adminHash, 'admin');

  const refHash = bcrypt.hashSync('referee123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Maria Schmidt', 'maria@example.com', refHash, 'referee');
  const maria = db.prepare("SELECT id FROM users WHERE email='maria@example.com'").get();

  const headJudgeHash = bcrypt.hashSync('headjudge123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Petra Voss', 'petra@example.com', headJudgeHash, 'head_judge');
  const petra = db.prepare("SELECT id FROM users WHERE email='petra@example.com'").get();

  const figPanel = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
  const comp = db.prepare("INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)")
    .run('Spring Championship', 'active', figPanel.id);

  const group = db.prepare("INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)")
    .run('Junior', comp.lastInsertRowid, 'JR');

  const round = db.prepare("INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)")
    .run(group.lastInsertRowid, 'Qualifications', 1);

  const sp1 = db.prepare("INSERT INTO sportsmen (name, club, competition_id, group_id) VALUES (?, ?, ?, ?)")
    .run('Leon Weber', 'TSV München', comp.lastInsertRowid, group.lastInsertRowid);
  const sp2 = db.prepare("INSERT INTO sportsmen (name, club, competition_id, group_id) VALUES (?, ?, ?, ?)")
    .run('Emma Fischer', 'SV Hamburg', comp.lastInsertRowid, group.lastInsertRowid);

  const e1 = db.prepare("INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)")
    .run(round.lastInsertRowid, sp1.lastInsertRowid, 1);
  const e2 = db.prepare("INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)")
    .run(round.lastInsertRowid, sp2.lastInsertRowid, 2);

  const a1 = db.prepare("INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)").run(e1.lastInsertRowid, 1);
  const a2 = db.prepare("INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)").run(e1.lastInsertRowid, 2);
  const a3 = db.prepare("INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)").run(e2.lastInsertRowid, 1);
  const a4 = db.prepare("INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)").run(e2.lastInsertRowid, 2);

  // Maria judges time_of_flight (a simple single attempt-level mark, no per-trick inputs) so the
  // turn-based scoring UI is directly reachable in integration tests without needing head-judge.js
  // (not built yet) to staff/start rounds through its own UI.
  const timeOfFlightRoleId = db.prepare("SELECT id FROM judge_roles WHERE key='time_of_flight'").get().id;
  db.prepare('INSERT INTO panel_assignments (competition_id, judge_role_id, user_id) VALUES (?, ?, ?)')
    .run(comp.lastInsertRowid, timeOfFlightRoleId, maria.id);

  // Petra holds the head_judge panel role too (same identity, two capabilities per the plan), so
  // head-judge.js's own integration tests can exercise Start/Next/Complete without a full roster.
  const headJudgeRoleId = db.prepare("SELECT id FROM judge_roles WHERE key='head_judge'").get().id;
  db.prepare('INSERT INTO panel_assignments (competition_id, judge_role_id, user_id) VALUES (?, ?, ?)')
    .run(comp.lastInsertRowid, headJudgeRoleId, petra.id);

  // Round starts on Leon's first attempt, matching the old fixture's implicit "ready to score"
  // state. Advancing turns (Next) is head-judge.js's job and isn't testable here yet.
  db.prepare("UPDATE rounds SET status='in_progress', current_attempt_id=? WHERE id=?")
    .run(a1.lastInsertRowid, round.lastInsertRowid);

  res.json({
    ok: true,
    competitionId: Number(comp.lastInsertRowid),
    groupId: Number(group.lastInsertRowid),
    roundId: Number(round.lastInsertRowid),
    sp1Id: Number(sp1.lastInsertRowid),
    sp2Id: Number(sp2.lastInsertRowid),
    attempt1Id: Number(a1.lastInsertRowid),
    attempt2Id: Number(a2.lastInsertRowid),
    attempt3Id: Number(a3.lastInsertRowid),
    attempt4Id: Number(a4.lastInsertRowid),
    timeOfFlightRoleId: Number(timeOfFlightRoleId),
    headJudgeRoleId: Number(headJudgeRoleId),
    headJudgeUserId: Number(petra.id),
  });
});

module.exports = router;
