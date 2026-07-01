'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');

router.post('/test/seed', (req, res) => {
  db.prepare('DELETE FROM scores').run();
  db.prepare('DELETE FROM attempts').run();
  db.prepare('DELETE FROM entries').run();
  db.prepare('DELETE FROM sportsmen').run();
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

  const comp = db.prepare("INSERT INTO competitions (name, status) VALUES (?, ?)")
    .run('Spring Championship', 'active');

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

  db.prepare("INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)").run(e1.lastInsertRowid, 1);
  db.prepare("INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)").run(e1.lastInsertRowid, 2);
  db.prepare("INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)").run(e2.lastInsertRowid, 1);
  db.prepare("INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)").run(e2.lastInsertRowid, 2);

  res.json({
    ok: true,
    competitionId: Number(comp.lastInsertRowid),
    groupId: Number(group.lastInsertRowid),
    roundId: Number(round.lastInsertRowid),
    sp1Id: Number(sp1.lastInsertRowid),
    sp2Id: Number(sp2.lastInsertRowid),
  });
});

module.exports = router;
