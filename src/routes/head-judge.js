'use strict';
const router = require('express').Router();
const { requireHeadJudge } = require('../middleware/auth');
const headJudgeController = require('../controllers/head-judge.controller');

router.use(requireHeadJudge);

// ── Dashboard ────────────────────────────────────────────────────────────────────
router.get('/', headJudgeController.getDashboard);

// ── Rounds ───────────────────────────────────────────────────────────────────
router.get('/competitions/:cid/groups/:gid/rounds/:rid', headJudgeController.getRound);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/start', headJudgeController.startRound);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/complete', headJudgeController.completeRound);

// ── Attempts ───────────────────────────────────────────────────────────────────

router.post('/competitions/:cid/groups/:gid/rounds/:rid/back', headJudgeController.backAttempt);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/next', headJudgeController.nextAttempt);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/skip', headJudgeController.skipAttempt);

// ── Scoring ───────────────────────────────────────────────────────────────────

router.post('/competitions/:cid/groups/:gid/rounds/:rid/score', headJudgeController.penaltyDeduction);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/attempts/:aid/element-count', headJudgeController.updateElementCount);

module.exports = router;
