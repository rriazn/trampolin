'use strict';
const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const request = require('supertest');
// Loaded via Node's native require, same cache as the routes
const db = require('../../../src/db/database');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../../src/views'));
  app.use(express.urlencoded({ extended: false }));

  // Use in-memory session store to avoid creating session db files during tests
  app.use(session({
    secret: 'test-secret',
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

  app.use('/', require('../../../src/routes/auth'));
  app.use('/leaderboard', require('../../../src/routes/leaderboard'));
  app.use('/referee', require('../../../src/routes/referee'));
  app.use('/admin', require('../../../src/routes/admin'));

  return app;
}

// Uses the same db instance (Node's require cache) as the routes, so seeded
// data is visible to request handlers during tests.
function seedTestUsers(password = 'secret123') {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test Admin', 'admin@test.com', hash, 'admin');
  db.prepare('INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test Referee', 'referee@test.com', hash, 'referee');
}

function seedLeaderboardData() {
  const comp = db.prepare('INSERT INTO competitions (name, status) VALUES (?, ?)').run('Test Competition', 'active');
  const round = db.prepare('INSERT INTO rounds (competition_id, name, round_order) VALUES (?, ?, ?)').run(comp.lastInsertRowid, 'Qualifications', 1);
  return { competitionId: comp.lastInsertRowid, roundId: round.lastInsertRowid };
}

function seedReferee() {
  const hash = bcrypt.hashSync('ref-secret', 10);
  db.prepare('INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Test Referee 2', 'ref@test.com', hash, 'referee');
}

async function loginReferee(app) {
  seedReferee();
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email: 'ref@test.com', password: 'ref-secret' });
  return agent;
}

function seedCompetitionData() {
  const comp = db.prepare('INSERT INTO competitions (name, status) VALUES (?, ?)').run('Active Competition', 'active');
  const round = db.prepare('INSERT INTO rounds (competition_id, name, round_order) VALUES (?, ?, ?)').run(comp.lastInsertRowid, 'Round A', 1);
  const sportsman = db.prepare('INSERT INTO sportsmen (name) VALUES (?)').run('Alice');
  const sportsman2 = db.prepare('INSERT INTO sportsmen (name) VALUES (?)').run('Bob');
  const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round.lastInsertRowid, sportsman.lastInsertRowid, 1);
  const attempt = db.prepare('INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)').run(entry.lastInsertRowid, 1);
  return {
    competitionId: comp.lastInsertRowid,
    roundId: round.lastInsertRowid,
    sportsmanId: sportsman.lastInsertRowid,
    sportsman2Id: sportsman2.lastInsertRowid,
    entryId: entry.lastInsertRowid,
    attemptId: attempt.lastInsertRowid,
  };
}

function seedAdmin() {
  const hash = bcrypt.hashSync('admin-secret', 10);
  db.prepare('INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Test Admin 2', 'admin2@test.com', hash, 'admin');
}

async function loginAdmin(app) {
  seedAdmin();
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email: 'admin2@test.com', password: 'admin-secret' });
  return agent;
}

function entryExists(entryId) {
  return !!db.prepare('SELECT id FROM entries WHERE id=?').get(entryId);
}

module.exports = { createApp, seedTestUsers, seedLeaderboardData, seedReferee, loginReferee, seedCompetitionData, seedAdmin, loginAdmin, entryExists };
