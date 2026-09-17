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
    const { round, error } = loadRound(cid, gid, rid, req.t);
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
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (round.status !== 'not_started') {
        req.session.flash = { error: req.t('headJudge:flash.alreadyStarted') };
        return res.redirect(backUrl);
    }
    if (!rosterReadiness(round.competition_id, round.panel_template_id).isReady) {
        req.session.flash = { error: req.t('headJudge:flash.notFullyStaffed') };
        return res.redirect(backUrl);
    }

    const firstAttemptId = getNextPendingAttemptId(rid);
    if (!firstAttemptId) {
        req.session.flash = { error: req.t('headJudge:flash.noAttempts') };
        return res.redirect(backUrl);
    }

    updateRoundStartedDB(rid, firstAttemptId);
    req.session.flash = { success: req.t('headJudge:flash.started') };
    res.redirect(backUrl);
};

exports.backAttempt = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (round.status !== 'in_progress' && round.status !== 'completed') {
        req.session.flash = { error: req.t('headJudge:flash.notStartedYet') };
        return res.redirect(backUrl);
    }

    const { order, previousIndex } = getPreviousAttemptIndex(rid, round.current_attempt_id);
    if (previousIndex < 0) {
        req.session.flash = { error: req.t('headJudge:flash.alreadyAtFirst') };
        return res.redirect(backUrl);
    }

    updateRoundCurrentAttemptDB(rid, order[previousIndex]);
    req.session.flash = { success: req.t('headJudge:flash.movedBack') };
    res.redirect(backUrl);
};

exports.nextAttempt = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (round.status !== 'in_progress' || !round.current_attempt_id) {
        req.session.flash = { error: req.t('headJudge:flash.notInProgress') };
        return res.redirect(backUrl);
    }

    const { isComplete } = recomputeAttemptCompletion(round.current_attempt_id, round.panel_template_id);
    if (!isComplete) {
        req.session.flash = { error: req.t('headJudge:flash.notAllSubmitted') };
        return res.redirect(backUrl);
    }

    const nextId = getNextPendingAttemptId(rid);
    if (nextId) {
        updateRoundCurrentAttemptDB(rid, nextId);
        req.session.flash = { success: req.t('headJudge:flash.advanced') };
    } else {
        updateRoundCompletedDB(rid);
        req.session.flash = { success: req.t('headJudge:flash.completed') };
    }
    res.redirect(backUrl);
};

exports.skipAttempt = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (round.status !== 'in_progress' || !round.current_attempt_id) {
        req.session.flash = { error: req.t('headJudge:flash.notInProgress') };
        return res.redirect(backUrl);
    }

    updateAttemptSkippedDB(round.current_attempt_id);

    const nextId = getNextPendingAttemptId(rid);
    if (nextId) {
        updateRoundCurrentAttemptDB(rid, nextId);
        req.session.flash = { success: req.t('headJudge:flash.skippedAdvanced') };
    } else {
        updateRoundCompletedDB(rid);
        req.session.flash = { success: req.t('headJudge:flash.skippedCompleted') };
    }
    res.redirect(backUrl);
};

exports.penaltyDeduction = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (round.status !== 'in_progress' || !round.current_attempt_id) {
        req.session.flash = { error: req.t('headJudge:flash.notInProgress') };
        return res.redirect(backUrl);
    }
    if (String(round.current_attempt_id) !== String(req.body.attemptId)) {
        req.session.flash = { error: req.t('headJudge:flash.notCurrentAttempt') };
        return res.redirect(backUrl);
    }

    const assignment = getHeadJudgeAssignment(round.competition_id, req.session.user.id);
    if (!assignment) {
        req.session.flash = { error: req.t('headJudge:flash.noPenaltyRole') };
        return res.redirect(backUrl);
    }

    const { parsed, inRange } = parseAndValidateScore(req.body.score, assignment);

    if (!inRange) {
        req.session.flash = {
        error: assignment.score_max !== null
            ? req.t('headJudge:rangeError.max', { min: assignment.score_min, max: assignment.score_max })
            : req.t('headJudge:rangeError.min', { min: assignment.score_min }),
        };
        return res.redirect(backUrl);
    }

    addAttemptScoreDB(round.current_attempt_id, assignment.assignment_id, assignment.judge_role_id, parsed);

    recomputeAttemptCompletion(round.current_attempt_id, round.panel_template_id);

    req.session.flash = { success: req.t('headJudge:flash.penaltySaved', { score: parsed.toFixed(1) }) };
    res.redirect(backUrl);
};

exports.completeRound = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);

    updateRoundCompletedDB(rid);
    req.session.flash = { success: req.t('headJudge:flash.markedCompleted') };
    res.redirect(`/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`);
};

exports.updateElementCount = (req, res) => {
    const { cid, gid, rid, aid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

    if (String(round.current_attempt_id) !== String(aid)) {
        req.session.flash = { error: req.t('headJudge:flash.notCurrentAttempt') };
        return res.redirect(backUrl);
    }

    const elementCount = parseInt(req.body.element_count, 10);
    if (isNaN(elementCount) || elementCount < 0 || elementCount > 10) {
        req.session.flash = { error: req.t('headJudge:flash.trickCountInvalid') };
        return res.redirect(backUrl);
    }

    updateAttemptElementCount(aid, elementCount);
    req.session.flash = { success: req.t('headJudge:flash.trickCountSet', { count: elementCount }) };
    res.redirect(backUrl);
};