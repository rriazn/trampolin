const bcrypt = require('bcryptjs');
const { createUser } = require('./services/users');
const { getFirstAdminUser, getUserByEmail, createOrIgnoreUserDB } = require('./services/db/users.crud');
const { getPanels, getJudgeRoles, addAssignmentIgnoreDB } = require('./services/db/panels.crud');
const {
  getCompetitionByName, createCompetitionDB, updateCompetitionStatusDB, setPanelTemplateIfUnset,
} = require('./services/db/competitions.crud');
const { addGroupIgnoreDB } = require('./services/db/groups.crud');
const { addSportsmanDB } = require('./services/db/sportsmen.crud');

// 6 execution + 1 difficulty + 1 time_of_flight/horizontal_displacement (shared machine, one
// person) = 8 distinct referees. A judge may only hold one role per competition.
const REFEREES = [
  { name: 'Maria Schmidt',   email: 'maria@example.com' },
  { name: 'Thomas Müller',   email: 'thomas@example.com' },
  { name: 'Anna Kovacs',     email: 'anna@example.com' },
  { name: 'Pierre Dupont',   email: 'pierre@example.com' },
  { name: 'Sofia Rossi',     email: 'sofia@example.com' },
  { name: 'Julia Novak',     email: 'julia@example.com' },
  { name: 'Erik Larsson',    email: 'erik@example.com' },
  { name: 'Nina Petrova',    email: 'nina@example.com' },
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
  const existingAdmin = getFirstAdminUser();
  if (!existingAdmin) {
    await createUser('Administrator', 'admin@example.com', 'admin123', 'admin');
    console.log('Created admin: admin@example.com / admin123');
  } else {
    console.log('Admin already exists, skipping.');
  }

  const refHash = await bcrypt.hash('referee123', 10);
  let refCount = 0;
  for (const r of REFEREES) {
    const info = createOrIgnoreUserDB(r.name, r.email, refHash, 'referee');
    if (info.changes) refCount++;
  }
  console.log(`Created ${refCount} referee(s) (password: referee123)`);

  const refereeIds = REFEREES.map(r => getUserByEmail(r.email).id);

  const headJudgeHash = await bcrypt.hash('headjudge123', 10);
  const headJudgeInfo = createOrIgnoreUserDB(HEAD_JUDGE.name, HEAD_JUDGE.email, headJudgeHash, 'head_judge');
  if (headJudgeInfo.changes) console.log(`Created head judge: ${HEAD_JUDGE.email} / headjudge123`);
  const headJudgeId = getUserByEmail(HEAD_JUDGE.email).id;

  const panelTemplate = getPanels().find(p => p.key === PANEL_TEMPLATE_KEY);

  let comp = getCompetitionByName(COMPETITION_NAME);
  if (!comp) {
    const competitionId = createCompetitionDB(COMPETITION_NAME, null, panelTemplate.id).lastInsertRowid;
    updateCompetitionStatusDB(competitionId, 'active');
    comp = { id: competitionId };
    console.log(`Created competition: ${COMPETITION_NAME}`);
  } else {
    setPanelTemplateIfUnset(comp.id, panelTemplate.id);
    console.log('Competition already exists, skipping.');
  }

  const roleIdByKey = new Map(getJudgeRoles().map(r => [r.key, r.id]));
  // referees[0..5] -> execution (6), referees[6] -> difficulty, referees[7] -> time_of_flight
  // + horizontal_displacement (one person covers both, read off the same machine).
  for (const refereeId of refereeIds.slice(0, 6)) {
    addAssignmentIgnoreDB(comp.id, roleIdByKey.get('execution'), refereeId);
  }
  addAssignmentIgnoreDB(comp.id, roleIdByKey.get('difficulty'), refereeIds[6]);
  addAssignmentIgnoreDB(comp.id, roleIdByKey.get('time_of_flight'), refereeIds[7]);
  addAssignmentIgnoreDB(comp.id, roleIdByKey.get('horizontal_displacement'), refereeIds[7]);
  addAssignmentIgnoreDB(comp.id, roleIdByKey.get('head_judge'), headJudgeId);
  console.log(`Assigned judge panel for "${COMPETITION_NAME}" (fig panel).`);

  const groupMap = {};
  for (const g of GROUPS) {
    groupMap[g.name] = addGroupIgnoreDB(g.name, g.abbreviation, comp.id);
  }
  console.log(`Ensured ${GROUPS.length} group(s)`);

  let spCount = 0;
  for (const s of SPORTSMEN) {
    const info = addSportsmanDB(s.name, s.club, s.gender, s.birth_year, null, comp.id, groupMap[s.group]);
    if (info.changes) spCount++;
  }
  console.log(`Created ${spCount} athlete(s)`);
}

seed().catch(console.error);
