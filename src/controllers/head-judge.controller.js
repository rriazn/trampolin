const { getRoundOverview, getRoundSelectionOverview, loadRound } = require("../services/rounds");
const { rosterReadiness } = require("../services/panels");
const { getPreviousAttemptIndex, recomputeAttemptCompletion } = require("../services/attempts");
const { parseAndValidateScore } = require("../services/scoring");
const { getNextPendingAttemptId, updateAttemptSkippedDB } = require("../services/db/entries.crud");
const { updateRoundStartedDB, updateRoundCurrentAttemptDB, updateRoundCompletedDB } = require("../services/db/rounds.crud");
const { getHeadJudgeAssignment } = require("../services/db/panels.crud");
const { addAttemptScoreDB, updateAttemptElementCount } = require("../services/db/scores.crud");


// Dashboard
exports.getDashboard = (req, res) => {
    const user = req.session.user;
    const rounds = getRoundSelectionOverview(user.role, user.id);
    rounds.forEach(r => {
        r.isReady = rosterReadiness(r.competition_id, r.panel_template_id).isReady;
    });

    res.render('head-judge/dashboard', { rounds });
};

exports.getRound = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid);
    if (error) return error(res);

    const readiness = rosterReadiness(round.competition_id, round.panel_template_id);

    if (round.status !== 'in_progress') {
        return res.render('head-judge/round', { round, readiness, attempt: null, checklist: [] });
    }

    const roundOverview = getRoundOverview(round, req.session.user.id, readiness);
    res.render('head-judge/round', roundOverview);
};

exports.startRound = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (round.status !== 'not_started') {
        req.session.flash = { error: 'This round has already been started.' };
        return res.redirect(backUrl);
    }
    if (!rosterReadiness(round.competition_id, round.panel_template_id).isReady) {
        req.session.flash = { error: 'The judge panel is not fully staffed yet. Assign all required judges first.' };
        return res.redirect(backUrl);
    }

    const firstAttemptId = getNextPendingAttemptId(rid);
    if (!firstAttemptId) {
        req.session.flash = { error: 'This round has no attempts to score yet.' };
        return res.redirect(backUrl);
    }

    updateRoundStartedDB(rid, firstAttemptId);
    req.session.flash = { success: 'Round started.' };
    res.redirect(backUrl);
};

exports.backAttempt = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (round.status !== 'in_progress' && round.status !== 'completed') {
        req.session.flash = { error: 'This round has not been started yet.' };
        return res.redirect(backUrl);
    }

    const { order, previousIndex } = getPreviousAttemptIndex(rid, round.current_attempt_id);
    if (previousIndex < 0) {
        req.session.flash = { error: 'Already at the first attempt, there is nothing before it.' };
        return res.redirect(backUrl);
    }

    updateRoundCurrentAttemptDB(rid, order[previousIndex]);
    req.session.flash = { success: 'Moved back to the previous attempt.' };
    res.redirect(backUrl);
};

exports.nextAttempt = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (round.status !== 'in_progress' || !round.current_attempt_id) {
        req.session.flash = { error: 'This round is not in progress.' };
        return res.redirect(backUrl);
    }

    const { isComplete } = recomputeAttemptCompletion(round.current_attempt_id, round.panel_template_id);
    if (!isComplete) {
        req.session.flash = { error: 'Not every judge has submitted a score for the current attempt yet.' };
        return res.redirect(backUrl);
    }

    const nextId = getNextPendingAttemptId(rid);
    if (nextId) {
        updateRoundCurrentAttemptDB(rid, nextId);
        req.session.flash = { success: 'Advanced to the next attempt.' };
    } else {
        updateRoundCompletedDB(rid);
        req.session.flash = { success: 'Round completed — every attempt has been scored.' };
    }
    res.redirect(backUrl);
};

exports.skipAttempt = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (round.status !== 'in_progress' || !round.current_attempt_id) {
        req.session.flash = { error: 'This round is not in progress.' };
        return res.redirect(backUrl);
    }

    updateAttemptSkippedDB(round.current_attempt_id);

    const nextId = getNextPendingAttemptId(rid);
    if (nextId) {
        updateRoundCurrentAttemptDB(rid, nextId);
        req.session.flash = { success: 'Attempt skipped; advanced to the next attempt.' };
    } else {
        updateRoundCompletedDB(rid);
        req.session.flash = { success: 'Attempt skipped; round completed, no attempts remain.' };
    }
    res.redirect(backUrl);
};

exports.penaltyDeduction = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (round.status !== 'in_progress' || !round.current_attempt_id) {
        req.session.flash = { error: 'This round is not in progress.' };
        return res.redirect(backUrl);
    }
    if (String(round.current_attempt_id) !== String(req.body.attemptId)) {
        req.session.flash = { error: 'That attempt is not the round\'s current attempt.' };
        return res.redirect(backUrl);
    }

    const assignment = getHeadJudgeAssignment(round.competition_id, req.session.user.id);
    if (!assignment) {
        req.session.flash = { error: 'You do not hold the head judge scoring role for this competition.' };
        return res.redirect(backUrl);
    }

    const { parsed, inRange } = parseAndValidateScore(req.body.score, assignment);

    if (!inRange) {
        req.session.flash = {
        error: assignment.score_max !== null
            ? `Score must be between ${assignment.score_min} and ${assignment.score_max}.`
            : `Score must be at least ${assignment.score_min}.`,
        };
        return res.redirect(backUrl);
    }

    addAttemptScoreDB(round.current_attempt_id, assignment.assignment_id, assignment.judge_role_id, parsed);

    recomputeAttemptCompletion(round.current_attempt_id, round.panel_template_id);

    req.session.flash = { success: `Head judge penalty ${parsed.toFixed(1)} saved.` };
    res.redirect(backUrl);
};

exports.completeRound = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { error } = loadRound(cid, gid, rid);
    if (error) return error(res);

    updateRoundCompletedDB(rid);
    req.session.flash = { success: 'Round marked as completed.' };
    res.redirect(`/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`);
};

exports.updateElementCount = (req, res) => {
    const { cid, gid, rid, aid } = req.params;
    const { round, error } = loadRound(cid, gid, rid);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (String(round.current_attempt_id) !== String(aid)) {
        req.session.flash = { error: 'That attempt is not the round\'s current attempt.' };
        return res.redirect(backUrl);
    }

    const elementCount = parseInt(req.body.element_count, 10);
    if (isNaN(elementCount) || elementCount < 0 || elementCount > 10) {
        req.session.flash = { error: 'Trick count must be between 0 and 10.' };
        return res.redirect(backUrl);
    }

    updateAttemptElementCount(aid, elementCount);
    req.session.flash = { success: `Trick count set to ${elementCount}.` };
    res.redirect(backUrl);
};