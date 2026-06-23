const bcrypt = require('bcryptjs');
require('./db/database');
const db = require('./db/database');

const REFEREES = [
  { name: 'Maria Schmidt',   email: 'maria@example.com' },
  { name: 'Thomas Müller',   email: 'thomas@example.com' },
  { name: 'Anna Kovacs',     email: 'anna@example.com' },
  { name: 'Pierre Dupont',   email: 'pierre@example.com' },
  { name: 'Sofia Rossi',     email: 'sofia@example.com' },
];

const COMPETITION_NAME = 'Spring Championship';

const GROUPS = [
  { name: 'Junior Men' },
  { name: 'Junior Women' },
  { name: 'Senior Men' },
  { name: 'Senior Women' },
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

  let comp = db.prepare('SELECT id FROM competitions WHERE name=?').get(COMPETITION_NAME);
  if (!comp) {
    const result = db.prepare("INSERT INTO competitions (name, status) VALUES (?, 'active')").run(COMPETITION_NAME);
    comp = { id: result.lastInsertRowid };
    console.log(`Created competition: ${COMPETITION_NAME}`);
  } else {
    console.log('Competition already exists, skipping.');
  }

  const insertGroup = db.prepare('INSERT OR IGNORE INTO groups (name, competition_id) VALUES (?,?)');
  const groupMap = {};
  for (const g of GROUPS) {
    insertGroup.run(g.name, comp.id);
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
