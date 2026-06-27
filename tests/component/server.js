'use strict';
process.env.DB_PATH = ':memory:';

const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../../src/db/database');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../src/views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../../src/public')));
app.use(session({
  secret: 'component-test-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || {};
  delete req.session.flash;
  next();
});

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/referee');
  }
  res.redirect('/login');
});

app.use('/', require('../../src/routes/auth'));
app.use('/leaderboard', require('../../src/routes/leaderboard'));
app.use('/referee', require('../../src/routes/referee'));
app.use('/admin', require('../../src/routes/admin'));

// Deletes all test data while keeping the permanent admin account.
// Called automatically at the start of every seed so each test file
// gets a clean database regardless of what the previous file left behind.
function cleanupDb() {
  db.prepare('DELETE FROM scores').run();
  db.prepare('DELETE FROM attempts').run();
  db.prepare('DELETE FROM entries').run();
  db.prepare('DELETE FROM sportsmen').run();
  db.prepare('DELETE FROM rounds').run();
  db.prepare('DELETE FROM groups').run();
  db.prepare('DELETE FROM competitions').run();
  db.prepare("DELETE FROM users WHERE role != 'admin'").run();
}

// Basic seed: competition + round + one unscored entry
app.post('/test/seed', (req, res) => {
  cleanupDb();

  const comp = db.prepare('INSERT INTO competitions (name, status) VALUES (?, ?)').run('Spring Cup', 'active');
  db.prepare('INSERT INTO competitions (name, date) VALUES (?, ?)').run('Autumn Open', '2026-09-15');
  db.prepare('INSERT INTO competitions (name, date, status) VALUES (?, ?, ?)').run('Winter Cup', '2025-12-15', 'closed');
  const group = db.prepare('INSERT INTO groups (competition_id, name) VALUES (?, ?)').run(comp.lastInsertRowid, 'Group A');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Qualifications', 1);
  const sp = db.prepare('INSERT INTO sportsmen (name, club, gender, birth_year, routine, competition_id, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run('Alice', 'Test Club', 'f', 2013, 'W11', comp.lastInsertRowid, group.lastInsertRowid);
  const sp2 = db.prepare('INSERT INTO sportsmen (name, club, competition_id) VALUES (?, ?, ?)').run('Bob', 'Test Club 2', comp.lastInsertRowid);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Referee One', 'referee1@test.com', bcrypt.hashSync('ref123', 10), 'referee');
  const referee = db.prepare('SELECT id, email, created_at FROM users WHERE email=?').get('referee1@test.com');
  db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round.lastInsertRowid, sp.lastInsertRowid, 1);

  const admin = db.prepare("SELECT id, email, created_at FROM users WHERE email='admin@test.com'").get();

  res.json({
    competitionId: Number(comp.lastInsertRowid),
    groupId: Number(group.lastInsertRowid),
    roundId: Number(round.lastInsertRowid),
    sportsmanId: Number(sp.lastInsertRowid),
    sportsmanId2: Number(sp2.lastInsertRowid),
    referee1: { id: Number(referee.id), email: referee.email, created_at: referee.created_at.substring(0, 10) },
    admin: { id: Number(admin.id), email: admin.email, created_at: admin.created_at.substring(0, 10) },
  });
});

// Scored seed: three athletes with attempts and scores for leaderboard tests
app.post('/test/seed/scored', (req, res) => {
  cleanupDb();

  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test Referee', 'ref@test.com', bcrypt.hashSync('ref123', 10), 'referee');
  const referee = db.prepare('SELECT id FROM users WHERE email=?').get('ref@test.com');

  const comp = db.prepare('INSERT INTO competitions (name, status) VALUES (?, ?)').run('Championship', 'active');
  const group = db.prepare('INSERT INTO groups (competition_id, name) VALUES (?, ?)').run(comp.lastInsertRowid, 'Group A');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Finals', 1);

  function addAthlete(name, startOrder, scores, routine = null) {
    const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id, routine) VALUES (?, ?, ?, ?)').run(name, comp.lastInsertRowid, group.lastInsertRowid, routine);
    const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round.lastInsertRowid, sp.lastInsertRowid, startOrder);
    scores.forEach((score, i) => {
      const attempt = db.prepare('INSERT INTO attempts (entry_id, attempt_number, status) VALUES (?, ?, ?)').run(entry.lastInsertRowid, i + 1, 'scored');
      db.prepare('INSERT INTO scores (attempt_id, referee_id, score) VALUES (?, ?, ?)').run(attempt.lastInsertRowid, referee.id, score);
    });
  }

  addAthlete('Bob', 1, [9.2, 9.1], 'DMT');
  addAthlete('Charlie', 2, [8.8, 8.6]);
  addAthlete('Alice', 3, [8.5]);

  res.json({
    competitionId: Number(comp.lastInsertRowid),
    groupId: Number(group.lastInsertRowid),
    roundId: Number(round.lastInsertRowid),
  });
});

// Always ensure the test admin user exists so auth tests work without seeding
const adminHash = bcrypt.hashSync('admin123', 10);
db.prepare('INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
  .run('Test Admin', 'admin@test.com', adminHash, 'admin');

app.listen(3001, () => process.stdout.write('Component test server ready on :3001\n'));
