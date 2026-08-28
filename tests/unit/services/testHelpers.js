// Bridges into the app's CommonJS require graph so every helper here shares the SAME in-memory
// db instance the services under test use — a plain `import` of src/db/database.js would create
// a second, separate :memory: database instead of the one require()'d internally by src/.
import { createRequire } from 'module';
import bcrypt from 'bcryptjs';
const require = createRequire(import.meta.url);
const db = require('../../../src/db/database.js');

let seq = 0;

export function nextSeq() {
  seq += 1;
  return seq;
}

export function makeUser(role = 'referee', name) {
  const n = nextSeq();
  const email = `u${n}@test.com`;
  const info = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name || `User ${n}`, email, bcrypt.hashSync('secret123', 4), role);
  return { id: info.lastInsertRowid, email, role };
}

export function getPanelTemplateId(key) {
  return db.prepare('SELECT id FROM panel_templates WHERE key=?').get(key).id;
}

export function getJudgeRoleIds() {
  return Object.fromEntries(db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id]));
}

// Returns the real competition row (snake_case columns, as getCompetitionById would) plus a
// panelTemplateId convenience alias — services take the row itself, not just its id
export function makeCompetition({ panelKey = 'test', status = 'active', name } = {}) {
  const n = nextSeq();
  const panelTemplateId = panelKey ? getPanelTemplateId(panelKey) : null;
  const info = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)')
    .run(name || `Comp ${n}`, status, panelTemplateId);
  const row = db.prepare('SELECT * FROM competitions WHERE id=?').get(info.lastInsertRowid);
  return { ...row, panelTemplateId };
}

export function makeGroup(competitionId, name) {
  const n = nextSeq();
  const info = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)')
    .run(name || `Group ${n}`, competitionId, `G${n}`);
  return { id: info.lastInsertRowid };
}

export function makeRound(groupId, { name, order = 1, status = 'not_started', currentAttemptId = null } = {}) {
  const n = nextSeq();
  const info = db.prepare('INSERT INTO rounds (group_id, name, round_order, status, current_attempt_id) VALUES (?, ?, ?, ?, ?)')
    .run(groupId, name || `Round ${n}`, order, status, currentAttemptId);
  return { id: info.lastInsertRowid };
}

export function makeSportsman(competitionId, groupId, name) {
  const n = nextSeq();
  const info = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)')
    .run(name || `Athlete ${n}`, competitionId, groupId || null);
  return { id: info.lastInsertRowid };
}

export function makeEntry(roundId, sportsmanId, startOrder) {
  const info = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)')
    .run(roundId, sportsmanId, startOrder);
  return { id: info.lastInsertRowid };
}

export function makeAttempt(entryId, attemptNumber, elementCount = 10) {
  const info = db.prepare('INSERT INTO attempts (entry_id, attempt_number, element_count) VALUES (?, ?, ?)')
    .run(entryId, attemptNumber, elementCount);
  return { id: info.lastInsertRowid };
}

export function assignJudge(competitionId, judgeRoleId, userId) {
  db.prepare('INSERT OR IGNORE INTO panel_assignments (competition_id, judge_role_id, user_id) VALUES (?, ?, ?)')
    .run(competitionId, judgeRoleId, userId);
  return db.prepare('SELECT id FROM panel_assignments WHERE competition_id=? AND judge_role_id=? AND user_id=?')
    .get(competitionId, judgeRoleId, userId).id;
}

export function addScore(attemptId, assignmentId, judgeRoleId, score) {
  db.prepare('INSERT OR REPLACE INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?,?,?,?)')
    .run(attemptId, assignmentId, judgeRoleId, score);
}

export function addElementScore(attemptId, assignmentId, judgeRoleId, elementNumber, value) {
  db.prepare('INSERT OR REPLACE INTO element_scores (attempt_id, panel_assignment_id, judge_role_id, element_number, value) VALUES (?,?,?,?,?)')
    .run(attemptId, assignmentId, judgeRoleId, elementNumber, value);
}

export { db, require };
