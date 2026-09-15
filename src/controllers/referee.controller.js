const { getCompetitionById } = require("../services/db/competitions.crud");
const { getGroupById } = require("../services/db/groups.crud");
const { getRoundByIdWithCompGroupInfo, getInProgressRoundsForUser } = require("../services/db/rounds.crud");
const { getAssignmentsForUser, getAssignmentWithInfo } = require("../services/db/panels.crud");
const { getAttemptContext } = require("../services/db/entries.crud");
const { addAttemptScoreDB, addAllElementScoresDB } = require("../services/db/scores.crud");
const { getRefereeRoundInfo } = require("../services/rounds");
const { renderNotFound } = require("../services/errors");
const { recomputeAttemptCompletion } = require("../services/attempts");
const { isWithinRange, rangeErrorMessage } = require("../services/referee-helpers");
const { parseAndValidateElementScores, parseAndValidate11thScore } = require("../services/scoring");

exports.getRefereeDashboard = (req, res) => {
    const userId = req.session.user.id;
    const rounds = getInProgressRoundsForUser(userId);
    res.render('referee/dashboard', { rounds });
};

exports.getRound = (req, res) => {
    const { cid, gid, rid } = req.params;
    const userId = req.session.user.id;

    const competition = getCompetitionById(cid);
    if (!competition) return renderNotFound(res, 'Competition not found');

    const group = getGroupById(gid);
    if (!group) return renderNotFound(res, 'Group not found');

    const round = getRoundByIdWithCompGroupInfo(rid, gid);
    if (!round) return renderNotFound(res, 'Round not found');

    const assignments = getAssignmentsForUser(round.competition_id, userId);

    if (round.status !== 'in_progress' || !round.current_attempt_id) {
        return res.render('referee/round', { round, attempt: null, inputs: [], state: 'not_started' });
    }
    if (assignments.length === 0) {
        return res.render('referee/round', { round, attempt: null, inputs: [], state: 'no_assignment' });
    }

    const { attempt, inputs } = getRefereeRoundInfo(round, userId);

    res.render('referee/round', { round, attempt, inputs, state: 'active' });
};


exports.postScore = (req, res) => {
    const { attemptId, judgeRoleId, score } = req.body;
    const userId = req.session.user.id;

    const ctx = getAttemptContext(attemptId);
    if (!ctx)
        return renderNotFound(res, 'Attempt not found');

    const assignment = getAssignmentWithInfo(ctx.competitionId, userId, judgeRoleId);
    if (!assignment)
        return res.status(403).send('Forbidden');
    if (assignment.granularity !== 'attempt')
        return res.status(400).send('This role is scored per trick, not per attempt.');
    if (ctx.elementCount === 0 && assignment.roleKey !== 'head_judge') {
        return res.status(400).send('No skills were performed for this attempt — this role does not apply.');
    }

    const parsed = parseFloat(score);
    if (isNaN(parsed) || !isWithinRange(parsed, assignment)) {
        return res.status(400).send(rangeErrorMessage(assignment));
    }

    addAttemptScoreDB(attemptId, assignment.assignment_id, assignment.judge_role_id, parsed);

    recomputeAttemptCompletion(attemptId, ctx.panelTemplateId);

    req.session.flash = { success: `Score ${parsed.toFixed(1)} saved.` };
    res.redirect(`/referee/competitions/${ctx.competitionId}/groups/${ctx.groupId}/rounds/${ctx.roundId}`);
};

exports.postElementScores = (req, res) => {
    const { attemptId, judgeRoleId } = req.body;
    const userId = req.session.user.id;

    const ctx = getAttemptContext(attemptId);
    if (!ctx)
        return renderNotFound(res, 'Attempt not found');

    const assignment = getAssignmentWithInfo(ctx.competitionId, userId, judgeRoleId);
    if (!assignment)
        return res.status(403).send('Forbidden');
    if (assignment.granularity !== 'element')
        return res.status(400).send('This role is scored per attempt, not per trick.');

    let parsedValues;
    try {
        parsedValues = parseAndValidateElementScores(assignment, ctx.elementCount, req.body);
    }
    catch (err) {
        return res.status(400).send(err.message);
    }

    // 11th line: landing or bonus
    try {
        const val_11 = parseAndValidate11thScore(assignment, ctx.elementCount, req.body.element_11);
        if (val_11 != null) 
            parsedValues.push(val_11);
    }
    catch (err) {
        return res.status(400).send(err.message);
    }

    addAllElementScoresDB(parsedValues, attemptId, assignment.assignment_id, assignment.judge_role_id);

    recomputeAttemptCompletion(attemptId, ctx.panelTemplateId);

    req.session.flash = { success: 'Scores saved.' };
    res.redirect(`/referee/competitions/${ctx.competitionId}/groups/${ctx.groupId}/rounds/${ctx.roundId}`);
};