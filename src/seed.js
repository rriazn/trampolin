const bcrypt = require('bcryptjs');
require('./db/database');
const db = require('./db/database');

const REFEREES = [
  { name: 'Maria Schmidt',   email: 'maria@example.com' },
  { name: 'Thomas Müller',   email: 'thomas@example.com' },
  { name: 'Anna Kovacs',     email: 'anna@example.com' },
  { name: 'Pierre Dupont',   email: 'pierre@example.com' },
  { name: 'Sofia Rossi',     email: 'sofia@example.com' },
  { name: 'Julia Novak',     email: 'julia@example.com' },
];

const HEAD_JUDGE = { name: 'Karl Weber', email: 'karl@example.com' };

const COMPETITION_NAME = 'Spring Championship';
const PANEL_TEMPLATE_KEY = 'fig';

const GROUPS = [
  { name: 'Junior Men',   abbreviation: 'JM' },
  { name: 'Junior Women', abbreviation: 'JW' },
  { name: 'Senior Men',   abbreviation: 'SM' },
  { name: 'Senior Women', abbreviation: 'SW' },
];

const SPORTSMEN = [
  { name: 'Leon Weber',       club: 'TSV München',  group: 'Junior Men',    gender: 'm', birth_year: 2008 },
  { name: 'Noah Becker',      club: 'TSV München',  group: 'Junior Men',    gender: 'm', birth_year: 2009 },
  { name: 'Jonas Krause',     club: 'TSV München',  group: 'Senior Men',    gender: 'm', birth_year: 2003 },
  { name: 'Felix Braun',      club: 'TV Frankfurt', group: 'Senior Men',    gender: 'm', birth_year: 2002 },
  { name: 'Luca Schneider',   club: 'SC Berlin',    group: 'Senior Men',    gender: 'm', birth_year: 2004 },
  { name: 'Emma Fischer',     club: 'SV Hamburg',   group: 'Junior Women',  gender: 'f', birth_year: 2008 },
  { name: 'Mia Hoffmann',     club: 'SC Berlin',    group: 'Junior Women',  gender: 'f', birth_year: 2010 },
  { name: 'Sophie Richter',   club: 'SC Berlin',    group: 'Junior Women',  gender: 'f', birth_year: 2009 },
  { name: 'Hannah Wolf',      club: 'TV Frankfurt', group: 'Senior Women',  gender: 'f', birth_year: 2001 },
  { name: 'Laura Zimmermann', club: 'SV Hamburg',   group: 'Senior Women',  gender: 'f', birth_year: 2003 },
];

async function seed() {
  const existing = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  if (!existing) {
    const hash = await bcrypt.hash('admin123', 12);
    db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
      .run('Administrator', 'admin@example.com', hash, 'admin');
    console.log('Created admin: admin@example.com / admin123');
  } else {
    console.log('Admin already exists, skipping.');
  }

  const refHash = await bcrypt.hash('referee123', 10);
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (name,email,password_hash,role) VALUES (?,?,?,?)');
  let refCount = 0;
  for (const r of REFEREES) {
    const info = insertUser.run(r.name, r.email, refHash, 'referee');
    if (info.changes) refCount++;
  }
  console.log(`Created ${refCount} referee(s) (password: referee123)`);

  const refereeIds = REFEREES.map(r => db.prepare('SELECT id FROM users WHERE email=?').get(r.email).id);

  const headJudgeHash = await bcrypt.hash('headjudge123', 10);
  const headJudgeInfo = insertUser.run(HEAD_JUDGE.name, HEAD_JUDGE.email, headJudgeHash, 'head_judge');
  if (headJudgeInfo.changes) console.log(`Created head judge: ${HEAD_JUDGE.email} / headjudge123`);
  const headJudgeId = db.prepare('SELECT id FROM users WHERE email=?').get(HEAD_JUDGE.email).id;

  const panelTemplate = db.prepare('SELECT id FROM panel_templates WHERE key=?').get(PANEL_TEMPLATE_KEY);

  let comp = db.prepare('SELECT id FROM competitions WHERE name=?').get(COMPETITION_NAME);
  if (!comp) {
    const result = db.prepare("INSERT INTO competitions (name, status, panel_template_id) VALUES (?, 'active', ?)")
      .run(COMPETITION_NAME, panelTemplate.id);
    comp = { id: result.lastInsertRowid };
    console.log(`Created competition: ${COMPETITION_NAME}`);
  } else {
    db.prepare('UPDATE competitions SET panel_template_id=? WHERE id=? AND panel_template_id IS NULL')
      .run(panelTemplate.id, comp.id);
    console.log('Competition already exists, skipping.');
  }

  const roleIdByKey = new Map(
    db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id])
  );
  const insertAssignment = db.prepare(
    'INSERT OR IGNORE INTO panel_assignments (competition_id,judge_role_id,user_id) VALUES (?,?,?)'
  );
  for (const refereeId of refereeIds) {
    insertAssignment.run(comp.id, roleIdByKey.get('execution'), refereeId);
  }
  insertAssignment.run(comp.id, roleIdByKey.get('difficulty'), refereeIds[0]);
  insertAssignment.run(comp.id, roleIdByKey.get('time_of_flight'), refereeIds[1]);
  insertAssignment.run(comp.id, roleIdByKey.get('horizontal_displacement'), refereeIds[2]);
  insertAssignment.run(comp.id, roleIdByKey.get('head_judge'), headJudgeId);
  console.log(`Assigned judge panel for "${COMPETITION_NAME}" (fig panel).`);

  const insertGroup = db.prepare('INSERT OR IGNORE INTO groups (name, competition_id, abbreviation) VALUES (?,?,?)');
  const groupMap = {};
  for (const g of GROUPS) {
    insertGroup.run(g.name, comp.id, g.abbreviation);
    const row = db.prepare('SELECT id FROM groups WHERE name=? AND competition_id=?').get(g.name, comp.id);
    groupMap[g.name] = row.id;
  }
  console.log(`Ensured ${GROUPS.length} group(s)`);

  const insertSportsman = db.prepare(
    'INSERT OR IGNORE INTO sportsmen (name,club,gender,birth_year,competition_id,group_id) VALUES (?,?,?,?,?,?)'
  );
  let spCount = 0;
  for (const s of SPORTSMEN) {
    const info = insertSportsman.run(s.name, s.club, s.gender, s.birth_year, comp.id, groupMap[s.group]);
    if (info.changes) spCount++;
  }
  console.log(`Created ${spCount} athlete(s)`);
}

seed().catch(console.error);
