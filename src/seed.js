const bcrypt = require('bcryptjs');
const { createUser } = require('./services/users.service');
const { getFirstAdminUser, getUserByEmail, createOrIgnoreUserDB } = require('./services/db/users.crud');
const { getPanels, getJudgeRoles, addAssignmentIgnoreDB } = require('./services/db/panels.crud');
const {
  getCompetitionByName, createCompetitionDB, updateCompetitionStatusDB, setPanelTemplateIfUnset,
} = require('./services/db/competitions.crud');
const { addGroupIgnoreDB } = require('./services/db/groups.crud');
const { addSportsmanDB, getSportsmanByNameAndCompetition } = require('./services/db/sportsmen.crud');

// 8 distinct referees since a judge holds only one role per competition: 6 execution, 1 difficulty, 1 time_of_flight/horizontal_displacement sharing one machine
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
const VIEWER = { name: 'Public Viewer', email: 'viewer@example.com' };

const COMPETITION_NAME = 'Spring Championship';
const PANEL_TEMPLATE_KEY = 'fig';

const SYNCHRO_COMPETITION_NAME = 'Synchro Cup';
const SYNCHRO_PANEL_TEMPLATE_KEY = 'local_synchro';
const SYNCHRO_GROUP = { name: 'Synchro Pairs', abbreviation: 'SP' };

const PAIRS = [
  { name: 'Leon Weber',   club: 'TSV München',  gender: 'm', birth_year: 2008, partner: { name: 'Noah Becker',      club: 'TSV München', gender: 'm', birth_year: 2009 } },
  { name: 'Emma Fischer', club: 'SV Hamburg',   gender: 'f', birth_year: 2008, partner: { name: 'Laura Zimmermann', club: 'SV Hamburg',  gender: 'f', birth_year: 2007 } },
  { name: 'Felix Braun',  club: 'TV Frankfurt', gender: 'm', birth_year: 2002, partner: { name: 'Luca Schneider',   club: 'SC Berlin',   gender: 'm', birth_year: 2004 } },
  { name: 'Mia Hoffmann', club: 'SC Berlin',    gender: 'f', birth_year: 2010, partner: { name: 'Sophie Richter',   club: 'SC Berlin',   gender: 'f', birth_year: 2009 } },
];

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

  const viewerHash = await bcrypt.hash('viewer123', 10);
  const viewerInfo = createOrIgnoreUserDB(VIEWER.name, VIEWER.email, viewerHash, 'viewer');
  if (viewerInfo.changes) console.log(`Created viewer: ${VIEWER.email} / viewer123`);

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
  // referees[0..5] -> execution, referees[6] -> difficulty, referees[7] -> time_of_flight + horizontal_displacement
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
    if (getSportsmanByNameAndCompetition(s.name, comp.id)) continue;
    addSportsmanDB(s.name, s.club, s.gender, s.birth_year, null, comp.id, groupMap[s.group]);
    spCount++;
  }
  console.log(`Created ${spCount} athlete(s)`);

  await seedSynchroCompetition(refereeIds, headJudgeId, roleIdByKey);
}

// referees[0..1] -> execution trampoline 1, [2..3] -> execution trampoline 2, [4] -> difficulty, [5] -> synchronisation per skill
async function seedSynchroCompetition(refereeIds, headJudgeId, roleIdByKey) {
  const panelTemplate = getPanels().find(p => p.key === SYNCHRO_PANEL_TEMPLATE_KEY);

  let comp = getCompetitionByName(SYNCHRO_COMPETITION_NAME);
  if (!comp) {
    const competitionId = createCompetitionDB(SYNCHRO_COMPETITION_NAME, null, panelTemplate.id, 'synchro').lastInsertRowid;
    updateCompetitionStatusDB(competitionId, 'active');
    comp = { id: competitionId };
    console.log(`Created competition: ${SYNCHRO_COMPETITION_NAME}`);
  }

  for (const refereeId of refereeIds.slice(0, 2)) addAssignmentIgnoreDB(comp.id, roleIdByKey.get('execution_t1'), refereeId);
  for (const refereeId of refereeIds.slice(2, 4)) addAssignmentIgnoreDB(comp.id, roleIdByKey.get('execution_t2'), refereeId);
  addAssignmentIgnoreDB(comp.id, roleIdByKey.get('difficulty'), refereeIds[4]);
  addAssignmentIgnoreDB(comp.id, roleIdByKey.get('synchronisation_skill'), refereeIds[5]);
  addAssignmentIgnoreDB(comp.id, roleIdByKey.get('head_judge'), headJudgeId);
  console.log(`Assigned judge panel for "${SYNCHRO_COMPETITION_NAME}" (${SYNCHRO_PANEL_TEMPLATE_KEY} panel).`);

  const groupId = addGroupIgnoreDB(SYNCHRO_GROUP.name, SYNCHRO_GROUP.abbreviation, comp.id);

  let pairCount = 0;
  for (const p of PAIRS) {
    if (getSportsmanByNameAndCompetition(p.name, comp.id)) continue;
    addSportsmanDB(p.name, p.club, p.gender, p.birth_year, null, comp.id, groupId, p.partner);
    pairCount++;
  }
  console.log(`Created ${pairCount} pair(s)`);
}

module.exports = seed;

if (require.main === module) {
  seed().catch(console.error);
}
