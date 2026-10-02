const { createUser } = require('./users.service');
const { getUserByEmail, deleteAllUsersDB } = require('./db/users.crud');
const { getPanels, getJudgeRoles, addAssignment, deleteAllPanelAssignmentsDB } = require('./db/panels.crud');
const { createCompetitionDB, updateCompetitionStatusDB, deleteAllCompetitionsDB } = require('./db/competitions.crud');
const { addGroupDB, deleteAllGroupsDB } = require('./db/groups.crud');
const { addRoundDB, updateRoundStartedDB, deleteAllRoundsDB } = require('./db/rounds.crud');
const { addSportsmanDB, deleteAllSportsmenDB } = require('./db/sportsmen.crud');
const { addEntryDB, addAttemptDB, deleteAllEntriesDB, deleteAllAttemptsDB } = require('./db/entries.crud');
const { deleteAllScoresDB, deleteAllElementScoresDB } = require('./db/scores.crud');

// the synchro fixture uses pairs and the synchronisation device mark, so one referee can score a whole attempt by typing a single number
const FIXTURES = {
  individual: {
    panelKey: 'fig',
    athletes: [
      { name: 'Leon Weber', club: 'TSV München' },
      { name: 'Emma Fischer', club: 'SV Hamburg' },
    ],
    refereeRoleKey: 'time_of_flight',
  },
  synchro: {
    panelKey: 'test_synchro',
    athletes: [
      { name: 'Leon Weber', club: 'TSV München', partner: { name: 'Emma Fischer', club: 'SV Hamburg' } },
      { name: 'Anna Klein', club: 'TSV München', partner: { name: 'Mia Braun', club: 'TSV München' } },
    ],
    refereeRoleKey: 'synchronisation',
  },
};

// resets all tables and creates a fixed, small fixture for integration tests, staffed just enough to reach the turn-based scoring UI without going through head-judge.js
exports.seedTestData = async ({ type = 'individual' } = {}) => {
  const fixture = FIXTURES[type] || FIXTURES.individual;
  const competitionType = FIXTURES[type] ? type : 'individual';

  // wipe children before parents, matching the FK dependency order
  deleteAllElementScoresDB();
  deleteAllScoresDB();
  deleteAllAttemptsDB();
  deleteAllEntriesDB();
  deleteAllSportsmenDB();
  deleteAllPanelAssignmentsDB();
  deleteAllRoundsDB();
  deleteAllGroupsDB();
  deleteAllCompetitionsDB();
  deleteAllUsersDB();

  await createUser('Admin', 'admin@example.com', 'admin123', 'admin');

  await createUser('Maria Schmidt', 'maria@example.com', 'referee123', 'referee');
  const maria = getUserByEmail('maria@example.com');

  // Petra also holds the head_judge panel role so head-judge.js's tests can exercise Start/Next/Complete without a full roster
  await createUser('Petra Voss', 'petra@example.com', 'headjudge123', 'head_judge');
  const petra = getUserByEmail('petra@example.com');

  const panel = getPanels().find(p => p.key === fixture.panelKey);
  const competitionId = createCompetitionDB('Spring Championship', null, panel.id, competitionType).lastInsertRowid;
  updateCompetitionStatusDB(competitionId, 'active');

  const groupId = addGroupDB('Junior', 'JR', competitionId).lastInsertRowid;
  const roundId = addRoundDB(groupId, 'Qualifications', 1, 'sum').lastInsertRowid;

  const [sp1Id, sp2Id] = fixture.athletes.map(a =>
    addSportsmanDB(a.name, a.club, null, null, null, competitionId, groupId, a.partner).lastInsertRowid);

  const e1Id = addEntryDB(roundId, sp1Id, 1).lastInsertRowid;
  const e2Id = addEntryDB(roundId, sp2Id, 2).lastInsertRowid;

  const attempt1Id = addAttemptDB(e1Id, 1).lastInsertRowid;
  const attempt2Id = addAttemptDB(e1Id, 2).lastInsertRowid;
  const attempt3Id = addAttemptDB(e2Id, 1).lastInsertRowid;
  const attempt4Id = addAttemptDB(e2Id, 2).lastInsertRowid;

  // Maria judges a single-number role so the turn-based scoring UI is reachable without staffing/starting the round through head-judge.js
  const judgeRoles = getJudgeRoles();
  const refereeRoleId = judgeRoles.find(r => r.key === fixture.refereeRoleKey).id;
  const headJudgeRoleId = judgeRoles.find(r => r.key === 'head_judge').id;
  addAssignment(competitionId, maria.id, [refereeRoleId]);
  addAssignment(competitionId, petra.id, [headJudgeRoleId]);

  // round starts on Leon's first attempt, advancing turns is head-judge.js's job and isn't exercised here
  updateRoundStartedDB(roundId, attempt1Id);

  return {
    ok: true,
    competitionId: Number(competitionId),
    groupId: Number(groupId),
    roundId: Number(roundId),
    sp1Id: Number(sp1Id),
    sp2Id: Number(sp2Id),
    attempt1Id: Number(attempt1Id),
    attempt2Id: Number(attempt2Id),
    attempt3Id: Number(attempt3Id),
    attempt4Id: Number(attempt4Id),
    competitionType,
    // the role Maria judges, named per type since integration specs post scores against it
    ...(competitionType === 'synchro' ? { synchronisationRoleId: Number(refereeRoleId) } : { timeOfFlightRoleId: Number(refereeRoleId) }),
    headJudgeRoleId: Number(headJudgeRoleId),
    headJudgeUserId: Number(petra.id),
  };
};
