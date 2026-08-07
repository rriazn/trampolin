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
  const panelTemplate = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)')
    .run('Test Competition', 'active', panelTemplate.id);
  const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('Test Round', comp.lastInsertRowid, 'TR');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Qualifications', 1);
  return { competitionId: comp.lastInsertRowid, groupId: group.lastInsertRowid, roundId: round.lastInsertRowid };
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
  const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('Test Group A', comp.lastInsertRowid, 'TGA');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Round A', 1);
  const sportsman = db.prepare('INSERT INTO sportsmen (name, competition_id) VALUES (?, ?)').run('Alice', comp.lastInsertRowid);
  const sportsman2 = db.prepare('INSERT INTO sportsmen (name, competition_id) VALUES (?, ?)').run('Bob', comp.lastInsertRowid);
  const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round.lastInsertRowid, sportsman.lastInsertRowid, 1);
  const attempt = db.prepare('INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)').run(entry.lastInsertRowid, 1);
  return {
    competitionId: comp.lastInsertRowid,
    groupId: group.lastInsertRowid,
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

// Competition assigned to the 'fig' panel template, plus a small pool of referee/head_judge
// users to assign to its judge roles. Only 2 referees are seeded (not the full 6 execution
// needs) since assignment-flow tests don't need every slot staffed.
function seedJudgesData() {
  const panelTemplate = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)')
    .run('Judges Test Cup', 'active', panelTemplate.id);

  const hash = bcrypt.hashSync('judge-secret', 10);
  const referee1 = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
    .run('Judge Referee One', 'judgeref1@test.com', hash, 'referee');
  const referee2 = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
    .run('Judge Referee Two', 'judgeref2@test.com', hash, 'referee');
  const headJudge = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
    .run('Judge Head Judge', 'judgehj@test.com', hash, 'head_judge');

  const roleIdByKey = Object.fromEntries(db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id]));

  return {
    competitionId: comp.lastInsertRowid,
    panelTemplateId: panelTemplate.id,
    roleIds: roleIdByKey,
    referee1Id: referee1.lastInsertRowid,
    referee2Id: referee2.lastInsertRowid,
    headJudgeId: headJudge.lastInsertRowid,
  };
}

// Competition on the 'fig' panel with one group/round/sportsman/entry/attempt (3 tricks), for
// referee/leaderboard scoring-flow tests. The round starts 'not_started' with no current
// attempt — callers use startRound() to advance it once assignments are in place.
function seedRefereeScoringData() {
  const panelTemplate = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)')
    .run('Referee Scoring Cup', 'active', panelTemplate.id);
  const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)')
    .run('Group A', comp.lastInsertRowid, 'GA');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)')
    .run(group.lastInsertRowid, 'Round A', 1);
  const sportsman = db.prepare('INSERT INTO sportsmen (name, club, competition_id, group_id) VALUES (?, ?, ?, ?)')
    .run('Alice', 'Test Club', comp.lastInsertRowid, group.lastInsertRowid);
  const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)')
    .run(round.lastInsertRowid, sportsman.lastInsertRowid, 1);
  const attempt = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, ?, ?)')
    .run(entry.lastInsertRowid, 1, 3);

  const roleIds = Object.fromEntries(db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id]));

  return {
    competitionId: comp.lastInsertRowid,
    groupId: group.lastInsertRowid,
    roundId: round.lastInsertRowid,
    sportsmanId: sportsman.lastInsertRowid,
    entryId: entry.lastInsertRowid,
    attemptId: attempt.lastInsertRowid,
    roleIds,
  };
}

// Assigns a user to a judge role for a competition and returns the panel_assignments.id.
function assignJudge(competitionId, judgeRoleId, userId) {
  db.prepare('INSERT OR IGNORE INTO panel_assignments (competition_id, judge_role_id, user_id) VALUES (?, ?, ?)')
    .run(competitionId, judgeRoleId, userId);
  return db.prepare('SELECT id FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
    .get(competitionId, judgeRoleId, userId).id;
}

// Puts a round 'in_progress' with the given attempt as its current turn.
function startRound(roundId, attemptId) {
  db.prepare("UPDATE rounds SET status='in_progress', current_attempt_id=? WHERE id=?").run(attemptId, roundId);
}

function getUserIdByEmail(email) {
  return db.prepare('SELECT id FROM users WHERE email=?').get(email).id;
}

function entryExists(entryId) {
  return !!db.prepare('SELECT id FROM entries WHERE id=?').get(entryId);
}

function getEntryStartOrders(roundId) {
  return db.prepare('SELECT start_order FROM entries WHERE round_id=? ORDER BY start_order').all(roundId).map(r => r.start_order);
}

module.exports = {
  createApp, seedTestUsers, seedLeaderboardData, seedReferee, loginReferee, seedCompetitionData,
  seedAdmin, loginAdmin, seedJudgesData, seedRefereeScoringData, assignJudge, startRound,
  getUserIdByEmail, entryExists, getEntryStartOrders, db,
};
