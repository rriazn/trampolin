const { getRoundOverview, getRoundSelectionOverview, loadRound } = require("../services/rounds.service");
const { rosterReadiness } = require("../services/panels.service");
const { getPreviousAttemptIndex, recomputeAttemptCompletion, getAttemptLabel } = require("../services/attempts.service");
const { parseAndValidateScore } = require("../services/scoring.service");
const { getNextPendingAttemptIdForRounds, updateAttemptSkippedDB } = require("../services/db/entries.crud");
const { updateRoundsStartedDB, updateRoundsCurrentAttemptDB, updateRoundsCompletedDB } = require("../services/db/rounds.crud");
const { getRunRounds, getCurrentRound, getStartingGroupInfo, collapseByStartingGroup } = require("../services/starting-groups.service");
const { getHeadJudgeAssignment } = require("../services/db/panels.crud");
const { addAttemptScoreDB, updateAttemptElementCount } = require("../services/db/scores.crud");

const roundUrl = (r) => `/head-judge/competitions/${r.competition_id}/groups/${r.group_id}/rounds/${r.id}`;

// after an action the page of the round that owns the current athlete, so the header matches the athlete
const currentRoundUrl = (round) => roundUrl(getCurrentRound(round));

// Dashboard
exports.getDashboard = (req, res) => {
    const user = req.session.user;
    const rounds = getRoundSelectionOverview(user.role, user.id);
    rounds.forEach(r => {
        r.isReady = rosterReadiness(r.competition_id, r.panel_template_id).isReady;
    });

    res.render('head-judge/dashboard', { rounds: collapseByStartingGroup(rounds) });
};

exports.getRound = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);

    // a starting group shares one current athlete, so the page of that athlete's group is the one to show
    const current = getCurrentRound(round);
    if (current.id !== round.id) return res.redirect(roundUrl(current));

    const readiness = rosterReadiness(round.competition_id, round.panel_template_id);
    const startingGroup = getStartingGroupInfo(round);

    if (round.status !== 'in_progress') {
        return res.render('head-judge/round', { round, readiness, attempt: null, checklist: [], startingGroup });
    }

    const roundOverview = getRoundOverview(round, req.session.user.id, readiness);
    const attemptLabel = getAttemptLabel(round, roundOverview.attempt.attempt_number, req.t);
    res.render('head-judge/round', { ...roundOverview, attemptLabel, startingGroup });
};

exports.startRound = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = roundUrl(round);
    const runRounds = getRunRounds(round);
    const runIds = runRounds.map(r => r.id);

    if (runRounds.some(r => r.status !== 'not_started')) {
        req.session.flash = { error: req.t('headJudge:flash.alreadyStarted') };
        return res.redirect(backUrl);
    }
    if (!rosterReadiness(round.competition_id, round.panel_template_id).isReady) {
        req.session.flash = { error: req.t('headJudge:flash.notFullyStaffed') };
        return res.redirect(backUrl);
    }

    const firstAttemptId = getNextPendingAttemptIdForRounds(runIds);
    if (!firstAttemptId) {
        req.session.flash = { error: req.t('headJudge:flash.noAttempts') };
        return res.redirect(backUrl);
    }

    updateRoundsStartedDB(runIds, firstAttemptId);
    req.session.flash = { success: req.t('headJudge:flash.started') };
    res.redirect(currentRoundUrl(round));
};

exports.backAttempt = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = roundUrl(round);
    const runIds = getRunRounds(round).map(r => r.id);

    if (round.status !== 'in_progress' && round.status !== 'completed') {
        req.session.flash = { error: req.t('headJudge:flash.notStartedYet') };
        return res.redirect(backUrl);
    }

    const { order, previousIndex } = getPreviousAttemptIndex(runIds, round.current_attempt_id);
    if (previousIndex < 0) {
        req.session.flash = { error: req.t('headJudge:flash.alreadyAtFirst') };
        return res.redirect(backUrl);
    }

    updateRoundsCurrentAttemptDB(runIds, order[previousIndex]);
    req.session.flash = { success: req.t('headJudge:flash.movedBack') };
    res.redirect(currentRoundUrl(round));
};

exports.nextAttempt = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = roundUrl(round);
    const runIds = getRunRounds(round).map(r => r.id);

    if (round.status !== 'in_progress' || !round.current_attempt_id) {
        req.session.flash = { error: req.t('headJudge:flash.notInProgress') };
        return res.redirect(backUrl);
    }

    const { isComplete } = recomputeAttemptCompletion(round.current_attempt_id, round.panel_template_id);
    if (!isComplete) {
        req.session.flash = { error: req.t('headJudge:flash.notAllSubmitted') };
        return res.redirect(currentRoundUrl(round));
    }

    const nextId = getNextPendingAttemptIdForRounds(runIds);
    if (nextId) {
        updateRoundsCurrentAttemptDB(runIds, nextId);
        req.session.flash = { success: req.t('headJudge:flash.advanced') };
    } else {
        updateRoundsCompletedDB(runIds);
        req.session.flash = { success: req.t('headJudge:flash.completed') };
    }
    res.redirect(currentRoundUrl(round));
};

exports.skipAttempt = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = roundUrl(round);
    const runIds = getRunRounds(round).map(r => r.id);

    if (round.status !== 'in_progress' || !round.current_attempt_id) {
        req.session.flash = { error: req.t('headJudge:flash.notInProgress') };
        return res.redirect(backUrl);
    }

    updateAttemptSkippedDB(round.current_attempt_id);

    const nextId = getNextPendingAttemptIdForRounds(runIds);
    if (nextId) {
        updateRoundsCurrentAttemptDB(runIds, nextId);
        req.session.flash = { success: req.t('headJudge:flash.skippedAdvanced') };
    } else {
        updateRoundsCompletedDB(runIds);
        req.session.flash = { success: req.t('headJudge:flash.skippedCompleted') };
    }
    res.redirect(currentRoundUrl(round));
};

exports.penaltyDeduction = (req, res) => {
    const { cid, gid, rid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = roundUrl(round);

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
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);

    updateRoundsCompletedDB(getRunRounds(round).map(r => r.id));
    req.session.flash = { success: req.t('headJudge:flash.markedCompleted') };
    res.redirect(roundUrl(round));
};

exports.updateElementCount = (req, res) => {
    const { cid, gid, rid, aid } = req.params;
    const { round, error } = loadRound(cid, gid, rid, req.t);
    if (error) return error(res);
    const backUrl = roundUrl(round);

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