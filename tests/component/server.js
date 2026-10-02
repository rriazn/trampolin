'use strict';
process.env.DB_PATH = ':memory:';

const express = require('express');
const session = require('express-session');
const i18next = require('i18next');
const i18nextMiddleware = require('i18next-http-middleware');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../../src/db/database');
const { getAppVersion } = require('../../src/services/version.service');

// a scratch path so footer.spec.js can create/delete a VERSION file without touching the real one
const TEST_VERSION_PATH = path.join(__dirname, 'VERSION');

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

const NAMESPACES = ['common', 'login', 'admin', 'referee', 'headJudge', 'leaderboard', 'viewer', 'errors'];
const loadNamespaces = (lng) => Object.fromEntries(
  NAMESPACES.map(ns => [ns, require(`../../src/locales/${lng}/${ns}.json`)])
);

i18next.use(i18nextMiddleware.LanguageDetector).init({
  fallbackLng: 'en',
  preload: ['en', 'de'],
  ns: NAMESPACES,
  defaultNS: 'common',
  resources: {
    en: loadNamespaces('en'),
    de: loadNamespaces('de'),
  },
  detection: {
    order: ['session'],
    lookupSession: 'lng',
    caches: ['session'],
  },
});
app.use(i18nextMiddleware.handle(i18next));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || {};
  res.locals.appVersion = getAppVersion(TEST_VERSION_PATH);
  res.locals.currentUrl = req.originalUrl;
  Object.assign(res.locals, require('../../src/services/helpers/competitor.helpers'));
  delete req.session.flash;
  next();
});

app.get('/', (req, res) => {
  if (req.session.user) {
    const landing = { admin: '/admin', head_judge: '/head-judge', viewer: '/viewer' }[req.session.user.role] || '/referee';
    return res.redirect(landing);
  }
  res.redirect('/login');
});

app.use('/', require('../../src/routes/auth'));
app.use('/', require('../../src/routes/language'));
app.use('/leaderboard', require('../../src/routes/leaderboard'));
app.use('/referee', require('../../src/routes/referee'));
app.use('/head-judge', require('../../src/routes/head-judge'));
app.use('/viewer', require('../../src/routes/viewer'));
app.use('/admin', require('../../src/routes/admin'));

// test-only route for errors.spec.js to exercise the 500 error page
app.get('/test/throw', () => {
  throw new Error('boom');
});

// deletes all test data except the permanent admin account, called at the start of every seed
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

  // explicit created_at values since SQLite doesn't guarantee insertion-order tie breaks, and admin-dashboard.spec.js depends on Spring Cup sorting first
  const figPanel = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id, created_at) VALUES (?, ?, ?, ?)')
    .run('Spring Cup', 'active', figPanel.id, '2026-01-03T00:00:00.000Z');
  const autumnOpen = db.prepare('INSERT INTO competitions (name, date, created_at) VALUES (?, ?, ?)')
    .run('Autumn Open', '2026-09-15', '2026-01-02T00:00:00.000Z');
  db.prepare('INSERT INTO competitions (name, date, status, created_at) VALUES (?, ?, ?, ?)')
    .run('Winter Cup', '2025-12-15', 'closed', '2026-01-01T00:00:00.000Z');
  // judge panel fixture competition, dated even older so it never contends for "most recent"
  const panelComp = db.prepare('INSERT INTO competitions (name, status, panel_template_id, created_at) VALUES (?, ?, ?, ?)')
    .run('Panel Cup', 'active', figPanel.id, '2020-01-01T00:00:00.000Z');
  const group = db.prepare('INSERT INTO groups (competition_id, name, abbreviation) VALUES (?, ?, ?)').run(comp.lastInsertRowid, 'Group A', 'GA');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Qualifications', 1);
  const sp = db.prepare('INSERT INTO sportsmen (name, club, gender, birth_year, routine, competition_id, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run('Alice', 'Test Club', 'f', 2013, 'W11', comp.lastInsertRowid, group.lastInsertRowid);
  const sp2 = db.prepare('INSERT INTO sportsmen (name, club, competition_id, group_id) VALUES (?, ?, ?, ?)').run('Bob', 'Test Club 2', comp.lastInsertRowid, group.lastInsertRowid);
  const sp3 = db.prepare('INSERT INTO sportsmen (name, club, competition_id, group_id) VALUES (?, ?, ?, ?)').run('Dave', 'Test Club 3', comp.lastInsertRowid, group.lastInsertRowid);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Referee One', 'referee1@test.com', bcrypt.hashSync('ref123', 10), 'referee');
  const referee = db.prepare('SELECT id, email, created_at FROM users WHERE email=?').get('referee1@test.com');
  db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round.lastInsertRowid, sp.lastInsertRowid, 1);

  // round is 'in_progress' with no attempts yet, since admin-entries.spec.js depends on the entry starting at "0 attempts"
  const timeOfFlightRoleId = db.prepare("SELECT id FROM judge_roles WHERE key='time_of_flight'").get().id;
  db.prepare('INSERT INTO panel_assignments (competition_id, judge_role_id, user_id) VALUES (?, ?, ?)')
    .run(comp.lastInsertRowid, timeOfFlightRoleId, referee.id);
  db.prepare("UPDATE rounds SET status='in_progress' WHERE id=?").run(round.lastInsertRowid);

  const admin = db.prepare("SELECT id, email, created_at FROM users WHERE email='admin@test.com'").get();

  // judge pool for judges-assignment component/integration tests
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Judge Referee A', 'judgerefa@test.com', bcrypt.hashSync('ref123', 10), 'referee');
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Judge Referee B', 'judgerefb@test.com', bcrypt.hashSync('ref123', 10), 'referee');
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Judge Head Judge', 'judgehj@test.com', bcrypt.hashSync('hj123', 10), 'head_judge');
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Viewer One', 'viewer1@test.com', bcrypt.hashSync('view123', 10), 'viewer');
  const judgeRefA = db.prepare("SELECT id FROM users WHERE email='judgerefa@test.com'").get();
  const judgeRefB = db.prepare("SELECT id FROM users WHERE email='judgerefb@test.com'").get();
  const judgeHeadJudge = db.prepare("SELECT id FROM users WHERE email='judgehj@test.com'").get();

  res.json({
    competitionId: Number(comp.lastInsertRowid),
    groupId: Number(group.lastInsertRowid),
    roundId: Number(round.lastInsertRowid),
    sportsmanId: Number(sp.lastInsertRowid),
    sportsmanId2: Number(sp2.lastInsertRowid),
    sportsmanId3: Number(sp3.lastInsertRowid),
    referee1: { id: Number(referee.id), email: referee.email, created_at: referee.created_at.substring(0, 10) },
    admin: { id: Number(admin.id), email: admin.email, created_at: admin.created_at.substring(0, 10) },
    panelCompetitionId: Number(panelComp.lastInsertRowid),
    noPanelCompetitionId: Number(autumnOpen.lastInsertRowid),
    judgeRefAId: Number(judgeRefA.id),
    judgeRefBId: Number(judgeRefB.id),
    judgeHeadJudgeId: Number(judgeHeadJudge.id),
  });
});

// assigns `user` to `judgeRoleKey` for `competitionId`, using time_of_flight so a raw score flows straight through to the attempt total
function assignJudgeForFixture(competitionId, judgeRoleKey, userId) {
  const roleId = db.prepare('SELECT id FROM judge_roles WHERE key=?').get(judgeRoleKey).id;
  const info = db.prepare('INSERT INTO panel_assignments (competition_id, judge_role_id, user_id) VALUES (?, ?, ?)')
    .run(competitionId, roleId, userId);
  return { assignmentId: info.lastInsertRowid, roleId };
}

// Scored seed: three athletes with attempts and scores for leaderboard tests
app.post('/test/seed/scored', (req, res) => {
  cleanupDb();

  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test Referee', 'ref@test.com', bcrypt.hashSync('ref123', 10), 'referee');
  const referee = db.prepare('SELECT id FROM users WHERE email=?').get('ref@test.com');

  const figPanel = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)').run('Championship', 'active', figPanel.id);
  const group = db.prepare('INSERT INTO groups (competition_id, name, abbreviation) VALUES (?, ?, ?)').run(comp.lastInsertRowid, 'Group A', 'GA');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order, scoring_mode) VALUES (?, ?, ?, ?)').run(group.lastInsertRowid, 'Finals', 1, 'best_attempt');
  const { assignmentId, roleId } = assignJudgeForFixture(comp.lastInsertRowid, 'time_of_flight', referee.id);

  function addAthlete(name, startOrder, scores, routine = null) {
    const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id, routine) VALUES (?, ?, ?, ?)').run(name, comp.lastInsertRowid, group.lastInsertRowid, routine);
    const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round.lastInsertRowid, sp.lastInsertRowid, startOrder);
    const attemptIds = scores.map((score, i) => {
      const attempt = db.prepare('INSERT INTO attempts (entry_id, attempt_number, status) VALUES (?, ?, ?)').run(entry.lastInsertRowid, i + 1, 'scored');
      db.prepare('INSERT INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?, ?, ?, ?)')
        .run(attempt.lastInsertRowid, assignmentId, roleId, score);
      return attempt.lastInsertRowid;
    });
    return { sportsmanId: sp.lastInsertRowid, attemptIds };
  }

  const bob = addAthlete('Bob', 1, [9.2, 9.1], 'DMT');
  addAthlete('Charlie', 2, [8.8, 8.6]);
  addAthlete('Alice', 3, [8.5]);

  // round is 'in_progress' on Bob's already-scored first attempt so referee-round.spec.js can exercise real scoring against known values
  db.prepare("UPDATE rounds SET status='in_progress', current_attempt_id=? WHERE id=?")
    .run(bob.attemptIds[0], round.lastInsertRowid);

  res.json({
    competitionId: Number(comp.lastInsertRowid),
    groupId: Number(group.lastInsertRowid),
    roundId: Number(round.lastInsertRowid),
    bobAttempt1Id: Number(bob.attemptIds[0]),
    timeOfFlightRoleId: Number(roleId),
  });
});

// Sum-mode seed: two athletes with multiple attempts, for leaderboard "Total Score" tests
app.post('/test/seed/scored-sum', (req, res) => {
  cleanupDb();

  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test Referee', 'ref@test.com', bcrypt.hashSync('ref123', 10), 'referee');
  const referee = db.prepare('SELECT id FROM users WHERE email=?').get('ref@test.com');

  const figPanel = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)').run('Championship', 'active', figPanel.id);
  const group = db.prepare('INSERT INTO groups (competition_id, name, abbreviation) VALUES (?, ?, ?)').run(comp.lastInsertRowid, 'Group A', 'GA');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order, scoring_mode) VALUES (?, ?, ?, ?)').run(group.lastInsertRowid, 'Finals', 1, 'sum');
  const { assignmentId, roleId } = assignJudgeForFixture(comp.lastInsertRowid, 'time_of_flight', referee.id);

  function addAthlete(name, startOrder, scores) {
    const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run(name, comp.lastInsertRowid, group.lastInsertRowid);
    const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round.lastInsertRowid, sp.lastInsertRowid, startOrder);
    scores.forEach((score, i) => {
      const attempt = db.prepare('INSERT INTO attempts (entry_id, attempt_number, status) VALUES (?, ?, ?)').run(entry.lastInsertRowid, i + 1, 'scored');
      db.prepare('INSERT INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?, ?, ?, ?)')
        .run(attempt.lastInsertRowid, assignmentId, roleId, score);
    });
  }

  // Dana's best single attempt (9.0) beats Ellie's (8.0), but Ellie's sum (16.6) beats Dana's (16.5)
  addAthlete('Dana', 1, [9.0, 7.5]);
  addAthlete('Ellie', 2, [8.0, 8.6]);

  res.json({
    competitionId: Number(comp.lastInsertRowid),
    groupId: Number(group.lastInsertRowid),
    roundId: Number(round.lastInsertRowid),
  });
});

// two groups, for admin-entries.spec.js's regression test that only same-group athletes are offered as available entries
app.post('/test/seed/multi-group', (req, res) => {
  cleanupDb();

  const comp = db.prepare('INSERT INTO competitions (name, status) VALUES (?, ?)').run('Spring Cup', 'active');
  const groupA = db.prepare('INSERT INTO groups (competition_id, name, abbreviation) VALUES (?, ?, ?)').run(comp.lastInsertRowid, 'Group A', 'GA');
  const groupB = db.prepare('INSERT INTO groups (competition_id, name, abbreviation) VALUES (?, ?, ?)').run(comp.lastInsertRowid, 'Group B', 'GB');
  const roundA = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(groupA.lastInsertRowid, 'Qualifications', 1);
  const spA = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Fiona', comp.lastInsertRowid, groupA.lastInsertRowid);
  const spB = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Grace', comp.lastInsertRowid, groupB.lastInsertRowid);

  res.json({
    competitionId: Number(comp.lastInsertRowid),
    groupAId: Number(groupA.lastInsertRowid),
    groupBId: Number(groupB.lastInsertRowid),
    roundAId: Number(roundA.lastInsertRowid),
    sportsmanAId: Number(spA.lastInsertRowid),
    sportsmanBId: Number(spB.lastInsertRowid),
  });
});

// synchro competition with one pair on the current attempt, for the pair display and form specs, ?elementCount= shortens the routine
app.post('/test/seed/synchro', (req, res) => {
  cleanupDb();
  const elementCount = Number(req.query.elementCount) || 10;

  const localSynchro = db.prepare("SELECT id FROM panel_templates WHERE key='local_synchro'").get();
  const comp = db.prepare("INSERT INTO competitions (name, status, panel_template_id, type) VALUES (?, 'active', ?, 'synchro')")
    .run('Pairs Cup', localSynchro.id);
  const group = db.prepare('INSERT INTO groups (competition_id, name, abbreviation) VALUES (?, ?, ?)').run(comp.lastInsertRowid, 'Pairs A', 'PA');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order, scoring_mode) VALUES (?, ?, ?, ?)').run(group.lastInsertRowid, 'Pairs Final', 1, 'best_attempt');
  const pair = db.prepare(`
    INSERT INTO sportsmen (name, club, gender, birth_year, partner_name, partner_club, partner_gender, partner_birth_year, routine, competition_id, group_id)
    VALUES ('Leon Weber', 'TSV München', 'm', 2008, 'Emma Fischer', 'SV Hamburg', 'f', 2009, 'W11', ?, ?)
  `).run(comp.lastInsertRowid, group.lastInsertRowid);
  // a second pair from one shared club, to check the club collapses to a single name
  db.prepare(`
    INSERT INTO sportsmen (name, club, partner_name, partner_club, competition_id, group_id)
    VALUES ('Anna Klein', 'TSV München', 'Mia Braun', 'TSV München', ?, ?)
  `).run(comp.lastInsertRowid, group.lastInsertRowid);
  const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round.lastInsertRowid, pair.lastInsertRowid, 1);
  const attempt = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, ?, ?)').run(entry.lastInsertRowid, 1, elementCount);
  db.prepare("UPDATE rounds SET status='in_progress', current_attempt_id=? WHERE id=?").run(attempt.lastInsertRowid, round.lastInsertRowid);

  const hash = bcrypt.hashSync('ref123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Sync Execution Judge', 'syncexec@test.com', hash, 'referee');
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Sync Skill Judge', 'syncskill@test.com', hash, 'referee');
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Sync Device Judge', 'syncdevice@test.com', hash, 'referee');
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Sync Head Judge', 'synchj@test.com', bcrypt.hashSync('hj123', 10), 'head_judge');
  const assign = (email, roleKey) => {
    const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    const role = db.prepare('SELECT id FROM judge_roles WHERE key=?').get(roleKey);
    db.prepare('INSERT INTO panel_assignments (competition_id, judge_role_id, user_id) VALUES (?, ?, ?)').run(comp.lastInsertRowid, role.id, user.id);
  };
  assign('syncexec@test.com', 'execution_t1');
  assign('syncskill@test.com', 'synchronisation_skill');
  assign('syncdevice@test.com', 'synchronisation');
  assign('synchj@test.com', 'head_judge');

  const individualComp = db.prepare("INSERT INTO competitions (name, status) VALUES ('Solo Cup', 'active')").run();
  db.prepare('INSERT INTO sportsmen (name, competition_id) VALUES (?, ?)').run('Solo Athlete', individualComp.lastInsertRowid);

  res.json({
    competitionId: Number(comp.lastInsertRowid),
    groupId: Number(group.lastInsertRowid),
    roundId: Number(round.lastInsertRowid),
    pairId: Number(pair.lastInsertRowid),
    individualCompetitionId: Number(individualComp.lastInsertRowid),
  });
});

// Seed for previous-round ranking tests: Qualifications (scored) + Finals (empty)
app.post('/test/seed/finals', (req, res) => {
  cleanupDb();

  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test Referee', 'ref@test.com', bcrypt.hashSync('ref123', 10), 'referee');
  const referee = db.prepare('SELECT id FROM users WHERE email=?').get('ref@test.com');

  const figPanel = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)').run('Spring Cup', 'active', figPanel.id);
  const group = db.prepare('INSERT INTO groups (competition_id, name, abbreviation) VALUES (?, ?, ?)').run(comp.lastInsertRowid, 'Group A', 'GA');
  const round1 = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Qualifications', 1);
  const round2 = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Finals', 2);
  const { assignmentId, roleId } = assignJudgeForFixture(comp.lastInsertRowid, 'time_of_flight', referee.id);

  function addScored(name, startOrder, score) {
    const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run(name, comp.lastInsertRowid, group.lastInsertRowid);
    const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round1.lastInsertRowid, sp.lastInsertRowid, startOrder);
    const attempt = db.prepare('INSERT INTO attempts (entry_id, attempt_number, status) VALUES (?, ?, ?)').run(entry.lastInsertRowid, 1, 'scored');
    db.prepare('INSERT INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?, ?, ?, ?)')
      .run(attempt.lastInsertRowid, assignmentId, roleId, score);
    return sp.lastInsertRowid;
  }

  addScored('Alice', 1, 9.2); // rank #1
  addScored('Bob', 2, 8.5);   // rank #2

  res.json({
    competitionId: Number(comp.lastInsertRowid),
    groupId: Number(group.lastInsertRowid),
    round1Id: Number(round1.lastInsertRowid),
    round2Id: Number(round2.lastInsertRowid),
  });
});

// seed for head-judge and referee rendering specs: a fully-staffed 'local' panel, round not started, 2 athletes with a 1-trick attempt each
app.post('/test/seed/head-judge', (req, res) => {
  cleanupDb();

  const localPanel = db.prepare("SELECT id FROM panel_templates WHERE key='local'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)')
    .run('HJ Cup', 'active', localPanel.id);
  const group = db.prepare('INSERT INTO groups (competition_id, name, abbreviation) VALUES (?, ?, ?)').run(comp.lastInsertRowid, 'Group A', 'GA');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Finals', 1);

  const sp1 = db.prepare('INSERT INTO sportsmen (name, club, competition_id, group_id) VALUES (?, ?, ?, ?)').run('Leon Weber', 'TSV München', comp.lastInsertRowid, group.lastInsertRowid);
  const sp2 = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Noah Becker', comp.lastInsertRowid, group.lastInsertRowid);
  const entry1 = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, 1)').run(round.lastInsertRowid, sp1.lastInsertRowid);
  const entry2 = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, 2)').run(round.lastInsertRowid, sp2.lastInsertRowid);
  const attempt1 = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, 1, 1)').run(entry1.lastInsertRowid);
  const attempt2 = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, 1, 1)').run(entry2.lastInsertRowid);

  const roleIds = Object.fromEntries(db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id]));
  const insertAssignment = db.prepare('INSERT INTO panel_assignments (competition_id, judge_role_id, user_id) VALUES (?, ?, ?)');

  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('HJ Head Judge', 'hjhead@test.com', bcrypt.hashSync('hj123', 10), 'head_judge');
  const headJudge = db.prepare("SELECT id FROM users WHERE email='hjhead@test.com'").get();
  insertAssignment.run(comp.lastInsertRowid, roleIds.head_judge, headJudge.id);

  for (let i = 1; i <= 4; i++) {
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(`Exec Judge ${i}`, `hjexec${i}@test.com`, bcrypt.hashSync('ref123', 10), 'referee');
    const u = db.prepare('SELECT id FROM users WHERE email=?').get(`hjexec${i}@test.com`);
    insertAssignment.run(comp.lastInsertRowid, roleIds.execution, u.id);
  }

  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Diff Judge', 'hjdiff@test.com', bcrypt.hashSync('ref123', 10), 'referee');
  const diffJudge = db.prepare("SELECT id FROM users WHERE email='hjdiff@test.com'").get();
  insertAssignment.run(comp.lastInsertRowid, roleIds.difficulty, diffJudge.id);

  res.json({
    competitionId: Number(comp.lastInsertRowid),
    groupId: Number(group.lastInsertRowid),
    roundId: Number(round.lastInsertRowid),
    attempt1Id: Number(attempt1.lastInsertRowid),
    attempt2Id: Number(attempt2.lastInsertRowid),
    sportsman1Id: Number(sp1.lastInsertRowid),
    sportsman2Id: Number(sp2.lastInsertRowid),
  });
});

// Always ensure the test admin user exists so auth tests work without seeding
const adminHash = bcrypt.hashSync('admin123', 10);
db.prepare('INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
  .run('Test Admin', 'admin@test.com', adminHash, 'admin');

app.use((req, res) => {
  res.status(404).render('errors/404');
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('errors/500');
});

app.listen(3001, () => process.stdout.write('Component test server ready on :3001\n'));
