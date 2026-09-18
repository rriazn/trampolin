const { getAssignmentForCompetition } = require("./db/panels.crud");
const {
  getScoresForAttempt, getScoresForAssignment, getElementScoresForAttempt, getElementScoresForAttemptWithinElementCount,
  getElementScoresLandingBonus, getAttemptElementCount,
} = require("./db/scores.crud");
const { getEntryIdsForRound, addAttemptsDB, getOrderedAttemptIds, updateAttemptStatusDB } = require("./db/entries.crud");
const { loadPanelSlots } = require("./panels.service");
const { computeAttemptScore } = require("./scoring.service");



exports.loadAttemptScoreMaps = (attemptId) => {
  const scoresByJudgeRoleId = new Map();
  for (const row of getScoresForAttempt(attemptId)) {
    if (!scoresByJudgeRoleId.has(row.judge_role_id)) scoresByJudgeRoleId.set(row.judge_role_id, []);
    scoresByJudgeRoleId.get(row.judge_role_id).push(row.score);
  }
  const elementScores = getElementScoresForAttempt(attemptId);
  const elementScoresByJudgeRoleId = new Map();
  const elementScoresByAssignment = new Map();
  for (const row of elementScores) {
    if (!elementScoresByJudgeRoleId.has(row.judge_role_id)) elementScoresByJudgeRoleId.set(row.judge_role_id, new Map());
    const byElement = elementScoresByJudgeRoleId.get(row.judge_role_id);
    if (!byElement.has(row.element_number)) byElement.set(row.element_number, []);
    byElement.get(row.element_number).push(row.value);

    if (!elementScoresByAssignment.has(row.judge_role_id)) elementScoresByAssignment.set(row.judge_role_id, new Map());
    const byAssignment = elementScoresByAssignment.get(row.judge_role_id);
    if (!byAssignment.has(row.panel_assignment_id)) byAssignment.set(row.panel_assignment_id, new Map());
    byAssignment.get(row.panel_assignment_id).set(row.element_number, row.value);
  }
  return { scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementScoresByAssignment };
};

exports.loadJudgeSubmissionStatus = (panelTemplateId, competitionId, attemptId, elementCount) => {
  if (!panelTemplateId) return [];
  const assignments = getAssignmentForCompetition(competitionId, panelTemplateId);

  const scoresByAssignment = new Map();
  for (const row of getScoresForAssignment(attemptId)) {
    scoresByAssignment.set(row.panel_assignment_id, row.score);
  }
  // Disregard elements over the elementCount
  const elementsByAssignment = new Map();
  const filteredElementScores = getElementScoresForAttemptWithinElementCount(attemptId, elementCount);
  for (const row of filteredElementScores) {
    if (!elementsByAssignment.has(row.panel_assignment_id)) elementsByAssignment.set(row.panel_assignment_id, []);
    elementsByAssignment.get(row.panel_assignment_id).push({ number: row.element_number, value: row.value });
  }
  // 11th line: landing/bonus
  const landingBonusElement = getElementScoresLandingBonus(attemptId);
  const extraByAssignment = new Map();
  for (const row of landingBonusElement) {
    extraByAssignment.set(row.panel_assignment_id, row.value);
  }

  const byRole = new Map();
  for (const a of assignments) {
    if (!byRole.has(a.role_key)) byRole.set(a.role_key, { key: a.role_key, name: a.role_name, granularity: a.granularity, judges: [] });
    const elements = elementsByAssignment.get(a.assignment_id) || [];
    const landingApplies = a.granularity === 'element' && a.isDeduction && elementCount === 10;
    const bonusApplies = a.granularity === 'element' && !a.isDeduction;
    const extraValue = (landingApplies || bonusApplies) ? extraByAssignment.get(a.assignment_id) : undefined;
    const score = scoresByAssignment.has(a.assignment_id) ? scoresByAssignment.get(a.assignment_id) : null;
    const submittedCount = a.granularity === 'element'
      ? elements.length + (extraValue !== undefined ? 1 : 0)
      : (score !== null ? 1 : 0);
    const requiredCount = a.granularity === 'element' ? elementCount + (landingApplies ? 1 : 0) : 1;
    const isDone = a.granularity === 'element' ? submittedCount >= requiredCount : submittedCount >= 1;
    let value = score;
    if (a.granularity === 'element' && elements.length > 0) {
      const sum = elements.reduce((acc, el) => acc + el.value, 0) + (extraValue !== undefined ? extraValue : 0);
      value = a.isDeduction ? elementCount - sum : sum;
    }
    byRole.get(a.role_key).judges.push({ name: a.judge_name, submittedCount, isDone, value });
  }
  return [...byRole.values()];
};

exports.recomputeAttemptCompletion = (attemptId, panelTemplateId) => {
  const attempt = getAttemptElementCount(attemptId);
  const panelSlots = loadPanelSlots(panelTemplateId);
  const { scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementScoresByAssignment } = exports.loadAttemptScoreMaps(attemptId);
  const result = computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, attempt.element_count, elementScoresByAssignment);
  updateAttemptStatusDB(result.isComplete, attemptId);
  return result;
};

exports.createAttempts = (rid, attemptCount) => {
    const count = Math.min(Math.max(parseInt(attemptCount) || 2, 1), 20);
    const entries = getEntryIdsForRound(rid);
    addAttemptsDB(entries, count);
    return count;
};

exports.getPreviousAttemptIndex = (roundId, currentAttemptId) => {
    const order = getOrderedAttemptIds(roundId);
    const currentIndex = currentAttemptId ? order.indexOf(currentAttemptId) : order.length;
    const previousIndex = currentIndex - 1;
    return { order, previousIndex };
};
