const { getCompetitionById } = require("./db/competitions.crud");
const { getGroupById } = require("./db/groups.crud");
const { renderNotFound } = require("./errors");
const {
  getRoundByIdWithCompGroupInfo, getOrderedRoundGroupCompInfoAdmin, getOrderedRoundGroupCompInfoUser,
} = require("./db/rounds.crud");
const { getAttemptForId } = require("./db/entries.crud");
const { loadPanelSlots } = require("./panels");
const { loadAttemptScoreMaps, loadJudgeSubmissionStatus } = require("./attempts");
const { computeAttemptScore } = require("./scoring");
const {
  getHeadJudgeAssignment, getAssignmentsForUser,
} = require("./db/panels.crud");
const {
  getScoreForAttemptByPanelId, getElementScoreForAttemptAndAssignment, getScoreForAttemptAndAssignment,
} = require("./db/scores.crud");

exports.loadRound = (cid, gid, rid) => {
    const competition = getCompetitionById(cid);
    if (!competition) return { error: res => renderNotFound(res, 'Competition not found') };
    const group = getGroupById(gid);
    if (!group) return { error: res => renderNotFound(res, 'Group not found') };
    const round = getRoundByIdWithCompGroupInfo(rid, gid);
    if (!round) return { error: res => renderNotFound(res, 'Round not found') };
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
    const judgeStatus = loadJudgeSubmissionStatus(round.panel_template_id, round.competition_id, attempt.attempt_id, attempt.element_count);

    // computeAttemptScore tracks element-granularity roles per-trick, not per-judge
    breakdown.forEach(item => {
        if (item.perTrick) {
        const roleStatus = judgeStatus.find(j => j.name === item.name);
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
        if (a.isDeduction && attempt.element_count === 10) {
            elements.push({ number: 11, value: valueByElement.has(11) ? valueByElement.get(11) : null, kind: 'landing' });
        } else if (!a.isDeduction && attempt.element_count > 0) {
            elements.push({ number: 11, value: valueByElement.has(11) ? valueByElement.get(11) : null, kind: 'bonus' });
        }
        const hasSubmitted = existing.length > 0;
        return { ...a, elements, contribution: hasSubmitted ? contribution : null };
        }
        // No skills were performed at all
        if (attempt.element_count === 0 && a.key !== 'head_judge') {
        return { ...a, notApplicable: true };
        }
        const existing = getScoreForAttemptAndAssignment(attempt.attempt_id, a.assignment_id);
        return { ...a, score: existing ? existing.score : null, contribution: existing ? contribution : null };
    });
    return { attempt, inputs };
};