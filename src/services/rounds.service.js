const { getCompetitionById } = require("./db/competitions.crud");
const { getGroupById } = require("./db/groups.crud");
const { renderNotFound } = require("./errors.service");
const {
  getRoundByIdWithCompGroupInfo, getOrderedRoundGroupCompInfoAdmin, getOrderedRoundGroupCompInfoUser,
} = require("./db/rounds.crud");
const { getAttemptForId } = require("./db/entries.crud");
const { loadPanelSlots } = require("./panels.service");
const { loadAttemptScoreMaps, loadJudgeSubmissionStatus } = require("./attempts.service");
const { computeAttemptScore } = require("./scoring.service");
const { scoreStep, maxScoreFor } = require("./helpers/referee.helpers");
const {
  getHeadJudgeAssignment, getAssignmentsForUser,
} = require("./db/panels.crud");
const {
  getScoreForAttemptByPanelId, getElementScoreForAttemptAndAssignment, getScoreForAttemptAndAssignment,
} = require("./db/scores.crud");

exports.loadRound = (cid, gid, rid, t) => {
    const competition = getCompetitionById(cid);
    if (!competition) return { error: res => renderNotFound(res, t('errors:notFound.competition')) };
    const group = getGroupById(gid);
    if (!group) return { error: res => renderNotFound(res, t('errors:notFound.group')) };
    const round = getRoundByIdWithCompGroupInfo(rid, gid);
    if (!round) return { error: res => renderNotFound(res, t('errors:notFound.round')) };
    return { round };
};

exports.getRoundSelectionOverview = (userRole, userId) => {
    return userRole === 'admin'
        ? getOrderedRoundGroupCompInfoAdmin() : getOrderedRoundGroupCompInfoUser(userId);
};

exports.getRoundOverview = (round, userId, readiness) => {
    
    const attempt = getAttemptForId(round.current_attempt_id);

    const panelSlots = loadPanelSlots(round.panel_template_id);
    const { scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementScoresByAssignment } = loadAttemptScoreMaps(attempt.attempt_id);
    const { total, breakdown, isComplete } = computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, attempt.element_count, elementScoresByAssignment);
    const hasAnyScore = scoresByJudgeRoleId.size > 0 || elementScoresByJudgeRoleId.size > 0;
    const judgeStatus = loadJudgeSubmissionStatus(round.panel_template_id, round.competition_id, attempt.attempt_id, breakdown);

    // computeAttemptScore tracks element-granularity roles per-trick, not per-judge
    breakdown.forEach(item => {
        if (item.perTrick) {
        const roleStatus = judgeStatus.find(j => j.key === item.judgeRoleKey);
        item.count = roleStatus ? roleStatus.judges.filter(j => j.isDone).length : 0;
        }
    });

    const headJudgeAssignment = getHeadJudgeAssignment(round.competition_id, userId);
    let headJudgeScore = null;
    if (headJudgeAssignment) {
        const existing = getScoreForAttemptByPanelId(attempt.attempt_id, headJudgeAssignment.assignment_id);
        headJudgeScore = existing ? existing.score : null;
    }
    return { round, readiness, attempt, checklist: breakdown, judgeStatus,
        headJudgeAssignment, headJudgeScore, autoRefresh: true,
        attemptTotal: hasAnyScore ? total : null, attemptIsComplete: isComplete }
};

exports.getRefereeRoundInfo = (round, userId) => {
    const attempt = getAttemptForId(round.current_attempt_id);
    const assignments = getAssignmentsForUser(round.competition_id, userId);

    const panelSlots = loadPanelSlots(round.panel_template_id);
    const { scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementScoresByAssignment } = loadAttemptScoreMaps(attempt.attempt_id);
    const { breakdown } = computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, attempt.element_count, elementScoresByAssignment);
    const breakdownByRoleId = new Map(panelSlots.map((slot, i) => [slot.judgeRoleId, breakdown[i]]));

    const inputs = assignments.map(a => {
        const contribution = breakdownByRoleId.get(a.judge_role_id) || null;
        if (a.granularity === 'element') {
        const existing = getElementScoreForAttemptAndAssignment(attempt.attempt_id, a.assignment_id);
        const valueByElement = new Map(existing.map(e => [e.element_number, e.value]));
        const elements = [];
        for (let n = 1; n <= attempt.element_count; n++) {
            elements.push({ number: n, value: valueByElement.has(n) ? valueByElement.get(n) : null, kind: 'trick' });
        }
        // 11th line: landing (full 10-skill routines) or bonus for difficulty
        if (a.hasLanding && attempt.element_count === 10) {
            elements.push({ number: 11, value: valueByElement.has(11) ? valueByElement.get(11) : null, kind: 'landing' });
        } else if (!a.isDeduction && attempt.element_count > 0) {
            elements.push({ number: 11, value: valueByElement.has(11) ? valueByElement.get(11) : null, kind: 'bonus' });
            elements.push({ number: 12, value: valueByElement.has(12) ? valueByElement.get(12) : null, kind: 'missingSkill' });
        }
        // the judge's own score, not the role's contribution to the attempt, which is shared with the other judges and scaled by the slot multiplier
        const personal = contribution?.perJudge?.find(pj => pj.assignmentId === a.assignment_id);
        const ownValue = personal && personal.value !== null ? { value: personal.value, isComplete: personal.isComplete } : null;
        return { ...a, elements, ownValue };
        }
        // No skills were performed at all
        if (attempt.element_count === 0 && a.key !== 'head_judge') {
        return { ...a, notApplicable: true };
        }
        const existing = getScoreForAttemptAndAssignment(attempt.attempt_id, a.assignment_id);
        return { ...a, step: scoreStep(a.key), score_max: maxScoreFor(a.key, a.score_max, attempt.element_count), score: existing ? existing.score : null, contribution: existing ? contribution : null };
    });
    return { attempt, inputs };
};