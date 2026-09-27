const { getAssignmentForCompetition } = require("./db/panels.crud");
const {
  getScoresForAttempt, getScoresForAssignment, getElementScoresForAttempt, getAttemptElementCount,
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

// breakdown is computeAttemptScore's result, already computed by the caller, so this never re-derives element-role scoring on its own
exports.loadJudgeSubmissionStatus = (panelTemplateId, competitionId, attemptId, breakdown) => {
  if (!panelTemplateId) return [];
  const assignments = getAssignmentForCompetition(competitionId, panelTemplateId);

  const scoresByAssignment = new Map();
  for (const row of getScoresForAssignment(attemptId)) {
    scoresByAssignment.set(row.panel_assignment_id, row.score);
  }
  const breakdownByRoleKey = new Map((breakdown || []).map(b => [b.judgeRoleKey, b]));

  const byRole = new Map();
  for (const a of assignments) {
    if (!byRole.has(a.role_key)) byRole.set(a.role_key, { key: a.role_key, name: a.role_name, granularity: a.granularity, judges: [] });
    if (a.granularity === 'element') {
      const roleBreakdown = breakdownByRoleKey.get(a.role_key);
      const personal = roleBreakdown?.perJudge?.find(pj => pj.assignmentId === a.assignment_id);
      byRole.get(a.role_key).judges.push({
        name: a.judge_name,
        submittedCount: personal?.submittedCount ?? 0,
        isDone: personal?.isComplete ?? false,
        value: personal?.value ?? null,
      });
    } else {
      const score = scoresByAssignment.has(a.assignment_id) ? scoresByAssignment.get(a.assignment_id) : null;
      byRole.get(a.role_key).judges.push({ name: a.judge_name, submittedCount: score !== null ? 1 : 0, isDone: score !== null, value: score });
    }
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
