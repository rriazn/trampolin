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

const SPORTSMEN = [
  { name: 'Leon Weber',       club: 'TSV München',     category: 'Junior Men' },
  { name: 'Emma Fischer',     club: 'SV Hamburg',      category: 'Junior Women' },
  { name: 'Noah Becker',      club: 'TSV München',     category: 'Junior Men' },
  { name: 'Mia Hoffmann',     club: 'SC Berlin',       category: 'Junior Women' },
  { name: 'Luca Schneider',   club: 'SC Berlin',       category: 'Senior Men' },
  { name: 'Hannah Wolf',      club: 'TV Frankfurt',    category: 'Senior Women' },
  { name: 'Felix Braun',      club: 'TV Frankfurt',    category: 'Senior Men' },
  { name: 'Laura Zimmermann', club: 'SV Hamburg',      category: 'Senior Women' },
  { name: 'Jonas Krause',     club: 'TSV München',     category: 'Senior Men' },
  { name: 'Sophie Richter',   club: 'SC Berlin',       category: 'Junior Women' },
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

  const insertSportsman = db.prepare('INSERT OR IGNORE INTO sportsmen (name,club,category) VALUES (?,?,?)');
  let spCount = 0;
  for (const s of SPORTSMEN) {
    const info = insertSportsman.run(s.name, s.club, s.category);
    if (info.changes) spCount++;
  }
  console.log(`Created ${spCount} sportsman/sportsmen`);
}

seed().catch(console.error);
