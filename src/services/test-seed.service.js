const { createUser } = require('./users.service');
const { getUserByEmail, deleteAllUsersDB } = require('./db/users.crud');
const { getPanels, getJudgeRoles, addAssignment, getAssignmentWithInfo, deleteAllPanelAssignmentsDB } = require('./db/panels.crud');
const { createCompetitionDB, updateCompetitionStatusDB, deleteAllCompetitionsDB } = require('./db/competitions.crud');
const { addGroupDB, deleteAllGroupsDB } = require('./db/groups.crud');
const { addStartingGroupDB, addGroupToStartingGroupDB } = require('./db/starting-groups.crud');
const { addRoundDB, updateRoundsStartedDB, deleteAllRoundsDB } = require('./db/rounds.crud');
const { addSportsmanDB, deleteAllSportsmenDB } = require('./db/sportsmen.crud');
const { addEntryDB, addAttemptDB, deleteAllEntriesDB, deleteAllAttemptsDB } = require('./db/entries.crud');
const { deleteAllScoresDB, deleteAllElementScoresDB, addAttemptScoreDB, addAllElementScoresDB, updateAttemptElementCount } = require('./db/scores.crud');
const { recomputeAttemptCompletion } = require('./attempts.service');

// the scored fixture has one judge per role and Leon's first attempt fully scored, execution 2 - 0.3, difficulty 2.6, penalty 0.2, total 1.7 + 2.6 - 0.2 = 4.1
const SCORED_ATTEMPT = { elementCount: 2, execution: [0.2, 0.1], difficulty: [1.2, 1.4], headJudge: 0.2 };

// the synchro fixture uses pairs and the synchronisation device mark, so one referee can score a whole attempt by typing a single number
const FIXTURES = {
  individual: {
    panelKey: 'fig',
    athletes: [
      { name: 'Leon Weber', club: 'TSV München' },
      { name: 'Emma Fischer', club: 'SV Hamburg' },
    ],
    refereeRoleKey: 'time_of_flight',
    roleIdKey: 'timeOfFlightRoleId',
  },
  scored: {
    competitionType: 'individual',
    panelKey: 'test',
    athletes: [
      { name: 'Leon Weber', club: 'TSV München' },
      { name: 'Emma Fischer', club: 'SV Hamburg' },
    ],
    refereeRoleKey: 'execution',
    roleIdKey: 'executionRoleId',
    scoreFirstAttempt: true,
  },
  // two groups with one round each, run as one starting group and not started, staffed like the scored fixture
  startingGroup: {
    competitionType: 'individual',
    panelKey: 'test',
    athletes: [
      { name: 'Leon Weber', club: 'TSV München' },
      { name: 'Emma Fischer', club: 'SV Hamburg' },
    ],
    refereeRoleKey: 'execution',
    roleIdKey: 'executionRoleId',
    startingGroup: true,
  },
  synchro: {
    panelKey: 'test_synchro',
    athletes: [
      { name: 'Leon Weber', club: 'TSV München', partner: { name: 'Emma Fischer', club: 'SV Hamburg' } },
      { name: 'Anna Klein', club: 'TSV München', partner: { name: 'Mia Braun', club: 'TSV München' } },
    ],
    refereeRoleKey: 'synchronisation',
    roleIdKey: 'synchronisationRoleId',
  },
};

// writes the given judges' scores for one attempt and marks it scored
function scoreAttempt(attemptId, panelId, competitionId, judgeScores) {
  updateAttemptElementCount(attemptId, SCORED_ATTEMPT.elementCount);
  for (const { userId, roleId, elements, score } of judgeScores) {
    const assignmentId = getAssignmentWithInfo(competitionId, userId, roleId).assignment_id;
    if (elements) addAllElementScoresDB(elements.map((value, i) => [i + 1, value]), attemptId, assignmentId, roleId);
    else addAttemptScoreDB(attemptId, assignmentId, roleId, score);
  }
  recomputeAttemptCompletion(attemptId, panelId);
}

// a second group with one round, two athletes and two attempts each, put behind the first group in a new starting group
function seedSecondGroup(competitionId, firstGroupId) {
  const groupBId = addGroupDB('Youth', 'YT', competitionId).lastInsertRowid;
  const roundBId = addRoundDB(groupBId, 'Qualifications', 1, 'sum').lastInsertRowid;
  const [spB1Id, spB2Id] = [['Anna Klein', 'TSV München'], ['Mia Braun', 'SV Hamburg']].map(([name, club]) =>
    addSportsmanDB(name, club, null, null, null, competitionId, groupBId).lastInsertRowid);
  const attemptIds = [spB1Id, spB2Id].flatMap((spId, i) => {
    const entryId = addEntryDB(roundBId, spId, i + 1).lastInsertRowid;
    return [1, 2].map(n => Number(addAttemptDB(entryId, n).lastInsertRowid));
  });

  const startingGroupId = addStartingGroupDB(competitionId, 'Block 1').lastInsertRowid;
  addGroupToStartingGroupDB(firstGroupId, startingGroupId);
  addGroupToStartingGroupDB(groupBId, startingGroupId);

  const [attemptB1Id, attemptB2Id, attemptB3Id, attemptB4Id] = attemptIds;
  return {
    startingGroupId: Number(startingGroupId), groupBId: Number(groupBId), roundBId: Number(roundBId),
    spB1Id: Number(spB1Id), spB2Id: Number(spB2Id), attemptB1Id, attemptB2Id, attemptB3Id, attemptB4Id,
  };
}

// resets all tables and creates a fixed, small fixture for integration tests, staffed just enough to reach the turn-based scoring UI without going through head-judge.js
exports.seedTestData = async ({ type = 'individual' } = {}) => {
  const fixture = FIXTURES[type] || FIXTURES.individual;
  const competitionType = fixture.competitionType || (FIXTURES[type] ? type : 'individual');

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

  if (fixture.scoreFirstAttempt) {
    // Maria judges execution and difficulty, Petra the penalties, so every role of the panel has scores
    const difficultyRoleId = judgeRoles.find(r => r.key === 'difficulty').id;
    addAssignment(competitionId, maria.id, [difficultyRoleId]);
    scoreAttempt(attempt1Id, panel.id, competitionId, [
      { userId: maria.id, roleId: refereeRoleId, elements: SCORED_ATTEMPT.execution },
      { userId: maria.id, roleId: difficultyRoleId, elements: SCORED_ATTEMPT.difficulty },
      { userId: petra.id, roleId: headJudgeRoleId, score: SCORED_ATTEMPT.headJudge },
    ]);
  }

  let startingGroupResult = {};
  if (fixture.startingGroup) {
    const difficultyRoleId = judgeRoles.find(r => r.key === 'difficulty').id;
    addAssignment(competitionId, maria.id, [difficultyRoleId]);
    startingGroupResult = seedSecondGroup(competitionId, groupId);
  } else {
    // round starts on Leon's first attempt, advancing turns is head-judge.js's job and isn't exercised here
    updateRoundsStartedDB([roundId], attempt1Id);
  }

  return {
    ...startingGroupResult,
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
    // the role Maria judges, named per fixture since integration specs post scores against it
    [fixture.roleIdKey]: Number(refereeRoleId),
    headJudgeRoleId: Number(headJudgeRoleId),
    headJudgeUserId: Number(petra.id),
  };
};
