const { createUser } = require('./users');
const { getUserByEmail, deleteAllUsersDB } = require('./db/users.crud');
const { getPanels, getJudgeRoles, addAssignment, deleteAllPanelAssignmentsDB } = require('./db/panels.crud');
const { createCompetitionDB, updateCompetitionStatusDB, deleteAllCompetitionsDB } = require('./db/competitions.crud');
const { addGroupDB, deleteAllGroupsDB } = require('./db/groups.crud');
const { addRoundDB, updateRoundStartedDB, deleteAllRoundsDB } = require('./db/rounds.crud');
const { addSportsmanDB, deleteAllSportsmenDB } = require('./db/sportsmen.crud');
const { addEntryDB, addAttemptDB, deleteAllEntriesDB, deleteAllAttemptsDB } = require('./db/entries.crud');
const { deleteAllScoresDB, deleteAllElementScoresDB } = require('./db/scores.crud');

// Resets all tables and creates a fixed, small fixture for integration tests: one fig-panel
// competition, one group, one round (started, on the first attempt), two athletes with two
// attempts each, and just enough of the judge panel staffed to reach the turn-based scoring UI
// without needing head-judge.js to fully staff/start the round.
exports.seedTestData = async () => {
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

  // Petra holds the head_judge panel role too (same identity, two capabilities per the plan), so
  // head-judge.js's own integration tests can exercise Start/Next/Complete without a full roster.
  await createUser('Petra Voss', 'petra@example.com', 'headjudge123', 'head_judge');
  const petra = getUserByEmail('petra@example.com');

  const figPanel = getPanels().find(p => p.key === 'fig');
  const competitionId = createCompetitionDB('Spring Championship', null, figPanel.id).lastInsertRowid;
  updateCompetitionStatusDB(competitionId, 'active');

  const groupId = addGroupDB('Junior', 'JR', competitionId).lastInsertRowid;
  const roundId = addRoundDB(groupId, 'Qualifications', 1, 'sum').lastInsertRowid;

  const sp1Id = addSportsmanDB('Leon Weber', 'TSV München', null, null, null, competitionId, groupId).lastInsertRowid;
  const sp2Id = addSportsmanDB('Emma Fischer', 'SV Hamburg', null, null, null, competitionId, groupId).lastInsertRowid;

  const e1Id = addEntryDB(roundId, sp1Id, 1).lastInsertRowid;
  const e2Id = addEntryDB(roundId, sp2Id, 2).lastInsertRowid;

  const attempt1Id = addAttemptDB(e1Id, 1).lastInsertRowid;
  const attempt2Id = addAttemptDB(e1Id, 2).lastInsertRowid;
  const attempt3Id = addAttemptDB(e2Id, 1).lastInsertRowid;
  const attempt4Id = addAttemptDB(e2Id, 2).lastInsertRowid;

  // Maria judges time_of_flight (a simple single attempt-level mark, no per-trick inputs) so the
  // turn-based scoring UI is directly reachable in integration tests without needing head-judge.js
  // to staff/start rounds through its own UI.
  const judgeRoles = getJudgeRoles();
  const timeOfFlightRoleId = judgeRoles.find(r => r.key === 'time_of_flight').id;
  const headJudgeRoleId = judgeRoles.find(r => r.key === 'head_judge').id;
  addAssignment(competitionId, maria.id, [timeOfFlightRoleId]);
  addAssignment(competitionId, petra.id, [headJudgeRoleId]);

  // Round starts on Leon's first attempt, matching the old fixture's implicit "ready to score"
  // state. Advancing turns (Next) is head-judge.js's job and isn't exercised by this fixture.
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
    timeOfFlightRoleId: Number(timeOfFlightRoleId),
    headJudgeRoleId: Number(headJudgeRoleId),
    headJudgeUserId: Number(petra.id),
  };
};
